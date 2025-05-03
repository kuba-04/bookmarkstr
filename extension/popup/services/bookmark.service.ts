import { Event, Filter, SimplePool } from 'nostr-tools';
import { RelayService } from './relay.service';
import { ProcessedBookmark, NostrEvent, BookmarkListEvent } from '../../common/types'; // Corrected import path

// Remove old Bookmark interface definition

export class BookmarkService {
  private relayService: RelayService;
  
  // Well-known public relays to try as fallback
  private fallbackRelays: string[] = [
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://relay.damus.io',
    'wss://relay.current.fyi',
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
    const filter: Filter = {
      authors: [publicKey],
      kinds: [10003],
      limit: 1,
    };

    const connectedRelayUrls = this.relayService.getConnectedRelays();
    if (connectedRelayUrls.length === 0) {
      console.warn("[BookmarkService] No connected relays to fetch bookmark list from.");
      return [];
    }

    try {
      const bookmarkListEvent: Event | null = await this.relayService.getPool().get(connectedRelayUrls, filter);
      if (!bookmarkListEvent) {
        console.log(`[BookmarkService] No kind:10003 event found for pubkey ${publicKey}.`);
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
         const filtersToSubscribe: Filter[] = [noteFilter];
         console.log(`[BookmarkService] Subscribing for notes on relays: ${JSON.stringify(currentConnectedRelays)}`);
         sub = pool.subscribe(currentConnectedRelays, filtersToSubscribe, { 
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
      // but NIP suggests tags are chronological. We'll sort by event.created_at mainly.
      // Let's use event.created_at as the primary timestamp for all items in the list.
      // For unique IDs, we combine type, value and timestamp.
      const itemCreatedAt = eventCreatedAt; // All items share the event's timestamp for sorting

      const tagType = tag[0];
      const tagValue = tag[1];
      const relayHint = tag[2]; // Optional relay hint

      if (!tagValue) return; // Skip incomplete tags

      try {
          switch (tagType) {
            case 'r': // URL
              if (this.isValidUrl(tagValue)) {
                  bookmarks.push({ 
                    type: 'url', 
                    url: tagValue, 
                    id: `url-${tagValue}-${itemCreatedAt}`, // Ensure unique ID
                    created_at: itemCreatedAt 
                  });
              } else {
                  console.warn(`[BookmarkService] Skipping invalid URL bookmark: ${tagValue}`);
              }
              break;
            case 'e': // Note event ID
              // TODO: Add validation for event ID format if needed
              bookmarks.push({ 
                type: 'note', 
                eventId: tagValue, 
                relayHint, 
                id: `note-${tagValue}`, // Event ID is unique enough
                created_at: itemCreatedAt 
              });
              break;
            case 'a': // Parameterized replaceable event (e.g., Article kind:30023)
              // Format: <kind>:<pubkey>:<d-tag>
              const parts = tagValue.split(':');
              if (parts.length >= 3) {
                  // TODO: We could add more specific handling based on the kind if needed (e.g. 30023 for articles)
                  bookmarks.push({ 
                      type: 'article', // Assuming 'a' tags are primarily for articles per NIP-51 spec for kind 10003
                      naddr: tagValue, 
                      relayHint, 
                      id: `article-${tagValue}`, // naddr should be unique
                      created_at: itemCreatedAt 
                  });
              } else {
                  console.warn(`[BookmarkService] Skipping invalid 'a' tag bookmark: ${tagValue}`);
              }
              break;
            case 't': // Hashtag
              bookmarks.push({ 
                type: 'hashtag', 
                hashtag: tagValue, 
                id: `hashtag-${tagValue}-${itemCreatedAt}`, // Ensure unique ID
                created_at: itemCreatedAt 
              });
              break;
            // Add other tag types if necessary based on NIP-51 or future updates
            default:
              // Optional: log unrecognized tags
              // console.log(`[BookmarkService] Skipping unrecognized tag type: ${tagType}`);
              break;
          }
      } catch (e) {
           console.error(`[BookmarkService] Error processing tag:`, tag, e);
      }
    });

    // NIP suggests tags are added chronologically (oldest first). Reverse to show newest first.
    bookmarks.reverse();

    console.log(`[BookmarkService] Parsed ${bookmarks.length} initial bookmarks from event ${event.id}.`);
    return bookmarks;
  }

  // Keep isValidUrl as a private helper method
  private isValidUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      // Allow http, https, and potentially other common protocols like magnet? For now, just http/https.
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
      return false;
    }
  }
  
  // Remove fetchBookmarksFromRelay and mapEventToBookmark
} 