import { Event, Filter, SimplePool, finalizeEvent } from 'nostr-tools';
import { RelayService } from './relay.service';
import { ProcessedBookmark, NostrEvent, BookmarkListEvent } from '../../common/types'; // Corrected import path

declare global {
  interface Window {
    nostr: {
      signEvent: (event: any) => Promise<NostrEvent>;
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
   * @returns The note content if found, or null if not found
   */
  public async fetchNoteFallback(eventId: string): Promise<string | null> {
    console.log(`[BookmarkService] Using fallback method to fetch note: ${eventId}`);
    const pool = this.relayService.getPool();
    
    // Try the user's connected relays first, then fall back to public relays
    let relaysToTry = this.relayService.getConnectedRelays();
    
    if (relaysToTry.length === 0) {
      console.log(`[BookmarkService] No connected relays. Using fallback relays.`);
      relaysToTry = this.fallbackRelays;
    } else {
      console.log(`[BookmarkService] Using ${relaysToTry.length} connected relays first.`);
    }
    
    try {
      const filter: Filter = {
        ids: [eventId],
        kinds: [1]
      };
      
      console.log(`[BookmarkService] Attempting direct fetch of note ${eventId} from relays: ${relaysToTry.join(', ')}`);
      // Direct use of get() for a simple query that doesn't require a full subscription 
      const event = await pool.get(relaysToTry, filter);
      
      if (event) {
        console.log(`[BookmarkService] Successfully fetched note ${eventId}`);
        return event.content;
      } else {
        // If no event found in connected relays, try the fallback relays
        if (JSON.stringify(relaysToTry) !== JSON.stringify(this.fallbackRelays)) {
          console.log(`[BookmarkService] Note not found in connected relays. Trying fallback relays.`);
          const fallbackEvent = await pool.get(this.fallbackRelays, filter);
          if (fallbackEvent) {
            console.log(`[BookmarkService] Successfully fetched note ${eventId} from fallback relays`);
            return fallbackEvent.content;
          }
        }
        
        console.log(`[BookmarkService] Note ${eventId} not found in any relay`);
        return null;
      }
    } catch (error) {
      console.error(`[BookmarkService] Error during fallback fetch:`, error);
      return null;
    }
  }

  /**
   * Fetches the user's latest bookmark list event (kind 10003)
   * and parses its tags into an array of ProcessedBookmark objects.
   * @param publicKey The user's public key (hex format).
   * @returns A promise that resolves to an array of ProcessedBookmark objects, sorted newest first.
   */
  async fetchBookmarks(publicKey: string): Promise<ProcessedBookmark[]> {
    console.log(`[BookmarkService] Fetching bookmark list for pubkey: ${publicKey}`);

    // Get connected relays
    const connectedRelayUrls = this.relayService.getConnectedRelays();
    console.log(`[BookmarkService] Currently connected relays: ${JSON.stringify(connectedRelayUrls)}`);

    // If no connected relays, try to connect to fallback relays
    let relaysToUse = connectedRelayUrls;
    if (relaysToUse.length === 0) {
      console.warn("[BookmarkService] No connected relays, will try fallback relays");
      relaysToUse = this.fallbackRelays;
      // Try to connect to fallback relays explicitly
      try {
        // Use timeout to prevent hanging
        const connectPromise = new Promise<void>((resolve, reject) => {
          const pool = this.relayService.getPool();
          
          // Try to connect to at least one fallback relay
          const connectionPromises = this.fallbackRelays.map(relay => {
            return pool.ensureRelay(relay)
              .then(() => console.log(`[BookmarkService] Connected to fallback relay: ${relay}`))
              .catch(err => console.warn(`[BookmarkService] Failed to connect to fallback relay ${relay}:`, err));
          });
          
          // Resolve after all connection attempts, even if some fail
          Promise.allSettled(connectionPromises)
            .then(() => resolve())
            .catch(err => reject(err));
        });
        
        // Set timeout for connection attempts
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error("Connection timeout")), 8000);
        });
        
        await Promise.race([connectPromise, timeoutPromise]);
      } catch (error) {
        console.error("[BookmarkService] Error connecting to fallback relays:", error);
        // Continue anyway, we'll still try to fetch
      }
    }

    // Prepare filter for fetching bookmarks
    const filter: Filter = {
      authors: [publicKey],
      kinds: [10003],
      limit: 1,
    };

    try {
      console.log(`[BookmarkService] Fetching bookmark list with filter:`, filter);
      console.log(`[BookmarkService] Using relays:`, relaysToUse);
      
      // First attempt - use get() with a timeout
      const bookmarkPromise = this.relayService.getPool().get(relaysToUse, filter);
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 10000); // 10 second timeout
      });
      
      const bookmarkListEvent: Event | null = await Promise.race([bookmarkPromise, timeoutPromise]);
      
      if (!bookmarkListEvent) {
        console.log(`[BookmarkService] Timeout or no kind:10003 event found for pubkey ${publicKey}.`);
        
        // Mock data for testing - this will show 3 bookmarks
        if (relaysToUse.length === 0) {
          console.log("[BookmarkService] No relays available, returning mock data for testing");
          
          const mockBookmarks: ProcessedBookmark[] = [
            {
              id: 'mock-1',
              type: 'website',
              title: 'Example Website 1',
              url: 'https://example.com/1',
              createdAt: Date.now() / 1000,
              eventId: 'mock-event-1'
            },
            {
              id: 'mock-2',
              type: 'website',
              title: 'Example Website 2',
              url: 'https://example.com/2',
              createdAt: Date.now() / 1000 - 3600, // 1 hour ago
              eventId: 'mock-event-2'
            },
            {
              id: 'mock-3',
              type: 'website',
              title: 'Example Website 3',
              url: 'https://example.com/3',
              createdAt: Date.now() / 1000 - 7200, // 2 hours ago
              eventId: 'mock-event-3'
            }
          ];
          
          return mockBookmarks;
        }
        
        return [];
      }
      
      console.log(`[BookmarkService] Found kind:10003 event:`, bookmarkListEvent.id);

      // Initial parsing of tags
      let bookmarks = this.parseBookmarkEvent(bookmarkListEvent as BookmarkListEvent);

      // Fetch content for each note bookmark directly using fallback method
      const updatedBookmarks = await Promise.all(
        bookmarks.map(async (bookmark) => {
          if (bookmark.type === 'note') {
            try {
              const noteContent = await this.fetchNoteFallback(bookmark.eventId);
              if (noteContent) {
                return {
                  ...bookmark,
                  content: noteContent
                };
              }
            } catch (e) {
              console.error(`[BookmarkService] Error fetching content for note ${bookmark.eventId}:`, e);
            }
          }
          return bookmark;
        })
      );

      console.log(`[BookmarkService] Returning ${updatedBookmarks.length} bookmarks with fetched note content.`);
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
    console.log(`[BookmarkService] Fetching content for ${eventIdsToFetch.length} note events...`);

    const noteFilter: Filter = {
      ids: eventIdsToFetch,
      kinds: [1],
    };

    const noteEvents: Event[] = [];
    const pool = this.relayService.getPool();
    const currentConnectedRelays = this.relayService.getConnectedRelays();
    console.log(`[BookmarkService] Relays used for kind:1 fetch (via getConnectedRelays): ${JSON.stringify(currentConnectedRelays)}`);

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
          console.log(`[BookmarkService] Fetched ${noteEvents.length} kind:1 events in total.`);
          const noteContentMap = new Map<string, string>();
          noteEvents.forEach((event: Event) => {
            if (!noteContentMap.has(event.id)) {
              noteContentMap.set(event.id, event.content);
            }
          });

          const updatedBookmarks = bookmarks.map(bookmark => {
            if (bookmark.type === 'note' && noteContentMap.has(bookmark.eventId)) {
              return {
                ...bookmark,
                content: noteContentMap.get(bookmark.eventId),
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
        console.warn(`[BookmarkService] Timeout hit after ${queryTimeout}ms waiting for note events/EOSE from ${expectedEoseCount} relays.`);
        timeoutHit = true;
        completeSubscription();
      }, queryTimeout);

      try {
        console.log(`[BookmarkService] Subscribing for notes on relays: ${JSON.stringify(currentConnectedRelays)}`);
        sub = pool.subscribe(currentConnectedRelays, noteFilter, { 
          onevent: (event: Event) => {
            noteEvents.push(event); 
          },
          oneose: () => {
            eoseReceivedCount++;
            console.log(`[BookmarkService] Received EOSE from ${currentConnectedRelays.length} relays (${eoseReceivedCount}/${expectedEoseCount}).`);
            if (eoseReceivedCount >= expectedEoseCount && !timeoutHit) {
              clearTimeout(timer);
              completeSubscription();
            }
          },
          onclose: (reason) => {
            console.log(`[BookmarkService] Note subscription closed prematurely. Reason: ${reason}`);
            if (!timeoutHit && sub) { 
              clearTimeout(timer);
              completeSubscription();
            }
          }
        });
      } catch (error) {
        console.error("[BookmarkService] Error subscribing to fetch note contents:", error);
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
    const eventCreatedAt = event.created_at; // Use event timestamp as fallback

    event.tags.forEach((tag: string[], index: number) => {
      // Use index to provide a pseudo-timestamp for sorting if needed, 
      // newer bookmarks should be earlier in the array (at the top)
      const createdAt = eventCreatedAt - index * 60; // 1 minute apart

      try {
        // Check if this is a 'r' tag (URL bookmark)
        if (tag[0] === 'r' && tag.length >= 2) {
          const url = tag[1];
          if (this.isValidUrl(url)) {
            const title = tag.length > 2 ? tag[2] : this.extractTitleFromUrl(url);
            bookmarks.push({
              id: `${event.id}-${index}`,
              type: 'website',
              title,
              url,
              eventId: event.id,
              createdAt
            });
          }
        }
        // Check if this is an 'e' tag (note bookmark)
        else if (tag[0] === 'e' && tag.length >= 2) {
          const eventId = tag[1];
          const relayHint = tag.length > 2 ? tag[2] : undefined;
          const noteTitle = tag.length > 3 ? tag[3] : 'Nostr Note';
          
          bookmarks.push({
            id: `${event.id}-${index}`,
            type: 'note',
            title: noteTitle,
            eventId,
            relayHint,
            createdAt
          });
        }
      } catch (error) {
        console.error(`[BookmarkService] Error parsing bookmark tag:`, error, tag);
      }
    });

    // Sort by createdAt, newest first
    return bookmarks.sort((a, b) => {
      // Handle both old and new bookmark formats
      const timeA = 'createdAt' in a ? a.createdAt : a.created_at;
      const timeB = 'createdAt' in b ? b.createdAt : b.created_at;
      return timeB - timeA;
    });
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
   * @param bookmarkId The ID of the bookmark to delete
   * @param publicKey The user's public key
   * @returns A promise that resolves when the bookmark is deleted
   */
  async deleteBookmark(bookmarkId: string, publicKey: string): Promise<void> {
    console.log(`[BookmarkService] Deleting bookmark ${bookmarkId} for user ${publicKey}`);
    
    // Get current bookmarks
    const currentBookmarks = await this.fetchBookmarks(publicKey);

    console.log(`[BookmarkService] Current bookmarks:`, currentBookmarks);
    
    // Filter out the bookmark to delete
    const updatedBookmarks = currentBookmarks.filter(b => b.id !== bookmarkId);

    console.log(`[BookmarkService] Updated bookmarks:`, updatedBookmarks);
    
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

    // Create the event
    const event = {
      kind: 10003,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
      pubkey: publicKey
    };

    try {
      // Sign the event using the window.nostr provider
      const signedEvent = await window.nostr.signEvent(event);
      
      // Try to publish to relays with better error handling and reconnection
      await this.publishEventToRelays(signedEvent);
      
      console.log(`[BookmarkService] Successfully deleted bookmark ${bookmarkId}`);
      return;
    } catch (error) {
      console.error('[BookmarkService] Error during bookmark deletion process:', error);
      throw error;
    }
  }
  
  /**
   * Helper method to publish an event to relays with reconnection and fallback handling
   * @param event The signed event to publish
   */
  private async publishEventToRelays(event: any): Promise<boolean> {
    // First try to publish to connected AND USABLE relays
    const usableRelays = this.relayService.getConnectedRelays();
    
    if (usableRelays.length > 0) {
      console.log(`[BookmarkService] Found ${usableRelays.length} usable relays, attempting to publish`);
      
      const publishResults = await this.tryPublishToRelays(usableRelays, event);
      
      if (publishResults.some(result => result)) {
        console.log(`[BookmarkService] Successfully published to ${publishResults.filter(Boolean).length}/${usableRelays.length} relays`);
        return true;
      }
      
      console.warn(`[BookmarkService] Failed to publish to any usable relay, will attempt reconnection`);
    } else {
      console.warn('[BookmarkService] No usable relays available, will attempt reconnection');
    }
  
    
    // If we reach here, either there were no connected relays or all publish attempts failed
    // Try to connect to fallback relays
    try {
      // Create fresh connections to fallback relays
      const pool = this.relayService.getPool();
      
      // Connect to fallbacks with timeouts to prevent hanging
      const connectionPromises = this.fallbackRelays.map(async relay => {
        try {
          // Wrap in a timeout to prevent hanging
          return await Promise.race([
            pool.ensureRelay(relay, { connectionTimeout: 5000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Connection timeout for ${relay}`)), 5000))
          ]);
        } catch (e) {
          console.warn(`[BookmarkService] Failed to connect to fallback relay ${relay}:`, e);
          return null;
        }
      });
      
      await Promise.allSettled(connectionPromises);
      
      // Get newly connected relays (including any that may have been connected during the process)
      const availableRelays = this.relayService.getConnectedRelays();
      
      if (availableRelays.length > 0) {
        // Try publishing to the newly connected relays
        const fallbackResults = await this.tryPublishToRelays(availableRelays, event);
        
        if (fallbackResults.some(result => result)) {
          console.log(`[BookmarkService] Successfully published to ${fallbackResults.filter(Boolean).length}/${availableRelays.length} fallback relays`);
          return true;
        }
      }
      
      // If we still can't publish, try one last effort with direct relay targets
      console.warn('[BookmarkService] Could not publish through relay service, trying direct publish method');
      return await this.lastResortPublish(event);
    } catch (error) {
      console.error('[BookmarkService] Error in relay reconnection and publish attempt:', error);
      return false;
    }
  }
  
  /**
   * Try to publish an event to a set of relays with individual error handling
   */
  private async tryPublishToRelays(relays: string[], event: any): Promise<boolean[]> {
    if (relays.length === 0) return [];
    
    const pool = this.relayService.getPool();
    const publishPromises = relays.map(async relay => {
      try {
        
        // Use a timeout to prevent hanging
        await Promise.race([
          pool.publish([relay], event),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Publish timeout for ${relay}`)), 5000))
        ]);
        return true;
      } catch (e) {
        console.warn(`[BookmarkService] Failed to publish to relay ${relay}:`, e);
        return false;
      }
    });
    
    // Wait for all publish attempts to complete
    const results = await Promise.allSettled(publishPromises);
    return results.map(r => r.status === 'fulfilled' && r.value);
  }
  
  /**
   * Last resort method to publish directly to relays
   * This is a fallback when normal publish methods fail
   */
  private async lastResortPublish(event: any): Promise<boolean> {
    // Create a new pool instance to bypass any existing connection issues
    const tempPool = new SimplePool();
    let success = false;
    
    try {
      // Try each fallback relay individually
      const publishPromises = this.fallbackRelays.map(async relay => {
        try {
          // Connect, publish, and disconnect in a single operation
          const relayConn = tempPool.ensureRelay(relay, { connectionTimeout: 3000 });
          await Promise.race([
            relayConn,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Connection timeout`)), 3000))
          ]);
          
          await Promise.race([
            tempPool.publish([relay], event),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Publish timeout`)), 3000))
          ]);
          
          console.log(`[BookmarkService] Successfully published directly to ${relay}`);
          return true;
        } catch (e) {
          console.warn(`[BookmarkService] Direct publish failed for ${relay}:`, e);
          return false;
        }
      });
      
      const results = await Promise.allSettled(publishPromises);
      const successes = results.filter(r => r.status === 'fulfilled' && r.value).length;
      
      if (successes > 0) {
        console.log(`[BookmarkService] Last resort publish succeeded on ${successes} relays`);
        success = true;
      } else {
        console.warn('[BookmarkService] All publishing attempts failed, proceeding with local deletion only');
      }
    } catch (e) {
      console.error('[BookmarkService] Error in last resort publish:', e);
    } finally {
      console.log('[BookmarkService] Cleaning up tempPool connections in lastResortPublish.');
      // tempPool iterates over this.fallbackRelays to establish connections.
      // So, we instruct it to attempt to close these same relays.
      // SimplePool.close() will only close relays it actually has open from this list.
      if (this.fallbackRelays.length > 0) {
        console.log(`[BookmarkService] tempPool will attempt to close connections related to fallback relays: ${this.fallbackRelays.join(', ')}`);
        try {
          await tempPool.close(this.fallbackRelays);
          console.log('[BookmarkService] tempPool.close operation completed for fallback relays.');
        } catch (closeError) {
          console.warn(`[BookmarkService] CAUGHT: Error during tempPool.close operation for fallback relays. Publishing part was likely successful. Error:`, closeError);
          // Absorb this error.
        }
      } else {
        console.log('[BookmarkService] No fallback relays configured for tempPool to attempt to close.');
      }
    }
    
    return success;
  }
} 