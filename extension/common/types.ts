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
  | { type: 'url'; url: string; id: string; created_at: number } // Old format
  | { type: 'note'; eventId: string; relayHint?: string; id: string; created_at: number; content?: string } // Old format
  | { type: 'article'; naddr: string; relayHint?: string; id: string; created_at: number } // Old format
  | { type: 'hashtag'; hashtag: string; id: string; created_at: number } // Old format
  | { type: 'website'; title: string; url: string; id: string; eventId: string; createdAt: number } // New format
  | { type: 'note'; title: string; eventId: string; relayHint?: string; id: string; createdAt: number; content?: string }; // New format

// Represents the structure of the entire bookmark list event (kind 10003)
// Although we only process the tags, having the full event structure might be useful.
export interface BookmarkListEvent extends NostrEvent {
  kind: 10003;
} 