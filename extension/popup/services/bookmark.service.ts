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

  // Add a helper method to ensure relays are connected and ready before use
  private async ensureRelayConnections(relays: string[]): Promise<string[]> {
    if (relays.length === 0) {
      console.log('[BookmarkService] No relays provided to ensureRelayConnections');
      return [];
    }
    
    console.log(`[BookmarkService] Ensuring connections to ${relays.length} relays...`);
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
          console.log(`[BookmarkService] Successfully connected to relay: ${relay}`);
          return relay;
        } catch (err) {
          console.warn(`[BookmarkService] Failed to connect to relay: ${relay}`, err);
          return null;
        }
      })
    );
    
    // Filter out failed connections
    const connectedRelays = connectionResults
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => (result as PromiseFulfilledResult<string>).value);
    
    console.log(`[BookmarkService] Connected to ${connectedRelays.length}/${relays.length} relays`);
    return connectedRelays;
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
    let relaysToUse = connectedRelayUrls.length > 0 ? connectedRelayUrls : this.fallbackRelays;
    
    // Ensure we have working connections before proceeding
    relaysToUse = await this.ensureRelayConnections(relaysToUse);
    
    if (relaysToUse.length === 0) {
      console.warn("[BookmarkService] Could not connect to any relays. Using mock data for testing.");
      // Return mock data as we did before
      const mockBookmarks: ProcessedBookmark[] = [
        {
          id: 'https://example.com/1',
          type: 'website',
          title: 'Example Website 1',
          url: 'https://example.com/1',
          createdAt: Date.now() / 1000,
          eventId: 'mock-event-1'
        },
        {
          id: 'https://example.com/2',
          type: 'website',
          title: 'Example Website 2',
          url: 'https://example.com/2',
          createdAt: Date.now() / 1000 - 3600, // 1 hour ago
          eventId: 'mock-event-2'
        }
      ];
      
      return mockBookmarks;
    }

    // Prepare filter for fetching bookmarks - kind:10003 is a replaceable event per NIP-01
    const filter: Filter = {
      authors: [publicKey],
      kinds: [10003],
      // Set a higher limit to increase chance of getting the most recent event
      limit: 10
    };

    try {
      console.log(`[BookmarkService] Fetching latest bookmark list (kind:10003) with filter:`, filter);
      console.log(`[BookmarkService] Using relays:`, relaysToUse);
      
      // Use a new pool for this specific query to avoid WebSocket issues
      const pool = this.relayService.getPool();
      
      // Use querySync with a reasonable timeout
      const bookmarkEvents = await pool.querySync(
        relaysToUse, 
        filter,
        { maxWait: 10000 } // 10 second timeout
      );
      
      console.log(`[BookmarkService] Received ${bookmarkEvents.length} kind:10003 events`);
      
      // Collection for our events
      let eventsToProcess = bookmarkEvents;
      
      // Try without the since filter if we don't get any events
      if (bookmarkEvents.length === 0) {
        console.log(`[BookmarkService] No recent events found, trying without 'since' filter`);
        
        // Modified filter without the since parameter
        const fallbackFilter: Filter = {
          authors: [publicKey],
          kinds: [10003],
          limit: 10,
        };
        
        // Try again with the simplified filter
        const fallbackEvents = await pool.querySync(
          relaysToUse, 
          fallbackFilter,
          { maxWait: 10000 }
        );
        
        console.log(`[BookmarkService] Received ${fallbackEvents.length} kind:10003 events with fallback query`);
        eventsToProcess = fallbackEvents;
      }
      
      if (eventsToProcess.length > 0) {
        // Sort by createdAt, newest first
        const sortedEvents = [...eventsToProcess].sort((a, b) => b.created_at - a.created_at);
        
        // Log events to help debug replaceable event handling
        sortedEvents.forEach((event, index) => {
          console.log(`[BookmarkService] Event ${index}: id=${event.id}, created_at=${event.created_at} (${new Date(event.created_at * 1000).toISOString()})`);
          console.log(`[BookmarkService] Event ${index} has ${event.tags.length} tags`);
        });
        
        // Use the most recent event (highest created_at timestamp)
        let bookmarkListEvent = sortedEvents[0];
        console.log(`[BookmarkService] Using most recent replaceable event: ${bookmarkListEvent.id} created at ${new Date(bookmarkListEvent.created_at * 1000).toISOString()}`);
        
        // Check if we need to forcefully refresh our subscription
        // This helps ensure we're getting the most up-to-date event after a deletion
        if (relaysToUse.length > 0 && bookmarkListEvent.tags.length === 0 && sortedEvents.length > 1) {
          console.log(`[BookmarkService] Most recent event has 0 tags but older events exist. This may indicate a caching issue.`);
          
          // Try to force a relay refresh and check again
          try {
            console.log(`[BookmarkService] Attempting to force-refresh relay connections...`);
            
            // Reconnect to relays using our helper
            const refreshedRelays = await this.ensureRelayConnections(relaysToUse);
            
            if (refreshedRelays.length > 0) {
              const pool = this.relayService.getPool();
              
              // Try fetching again after reconnection
              const refreshedEvents = await pool.querySync(
                refreshedRelays,
                filter,
                { maxWait: 8000 }
              );
              
              if (refreshedEvents.length > 0) {
                // Re-sort by timestamp
                const refreshSortedEvents = [...refreshedEvents].sort((a, b) => b.created_at - a.created_at);
                
                // Log all events for comparison
                console.log(`[BookmarkService] After refresh, found ${refreshSortedEvents.length} events:`);
                refreshSortedEvents.forEach((event, index) => {
                  console.log(`[BookmarkService] Refreshed Event ${index}: id=${event.id}, created_at=${event.created_at}, tags=${event.tags.length}`);
                });
                
                // Compare the first events of both queries
                if (refreshSortedEvents[0].id !== bookmarkListEvent.id) {
                  console.log(`[BookmarkService] Found a different most recent event after refresh: ${refreshSortedEvents[0].id}`);
                  // Use the refreshed event if it's different and has more tags (or same tags but newer)
                  if (refreshSortedEvents[0].tags.length >= bookmarkListEvent.tags.length) {
                    console.log(`[BookmarkService] Using refreshed event with ${refreshSortedEvents[0].tags.length} tags`);
                    bookmarkListEvent = refreshSortedEvents[0];
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`[BookmarkService] Error during refresh attempt:`, error);
            // Continue with original event
          }
        }
        
        // Parse the tags to get bookmarks
        const bookmarks = this.parseBookmarkEvent(bookmarkListEvent as BookmarkListEvent);
        
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
      }
      
      console.log(`[BookmarkService] No kind:10003 events found for pubkey ${publicKey}.`);
      
      return [];
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
    
    console.log(`[BookmarkService] Parsing event ${event.id} with ${event.tags.length} tags for bookmarks`);

    // Log raw tags for debugging
    console.log(`[BookmarkService] Raw tags:`, JSON.stringify(event.tags));

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
            // Use URL as the ID for website bookmarks
            const id = url;
            console.log(`[BookmarkService] Found URL bookmark: ${title} - ${url}`);
            bookmarks.push({
              id,
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
          // Use the note event ID as the bookmark ID
          const id = eventId;
          console.log(`[BookmarkService] Found note bookmark: ${noteTitle} - ${eventId}`);
          
          bookmarks.push({
            id,
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
    const sortedBookmarks = bookmarks.sort((a, b) => {
      // All bookmarks now use createdAt, no need to handle old format
      return b.createdAt - a.createdAt;
    });
    
    console.log(`[BookmarkService] Parsed ${sortedBookmarks.length} bookmarks from event ${event.id}`);
    sortedBookmarks.forEach((bookmark, idx) => {
      const title = 'title' in bookmark ? bookmark.title : '(No title)';
      console.log(`[BookmarkService] Bookmark ${idx}: ${bookmark.id} - ${title}`);
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
  async deleteBookmark(bookmarkId: string, publicKey: string): Promise<void> {
    console.log(`[BookmarkService] Deleting bookmark ${bookmarkId} for user ${publicKey}`);
    
    // Get current bookmarks
    const currentBookmarks = await this.fetchBookmarks(publicKey);

    console.log(`[BookmarkService] Current bookmarks count: ${currentBookmarks.length}`);
    
    // Log the bookmark to be deleted for debugging
    const bookmarkToDelete = currentBookmarks.find(b => b.id === bookmarkId);
    if (!bookmarkToDelete) {
      console.error(`[BookmarkService] Bookmark with ID ${bookmarkId} not found in current bookmarks!`);
      throw new Error(`Bookmark with ID ${bookmarkId} not found`);
    }
    
    console.log(`[BookmarkService] Bookmark to delete:`, bookmarkToDelete);
    
    // Filter out the bookmark to delete
    const updatedBookmarks = currentBookmarks.filter(b => b.id !== bookmarkId);

    console.log(`[BookmarkService] After deletion: ${updatedBookmarks.length} bookmarks remaining`);
    
    if (currentBookmarks.length === updatedBookmarks.length) {
      console.error(`[BookmarkService] Bookmark with ID ${bookmarkId} was not removed from the list!`);
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
          
          console.log(`[BookmarkService] Found latest event timestamp: ${latestTimestamp} (${new Date(latestTimestamp * 1000).toISOString()}) with ID: ${latestEventId}`);
        }
      }
    } catch (error) {
      console.error(`[BookmarkService] Error finding latest timestamp:`, error);
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
    
    console.log(`[BookmarkService] Creating new replaceable event (kind:10003) with timestamp ${newTimestamp} (${new Date(newTimestamp * 1000).toISOString()})`);
    console.log(`[BookmarkService] Event contains ${tags.length} tags (bookmarks)`);

    try {
      // Sign the event using the window.nostr provider
      const signedEvent = await window.nostr.signEvent(event);
      
      console.log(`[BookmarkService] Signed replaceable event with id: ${signedEvent.id}`);
      
      // Get connected relays
      const relays = this.relayService.getConnectedRelays();
      
      // Ensure connections to relays
      const activeRelays = await this.ensureRelayConnections(relays);
      
      if (activeRelays.length === 0) {
        throw new Error("No connected relays available for publishing");
      }
      
      console.log(`[BookmarkService] Publishing replaceable event to ${activeRelays.length} relays...`);
      
      // Publish using simplePool directly to better handle the process
      const pool = this.relayService.getPool();
      
      // Create individual promises to track success/failure on each relay
      const publishPromises = activeRelays.map(relay => 
        new Promise<{relay: string, success: boolean}>(async (resolve) => {
          try {
            await pool.publish([relay], signedEvent);
            console.log(`[BookmarkService] Successfully published replaceable event to ${relay}`);
            resolve({relay, success: true});
          } catch (err) {
            console.error(`[BookmarkService] Failed to publish to ${relay}:`, err);
            resolve({relay, success: false});
          }
        })
      );
      
      // Wait for all publish attempts to complete
      const results = await Promise.allSettled(publishPromises);
      const successes = results
        .filter(r => r.status === 'fulfilled' && r.value.success)
        .map(r => (r as PromiseFulfilledResult<{relay: string, success: boolean}>).value.relay);
      
      if (successes.length > 0) {
        console.log(`[BookmarkService] Successfully published replaceable event to ${successes.length}/${activeRelays.length} relays: ${successes.join(', ')}`);
        
        // Add a longer delay to ensure relays have processed the event
        console.log(`[BookmarkService] Waiting 3 seconds for relays to process the event...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Don't force-close connections here as it might interrupt other operations
        // Instead, wait briefly and then fetch bookmarks again
        console.log(`[BookmarkService] Verifying deletion by fetching bookmarks again...`);
        const bookmarksAfterDeletion = await this.fetchBookmarks(publicKey);
        
        // Check if the bookmark we deleted is still present
        const stillExists = bookmarksAfterDeletion.some(b => b.id === bookmarkId);
        
        if (stillExists) {
          console.error(`[BookmarkService] WARNING: Bookmark ${bookmarkId} still exists after deletion!`);
          console.log(`[BookmarkService] Bookmark list after deletion:`, bookmarksAfterDeletion);
          
          // Log the event IDs before and after deletion
          console.log(`[BookmarkService] Comparing events before and after deletion:`);
          
          // Extract event IDs or url/content for comparison
          const getIdentifier = (bookmark: ProcessedBookmark) => {
            if (bookmark.type === 'note') {
              return bookmark.eventId;
            }
            if (bookmark.type === 'website') {
              return bookmark.url;
            }
            // This is a TypeScript exhaustiveness check to make sure we handle all types
            const _exhaustiveCheck: never = bookmark;
            return ''; // This line should never execute
          };
          
          const identifiersBefore = Array.from(new Set(currentBookmarks.map(getIdentifier)));
          const identifiersAfter = Array.from(new Set(bookmarksAfterDeletion.map(getIdentifier)));
          
          console.log(`[BookmarkService] Identifiers before:`, identifiersBefore);
          console.log(`[BookmarkService] Identifiers after:`, identifiersAfter);
          
          // Even if verification fails, we still proceeded with deletion
          console.log(`[BookmarkService] Deletion operation completed but verification failed. This may be due to relay caching.`);
        } else {
          console.log(`[BookmarkService] Successfully deleted bookmark ${bookmarkId}, verified it no longer exists`);
        }
      } else {
        throw new Error("Failed to publish replaceable event to any relays");
      }
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