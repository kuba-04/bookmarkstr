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
export type ProcessedBookmark = 
  | { type: 'url'; url: string; id: string; created_at: number } // id = tag value + created_at for uniqueness
  | { type: 'note'; eventId: string; relayHint?: string; id: string; created_at: number; content?: string } // id = eventId, added content
  | { type: 'article'; naddr: string; relayHint?: string; id: string; created_at: number } // id = naddr
  | { type: 'hashtag'; hashtag: string; id: string; created_at: number }; // id = hashtag + created_at for uniqueness

// Represents the structure of the entire bookmark list event (kind 10003)
// Although we only process the tags, having the full event structure might be useful.
export interface BookmarkListEvent extends NostrEvent {
  kind: 10003;
} 