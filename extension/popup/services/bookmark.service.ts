import { Event, Filter, SimplePool, finalizeEvent } from 'nostr-tools';
import { RelayService } from './relay.service';
import { ProcessedBookmark, NostrEvent, BookmarkListEvent } from '../../common/types'; // Corrected import path
import { hexToBytes } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';

declare global {
  interface Window {
    nostr: {
      getPublicKey: () => Promise<string>;
      getSecretKey: () => Promise<string>;
      signEvent: (event: any) => Promise<any>;
      getRelays: () => Promise<{ [url: string]: { read: boolean; write: boolean; } }>;
    };
  }
}

// Remove old Bookmark interface definition

export class BookmarkService {
  private relayService: RelayService;
  
  // Well-known public relays to try as fallback
  private fallbackRelays: string[] = [
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://relay.damus.io',
    'wss://nostr.land',
    'wss://relay.primal.net'
  ];

  constructor(relayService: RelayService) {
    this.relayService = relayService;
  }

  /**
   * Attempts to fetch a single note from multiple public relays as a fallback.
   * @param eventId The ID of the note to fetch
   * @returns The note content and timestamp if found, or null if not found
   */
  public async fetchNoteFallback(eventId: string): Promise<{ content: string; created_at: number } | null> {
    const pool = this.relayService.getPool();
    
    // Try the user's connected relays first, then fall back to public relays
    let relaysToTry = this.relayService.getConnectedRelays();
    
    if (relaysToTry.length === 0) {
      relaysToTry = this.fallbackRelays;
    }
    
    try {
      const filter: Filter = {
        ids: [eventId],
        kinds: [1]
      };
      
      const event = await pool.get(relaysToTry, filter);
      
      if (event) {
        return {
          content: event.content,
          created_at: event.created_at
        };
      } else {
        // If no event found in connected relays, try the fallback relays
        if (JSON.stringify(relaysToTry) !== JSON.stringify(this.fallbackRelays)) {
          const fallbackEvent = await pool.get(this.fallbackRelays, filter);
          if (fallbackEvent) {
            return {
              content: fallbackEvent.content,
              created_at: fallbackEvent.created_at
            };
          }
        }
        
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  // Add a helper method to ensure relays are connected and ready before use
  private async ensureRelayConnections(relays: string[]): Promise<string[]> {
    if (relays.length === 0) {
      return [];
    }
    
    const pool = this.relayService.getPool();
    
    // Try to connect to each relay with a timeout
    const connectionResults = await Promise.allSettled(
      relays.map(async (relay) => {
        try {
          await Promise.race([
            pool.ensureRelay(relay),
            new Promise((_, reject) => setTimeout(() => 
              reject(new Error(`Connection timeout for ${relay}`)), 5000)
            )
          ]);
          return relay;
        } catch (err) {
          return null;
        }
      })
    );
    
    // Filter out failed connections
    const connectedRelays = connectionResults
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => (result as PromiseFulfilledResult<string>).value);
    
    return connectedRelays;
  }

  /**
   * Fetches the user's latest bookmark list event (kind 10003)
   * and parses its tags into an array of ProcessedBookmark objects.
   * @param publicKey The user's public key (hex format).
   * @returns A promise that resolves to an array of ProcessedBookmark objects, sorted newest first.
   */
  async fetchBookmarks(publicKey: string): Promise<ProcessedBookmark[]> {
    const connectedRelayUrls = this.relayService.getConnectedRelays();
    
    // If no connected relays, try to connect to fallback relays
    let relaysToUse = connectedRelayUrls.length > 0 ? connectedRelayUrls : this.fallbackRelays;
    
    if (relaysToUse.length === 0) {
      console.warn("[BookmarkService] Could not connect to any relays. Using mock data for testing.");
    }

    try {
      // Prepare filter for fetching bookmarks - kind:10003 is a replaceable event per NIP-01
      const filter: Filter = {
        authors: [publicKey],
        kinds: [10003],
        // Set a higher limit to increase chance of getting the most recent event
        limit: 5
      };

      const pool = this.relayService.getPool();
      
      // Use querySync with a reasonable timeout
      const bookmarkEvents = await pool.querySync(
        relaysToUse, 
        filter,
        { maxWait: 1500 } // 10 second timeout
      );
      
      if (bookmarkEvents.length === 0) {
        // Try again without the 'since' filter
        const bookmarkListEvent = await pool.querySync(relaysToUse, { ...filter });
        if (bookmarkListEvent.length > 0) {
          const bookmarks = this.parseBookmarkEvent(bookmarkListEvent[0] as BookmarkListEvent);
          const updatedBookmarks = await this.fetchNoteContentsForBookmarks(bookmarks, relaysToUse);
          return updatedBookmarks;
        }
        
        return [];
      }
      
      // Sort by createdAt, newest first
      const sortedEvents = [...bookmarkEvents].sort((a, b) => b.created_at - a.created_at);
      
      // Use the most recent event (highest created_at timestamp)
      let bookmarkListEvent = sortedEvents[0];
      
      // Parse the tags to get bookmarks
      const bookmarks = this.parseBookmarkEvent(bookmarkListEvent as BookmarkListEvent);
      
      // Fetch content for each note bookmark directly using fallback method
      const updatedBookmarks = await Promise.all(
        bookmarks.map(async (bookmark) => {
          if (bookmark.type === 'note') {
            try {
              const noteData = await this.fetchNoteFallback(bookmark.eventId);
              if (noteData) {
                return {
                  ...bookmark,
                  content: noteData.content,
                  createdAt: noteData.created_at // Use the original note's timestamp
                };
              }
            } catch (e) {
              console.error(`[BookmarkService] Error fetching content for note ${bookmark.eventId}:`, e);
            }
          }
          return bookmark;
        })
      );

      return updatedBookmarks;
    } catch (error) {
      console.error("[BookmarkService] Error fetching bookmarks:", error);
      return [];
    }
  }

  /**
   * Fetches content for 'note' type bookmarks using their event IDs.
   * @param bookmarks Initial list of parsed bookmarks.
   * @param relayUrls Relays to query.
   * @returns The list of bookmarks, updated with note content where available.
   */
  private async fetchNoteContentsForBookmarks(
    bookmarks: ProcessedBookmark[],
    relayUrlsUsedForList: string[]
  ): Promise<ProcessedBookmark[]> {
    const noteBookmarks = bookmarks.filter(b => b.type === 'note') as Extract<ProcessedBookmark, { type: 'note' }>[];
    if (noteBookmarks.length === 0) {
      return bookmarks;
    }

    const eventIdsToFetch = noteBookmarks.map(b => b.eventId);

    const noteFilter: Filter = {
      ids: eventIdsToFetch,
      kinds: [1],
    };

    const noteEvents: Event[] = [];
    const pool = this.relayService.getPool();
    const currentConnectedRelays = this.relayService.getConnectedRelays();

    return new Promise((resolve, reject) => {
      let sub: { close: () => void } | null = null;
      const queryTimeout = 10000;
      let eoseReceivedCount = 0;
      const expectedEoseCount = currentConnectedRelays.length;
      let timeoutHit = false;

      if (expectedEoseCount === 0) {
        console.warn("[BookmarkService] No connected relays to fetch note content from. Skipping fetch.");
        resolve(bookmarks);
        return;
      }

      const completeSubscription = () => {
        if (sub) {
          sub.close();
          sub = null;
          const noteContentMap = new Map<string, { content: string; created_at: number }>();
          noteEvents.forEach((event: Event) => {
            if (!noteContentMap.has(event.id)) {
              noteContentMap.set(event.id, { 
                content: event.content,
                created_at: event.created_at
              });
            }
          });

          const updatedBookmarks = bookmarks.map(bookmark => {
            if (bookmark.type === 'note' && noteContentMap.has(bookmark.eventId)) {
              const noteData = noteContentMap.get(bookmark.eventId)!;
              return {
                ...bookmark,
                content: noteData.content,
                createdAt: noteData.created_at // Use the original note's timestamp
              };
            }
            return bookmark;
          });
          resolve(updatedBookmarks);
        } else {
          console.warn("[BookmarkService] completeSubscription called but subscription already closed.");
        }
      };
      
      const timer = setTimeout(() => {
        timeoutHit = true;
        completeSubscription();
      }, queryTimeout);

      try {
        sub = pool.subscribe(currentConnectedRelays, noteFilter, { 
          onevent: (event: Event) => {
            noteEvents.push(event); 
          },
          oneose: () => {
            eoseReceivedCount++;
            if (eoseReceivedCount >= expectedEoseCount && !timeoutHit) {
              clearTimeout(timer);
              completeSubscription();
            }
          },
          onclose: (reason) => {
            if (!timeoutHit && sub) { 
              clearTimeout(timer);
              completeSubscription();
            }
          }
        });
      } catch (error) {
        clearTimeout(timer);
        resolve(bookmarks);
      }
    });
  }

  /**
   * Parses the tags of a kind 10003 event into ProcessedBookmark objects.
   * @param event The kind 10003 Nostr event.
   * @returns An array of ProcessedBookmark objects, sorted newest first.
   */
  private parseBookmarkEvent(event: BookmarkListEvent): ProcessedBookmark[] {
    const bookmarks: ProcessedBookmark[] = [];
    
    event.tags.forEach((tag: string[]) => {
      try {
        // Check if this is a 'r' tag (URL bookmark)
        if (tag[0] === 'r' && tag.length >= 2) {
          const url = tag[1];
          if (this.isValidUrl(url)) {
            const title = tag.length > 2 ? tag[2] : this.extractTitleFromUrl(url);
            // Use URL as the ID for website bookmarks
            const id = url;
            bookmarks.push({
              id,
              type: 'website',
              title,
              url,
              eventId: event.id,
              createdAt: event.created_at
            });
          }
        }
        // Check if this is an 'e' tag (note bookmark)
        else if (tag[0] === 'e' && tag.length >= 2) {
          const eventId = tag[1];
          const relayHint = tag.length > 2 ? tag[2] : undefined;
          const noteTitle = tag.length > 3 ? tag[3] : 'Nostr Note';
          // Use the note event ID as the bookmark ID
          const id = eventId;
          bookmarks.push({
            id,
            type: 'note',
            title: noteTitle,
            eventId,
            relayHint,
            createdAt: event.created_at
          });
        }
      } catch (error) {
        console.error(`[BookmarkService] Error parsing bookmark tag:`, error, tag);
      }
    });

    // Sort by createdAt, newest first
    const sortedBookmarks = bookmarks.sort((a, b) => {
      return b.createdAt - a.createdAt;
    });
    
    return sortedBookmarks;
  }

  /**
   * Extracts a title from a URL by looking at the pathname.
   * @param url The URL to extract a title from.
   * @returns A formatted title string.
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      let title = parsedUrl.hostname.replace('www.', '');
      
      // If we have a path besides just '/', include it in the title
      if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
        // Remove trailing slash, split by '/', take the last segment
        const pathSegment = parsedUrl.pathname.replace(/\/$/, '').split('/').pop();
        if (pathSegment) {
          // Convert kebab-case or snake_case to Title Case
          const formattedSegment = pathSegment
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
          title += ` - ${formattedSegment}`;
        }
      }
      
      return title;
    } catch (e) {
      return url;
    }
  }

  private isValidUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  /**
   * Deletes a bookmark by creating a new kind 10003 event without the specified bookmark
   * @param bookmarkId The ID of the bookmark to delete (event ID for notes, URL for websites)
   * @param publicKey The user's public key
   * @returns A promise that resolves when the bookmark is deleted
   */
  async deleteBookmark(bookmarkId: string, publicKey: string, secretKey: string): Promise<void> {
    const currentBookmarks = await this.fetchBookmarks(publicKey);

    const bookmarkToDelete = currentBookmarks.find(b => b.id === bookmarkId);
    if (!bookmarkToDelete) {
      throw new Error(`Bookmark with ID ${bookmarkId} not found`);
    }
    
    const updatedBookmarks = currentBookmarks.filter(b => b.id !== bookmarkId);

    if (currentBookmarks.length === updatedBookmarks.length) {
      throw new Error(`Failed to remove bookmark from list`);
    }
    
    // Create new event tags from the remaining bookmarks
    const tags: string[][] = [];
    
    updatedBookmarks.forEach(bookmark => {
      if (bookmark.type === 'website') {
        tags.push(['r', bookmark.url, bookmark.title]);
      } else if (bookmark.type === 'note') {
        const tag = ['e', bookmark.eventId];
        if (bookmark.relayHint) tag.push(bookmark.relayHint);
        if ('title' in bookmark) tag.push(bookmark.title);
        tags.push(tag);
      }
    });

    // Find the timestamp of the most recent event
    let latestTimestamp = 0;
    let latestEventId = '';
    try {
      // Use the same filter as in fetchBookmarks
      const filter: Filter = {
        authors: [publicKey],
        kinds: [10003],
        limit: 10,
      };
      
      // Get connected relays
      const relays = this.relayService.getConnectedRelays();
      const connectedRelays = await this.ensureRelayConnections(relays);
      
      if (connectedRelays.length > 0) {
        // Get the current events to find the highest timestamp
        const pool = this.relayService.getPool();
        const events = await pool.querySync(connectedRelays, filter, { maxWait: 5000 });
        
        if (events.length > 0) {
          // Sort events by timestamp
          const sortedEvents = [...events].sort((a, b) => b.created_at - a.created_at);
          
          // Use the most recent event
          latestTimestamp = sortedEvents[0].created_at;
          latestEventId = sortedEvents[0].id;
        }
      }
    } catch (error) {
      // Continue anyway, we'll use current time
    }
    
    // Create the event with a timestamp that's guaranteed to be newer
    // We add 1 to the latest timestamp or use current time, whichever is greater
    const currentTime = Math.floor(Date.now() / 1000);
    const newTimestamp = Math.max(latestTimestamp + 1, currentTime);
    
    // Create a proper kind:10003 replaceable event according to NIP-01 and NIP-51
    const event: any = {
      kind: 10003, // Bookmarks list (a replaceable event per NIP-01)
      created_at: newTimestamp,
      tags,
      content: '', // Empty content for bookmark list events
      pubkey: publicKey
    };

    try {
      // Convert nsec format to hex if needed
      let hexSecretKey = secretKey;
      if (secretKey.startsWith('nsec')) {
        const { type, data } = nip19.decode(secretKey);
        if (type !== 'nsec') {
          throw new Error('Invalid nsec private key format');
        }
        hexSecretKey = bytesToHex(data);
      }
      
      // Convert the hex string secretKey to Uint8Array
      const secretKeyBytes = hexToBytes(hexSecretKey);
      
      const signedEvent = finalizeEvent(event, secretKeyBytes);
      const relays = this.relayService.getConnectedRelays();
      const pool = this.relayService.getPool();
      await pool.publish(relays, signedEvent);

    } catch (error) {
      console.error('[BookmarkService] Error during bookmark deletion process:', error);
      throw error;
    }
  }
}