// Basic Nostr event structure
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Represents a single bookmark item parsed from a kind:10003 event's tags
// Using the proper identification according to NIP-51 where:
// - For notes (e tags): the ID is the event ID of the note itself
// - For URLs (r tags): the ID is the URL itself
// - For articles (a tags): the ID is the naddr
// - For hashtags (t tags): the ID is the hashtag itself
export type ProcessedBookmark = 
  // Website bookmark using 'r' tag
  | { 
      type: 'website'; 
      title: string; 
      url: string; 
      id: string;           // ID is the URL itself
      eventId: string;      // The ID of the kind:10003 event containing this bookmark
      createdAt: number;    // Timestamp for sorting
    }
  // Note bookmark using 'e' tag
  | { 
      type: 'note'; 
      title: string; 
      eventId: string;      // The ID of the kind:1 note being bookmarked
      id: string;           // ID is the eventId of the note
      relayHint?: string;   // Optional relay hint from the 'e' tag
      createdAt: number;    // Timestamp for sorting
      content?: string;     // Optional fetched content of the note
    };

// Represents the structure of the entire bookmark list event (kind 10003)
// Although we only process the tags, having the full event structure might be useful.
export interface BookmarkListEvent extends NostrEvent {
  kind: 10003;
} 