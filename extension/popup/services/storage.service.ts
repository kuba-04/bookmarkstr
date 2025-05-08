import { type ProcessedBookmark } from '../../common/types';
import { type RelayListItem } from './relay.service';

// Define the structure of cached data
interface CachedRelays {
  pubkey: string;
  relays: RelayListItem[];
  timestamp: number;
}

interface CachedBookmarks {
  pubkey: string;
  bookmarks: ProcessedBookmark[];
  timestamp: number;
}

export class StorageService {
  private static instance: StorageService;
  
  // Storage keys
  private readonly CACHED_RELAYS_KEY = 'cachedRelays';
  private readonly CACHED_BOOKMARKS_KEY = 'cachedBookmarks';
  
  // Cache expiration time (24 hours in milliseconds)
  private readonly CACHE_EXPIRATION = 24 * 60 * 60 * 1000;

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * Store relay list in local storage
   */
  async cacheRelays(pubkey: string, relays: RelayListItem[]): Promise<void> {
    const cachedData: CachedRelays = {
      pubkey,
      relays,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ [this.CACHED_RELAYS_KEY]: cachedData });
    console.log(`[StorageService] Cached ${relays.length} relays for user ${pubkey}`);
  }

  /**
   * Retrieve cached relay list if available and not expired
   */
  async getCachedRelays(pubkey: string): Promise<RelayListItem[] | null> {
    try {
      const result = await chrome.storage.local.get([this.CACHED_RELAYS_KEY]);
      const cachedData = result[this.CACHED_RELAYS_KEY] as CachedRelays | undefined;
      
      if (!cachedData || cachedData.pubkey !== pubkey) {
        console.log(`[StorageService] No cached relays found for user ${pubkey}`);
        return null;
      }
      
      // Check if cache is expired
      if (Date.now() - cachedData.timestamp > this.CACHE_EXPIRATION) {
        console.log(`[StorageService] Cached relays for user ${pubkey} are expired`);
        return null;
      }
      
      console.log(`[StorageService] Retrieved ${cachedData.relays.length} cached relays for user ${pubkey}`);
      return cachedData.relays;
    } catch (error) {
      console.error(`[StorageService] Error retrieving cached relays:`, error);
      return null;
    }
  }

  /**
   * Store bookmarks in local storage
   */
  async cacheBookmarks(pubkey: string, bookmarks: ProcessedBookmark[]): Promise<void> {
    const cachedData: CachedBookmarks = {
      pubkey,
      bookmarks,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ [this.CACHED_BOOKMARKS_KEY]: cachedData });
    console.log(`[StorageService] Cached ${bookmarks.length} bookmarks for user ${pubkey}`);
  }

  /**
   * Retrieve cached bookmarks if available and not expired
   */
  async getCachedBookmarks(pubkey: string): Promise<ProcessedBookmark[] | null> {
    try {
      const result = await chrome.storage.local.get([this.CACHED_BOOKMARKS_KEY]);
      const cachedData = result[this.CACHED_BOOKMARKS_KEY] as CachedBookmarks | undefined;
      
      if (!cachedData || cachedData.pubkey !== pubkey) {
        console.log(`[StorageService] No cached bookmarks found for user ${pubkey}`);
        return null;
      }
      
      // Check if cache is expired
      if (Date.now() - cachedData.timestamp > this.CACHE_EXPIRATION) {
        console.log(`[StorageService] Cached bookmarks for user ${pubkey} are expired`);
        return null;
      }
      
      console.log(`[StorageService] Retrieved ${cachedData.bookmarks.length} cached bookmarks for user ${pubkey}`);
      return cachedData.bookmarks;
    } catch (error) {
      console.error(`[StorageService] Error retrieving cached bookmarks:`, error);
      return null;
    }
  }

  /**
   * Clear all cached data for a user
   */
  async clearUserCache(pubkey: string): Promise<void> {
    try {
      const relaysResult = await chrome.storage.local.get([this.CACHED_RELAYS_KEY]);
      const bookmarksResult = await chrome.storage.local.get([this.CACHED_BOOKMARKS_KEY]);
      
      const cachedRelays = relaysResult[this.CACHED_RELAYS_KEY] as CachedRelays | undefined;
      const cachedBookmarks = bookmarksResult[this.CACHED_BOOKMARKS_KEY] as CachedBookmarks | undefined;
      
      if (cachedRelays && cachedRelays.pubkey === pubkey) {
        await chrome.storage.local.remove([this.CACHED_RELAYS_KEY]);
        console.log(`[StorageService] Cleared cached relays for user ${pubkey}`);
      }
      
      if (cachedBookmarks && cachedBookmarks.pubkey === pubkey) {
        await chrome.storage.local.remove([this.CACHED_BOOKMARKS_KEY]);
        console.log(`[StorageService] Cleared cached bookmarks for user ${pubkey}`);
      }
    } catch (error) {
      console.error(`[StorageService] Error clearing user cache:`, error);
    }
  }
} 