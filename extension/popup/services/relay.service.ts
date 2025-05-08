import { SimplePool, Event, Filter, getEventHash, finalizeEvent, type UnsignedEvent } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { Mutex } from 'async-mutex';

export interface RelayStatus {
  url: string;
  status: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
  error?: string;
}

export interface SubscriptionOptions {
  onevent?: (event: Event) => void;
  oneose?: () => void;
  onclose?: () => void;
}

export interface RelayListItem {
  url: string;
  read: boolean;
  write: boolean;
}

type SubscriptionCallback = (event: Event) => void;

interface Subscription {
  unsub: () => void;
}

export class RelayService {
  private static instance: RelayService;
  private pool: SimplePool = new SimplePool();
  private targetRelays: Set<string> = new Set();
  private relayStatuses: Map<string, RelayStatus> = new Map();
  private connectionMutex = new Mutex();
  private listeners: ((statuses: RelayStatus[]) => void)[] = [];
  private subscriptions: Map<string, Subscription> = new Map();
  private reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly CONNECTION_TIMEOUT = 45000; // Increased to 45 seconds
  private readonly RECONNECT_DELAY = 5000; // 5 seconds
  private readonly MAX_RECONNECT_ATTEMPTS = 3; // Maximum number of reconnection attempts
  private reconnectAttempts: Map<string, number> = new Map(); // Track reconnection attempts

  // Fallback relays in case we can't fetch user's relays or for initial discovery
  private fallbackRelays: string[] = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://nostr.land',
    'wss://relay.primal.net'
    // 'wss://relay.nostr.band', // Old fallback
    // 'wss://relay.current.fyi'  // Old fallback
  ];

  private constructor() {
    console.log('[RelayService] Constructor called');
    try {
      // pool is already initialized as a class property
      console.log('[RelayService] SimplePool created successfully');
      console.log('[RelayService] Configured fallback relays:', this.fallbackRelays);
    } catch (error) {
      console.error('[RelayService] Error in RelayService constructor:', error);
    }
  }

  public static getInstance(): RelayService {
    if (!RelayService.instance) {
      RelayService.instance = new RelayService();
    }
    return RelayService.instance;
  }

  /**
   * Fetches user's relay list from kind:10002 events (NIP-65)
   */
  public async fetchUserRelays(pubkey: string): Promise<RelayListItem[]> {
    console.log(`[RelayService] fetchUserRelays called for pubkey: ${pubkey}`);
    const discoveryRelays = this.fallbackRelays;
    console.log(`[RelayService] Using discovery relays: ${discoveryRelays.join(', ')}`);
    
    return new Promise((resolve) => {
      const filter = {
        kinds: [10002], // NIP-65 specifies kind:10002
        authors: [pubkey],
        limit: 1
      };
      console.log(`[RelayService] Subscribing to discovery relays for filter:`, filter);
      
      let eventReceived = false;
      const sub = this.pool.subscribe(discoveryRelays, filter, {
        onevent: (event) => {
          eventReceived = true;
          console.log(`[RelayService] Received kind:10002 event for relays:`, event);
          try {
            // NIP-65: Parse 'r' tags for relay information
            const relayList: RelayListItem[] = event.tags
              .filter(tag => tag[0] === 'r')
              .map(tag => {
                const [_, url, marker] = tag;
                return {
                  url,
                  read: marker ? marker === 'read' : true,
                  write: marker ? marker === 'write' : true
                };
              })
              .filter(item => item.url.startsWith('wss://')); // Basic validation
            
            console.log(`[RelayService] Parsed relay list from NIP-65 event:`, relayList);
            sub.close(); // Close subscription once we have the event
            resolve(relayList);
          } catch (e) {
            console.error('[RelayService] Failed to parse relay list from event tags:', e);
            sub.close(); 
            resolve([]); // Resolve with empty list on parsing error
          }
        },
        onclose: (reason) => {
          console.log(`[RelayService] Subscription to discovery relays closed. Reason: ${reason}`);
          if (!eventReceived) {
             console.log('[RelayService] Subscription closed without receiving event, resolving empty.');
             resolve([]);
          }
        }
      });

      const timeoutDuration = 5000; // 5 seconds for discovery
      console.log(`[RelayService] Setting timeout for relay discovery: ${timeoutDuration}ms`);
      setTimeout(() => {
        if (!eventReceived) {
            console.log('[RelayService] Relay discovery timed out.');
            sub.close();
        }
      }, timeoutDuration);
    });
  }

  /**
   * Publishes a NIP-65 relay list event
   */
  public async publishRelayList(pubkey: string): Promise<void> {
    const relayList = Array.from(this.targetRelays).map(url => ['r', url]);
    
    const unsignedEvent = {
      kind: 10002,
      created_at: Math.floor(Date.now() / 1000),
      tags: relayList,
      content: '', // NIP-65 specifies empty content
      pubkey: pubkey
    };

    // Sign the event using the NIP-07 extension
    const signedEvent = await window.nostr.signEvent(unsignedEvent);

    // Get all connected relays for publishing
    const connectedRelays = this.getConnectedRelays();
    if (connectedRelays.length === 0) {
      throw new Error('No connected relays available for publishing');
    }

    // Publish to all connected relays
    await this.pool.publish(connectedRelays, signedEvent);
    console.log('[RelayService] Published NIP-65 relay list:', signedEvent);
  }

  /**
   * Initializes relay connections for a user
   */
  public async initializeForUser(pubkey: string): Promise<void> {
    console.log(`[RelayService] Initializing for user: ${pubkey}`);
    
    // First try to get relays from NIP-65 event
    const relayList = await this.fetchUserRelays(pubkey);
    
    if (relayList.length > 0) {
      console.log(`[RelayService] Found NIP-65 relay list with ${relayList.length} relays`);
      // Clear existing relays and add the ones from NIP-65
      this.targetRelays.clear();
      relayList.forEach(relay => this.targetRelays.add(relay.url));
      
      // Connect to all relays from the NIP-65 list
      await this.connectToRelays(Array.from(this.targetRelays));
    } else {
      console.log('[RelayService] No NIP-65 relay list found, using fallback relays');
      // If no NIP-65 relays found, use fallback relays
      await this.connectToRelays(this.fallbackRelays);
    }
  }

  private updateRelayStatus(url: string, status: RelayStatus['status'], error?: string) {
    const current = this.relayStatuses.get(url);
    if (current?.status === status && current?.error === error) {
      return;
    }
    console.log(`Updating status for ${url}: ${status} ${error ? `(${error})` : ''}`);
    this.relayStatuses.set(url, { url, status, error });
    this.notifyListeners();

    // Handle reconnection for error states
    if (status === 'error' && this.targetRelays.has(url)) {
      this.scheduleReconnect(url);
    }
  }

  private scheduleReconnect(url: string) {
    const existingTimeout = this.reconnectTimeouts.get(url);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Always try to reconnect if it's a target relay
    if (this.targetRelays.has(url)) {
      console.log(`[RelayService] Scheduling reconnection for ${url}`);
      const timeout = setTimeout(async () => {
        console.log(`[RelayService] Attempting reconnection to ${url}`);
        try {
          await this.connectToRelays([url]);
        } catch (error) {
          console.error(`[RelayService] Reconnection attempt to ${url} failed:`, error);
          // Schedule another reconnect even on failure
          this.scheduleReconnect(url);
        }
      }, this.RECONNECT_DELAY);

      this.reconnectTimeouts.set(url, timeout);
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getRelayStatuses()));
  }

  public subscribeToStatusUpdates(listener: (statuses: RelayStatus[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.getRelayStatuses());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public getRelayStatuses(): RelayStatus[] {
    return Array.from(this.relayStatuses.values());
  }

  public async connectToRelays(relayUrls: string[]): Promise<void> {
    console.log(`[RelayService] ENTERING connectToRelays with URLs: ${JSON.stringify(relayUrls)}`);

    if (!Array.isArray(relayUrls)) {
        const errorMsg = `[RelayService] connectToRelays called with invalid argument (expected array): ${relayUrls}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    const release = await this.connectionMutex.acquire();
    try {
      console.log(`[RelayService] Connecting to relays: ${relayUrls.join(', ')}`);
      const promises = relayUrls.map(async (url) => {
        const currentStatus = this.relayStatuses.get(url)?.status;
        if (currentStatus === 'connected' || currentStatus === 'connecting') {
          console.log(`[RelayService] Skipping connection attempt for ${url} (already ${currentStatus})`);
          return;
        }

        // Always add to target relays and keep it there
        this.targetRelays.add(url);
        this.updateRelayStatus(url, 'connecting');
        
        try {
          console.log(`[RelayService] Attempting pool.ensureRelay(${url})`);
          
          // Reset reconnect attempts when starting a new connection
          this.reconnectAttempts.set(url, 0);
          
          await this.pool.ensureRelay(url, {
            connectionTimeout: this.CONNECTION_TIMEOUT 
          });
          
          console.log(`[RelayService] ensureRelay(${url}) succeeded.`);
          this.updateRelayStatus(url, 'connected');
          this.reconnectAttempts.delete(url); // Clear attempts on successful connection
          
        } catch (error) {
          console.error(`[RelayService] Failed to connect to relay ${url}:`, error);
          
          const attempts = (this.reconnectAttempts.get(url) || 0) + 1;
          this.reconnectAttempts.set(url, attempts);
          
          // Don't remove from targetRelays on failure, just schedule reconnect
          this.updateRelayStatus(url, 'error', `Connection failed (attempt ${attempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
          this.scheduleReconnect(url);
        }
      });

      console.log("[RelayService] Waiting for all connection promises...");
      const results = await Promise.allSettled(promises);
      console.log("[RelayService] All connection promises settled.");

      results.forEach((result, index) => {
        const url = relayUrls[index];
        if (result.status === 'fulfilled') {
          if (this.relayStatuses.get(url)?.status === 'connected') {
            console.log(`[RelayService] Connection attempt for ${url} successful.`);
          } else {
            console.warn(`[RelayService] ensureRelay promise for ${url} fulfilled, but final status is: ${this.relayStatuses.get(url)?.status}`);
          }
        } else {
          console.error(`[RelayService] Connection attempt for ${url} rejected:`, result.reason);
        }
      });

      const successfulConnections = this.getConnectedRelays().length;
      console.log(`[RelayService] Final connected count: ${successfulConnections} out of ${relayUrls.length}`);
      
      if (successfulConnections === 0 && relayUrls.length > 0) {
        console.error("[RelayService] Failed to connect to ANY target relays after attempts.");
        throw new Error("Failed to connect to any relays");
      }
    } catch (error) {
      console.error("[RelayService] Error in connectToRelays outer block:", error);
      throw error;
    } finally {
      console.log("[RelayService] Releasing connection mutex.");
      this.notifyListeners();
      release();
    }
  }

  async disconnectFromRelay(url: string): Promise<void> {
    const release = await this.connectionMutex.acquire();
    try {
      if (!this.targetRelays.has(url)) {
          console.log(`Relay ${url} is not a target, skipping disconnect.`);
          if (this.relayStatuses.get(url)?.status !== 'disconnected') {
            this.updateRelayStatus(url, 'disconnected');
          }
          return;
      }

      // Clear any reconnection attempts
      const reconnectTimeout = this.reconnectTimeouts.get(url);
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        this.reconnectTimeouts.delete(url);
      }

      this.targetRelays.delete(url);
      this.updateRelayStatus(url, 'disconnecting');

      try {
        // Close any active subscriptions
        const subsToClose = Array.from(this.subscriptions.keys());
        subsToClose.forEach(id => this.unsubscribe(id));

        this.pool.close([url]);
        console.log(`Closed connection to ${url} via SimplePool.`);
        this.updateRelayStatus(url, 'disconnected');
      } catch (error) {
         console.error(`Error closing relay ${url} via SimplePool:`, error);
         this.updateRelayStatus(url, 'disconnected', error instanceof Error ? error.message : 'Close operation failed');
      }

    } finally {
      this.notifyListeners();
      release();
    }
  }

  async disconnectAllRelays(): Promise<void> {
     const urlsToDisconnect = Array.from(this.targetRelays);
     console.log('Disconnecting from all target relays:', urlsToDisconnect);
     const promises = urlsToDisconnect.map(url => this.disconnectFromRelay(url));
     await Promise.allSettled(promises);
     console.log('Finished disconnecting all relays.');
  }

  public subscribe(filters: Filter[], callback: (event: Event) => void): Subscription {
    const connectedRelays = Array.from(this.relayStatuses.values())
      .filter(status => status.status === 'connected')
      .map(status => status.url);

    if (connectedRelays.length === 0) {
      throw new Error('No connected relays available');
    }

    // Merge multiple filters into a single filter object
    const mergedFilter: Filter = {
      kinds: filters.flatMap(f => f.kinds || []),
      authors: filters.flatMap(f => f.authors || []),
      ids: filters.flatMap(f => f.ids || []),
      '#e': filters.flatMap(f => f['#e'] || []),
      '#p': filters.flatMap(f => f['#p'] || []),
      since: Math.min(...filters.map(f => f.since || Infinity)),
      until: Math.max(...filters.map(f => f.until || 0)),
      limit: Math.max(...filters.map(f => f.limit || 0))
    };

    const sub = this.pool.subscribe(connectedRelays, mergedFilter, {
      onevent: callback
    });

    const subId = Math.random().toString(36).substring(7);
    const subscription = { unsub: () => sub.close() };
    this.subscriptions.set(subId, subscription);

    return subscription;
  }

  public unsubscribe(subId: string): void {
    const subscription = this.subscriptions.get(subId);
    if (subscription) {
      subscription.unsub();
      this.subscriptions.delete(subId);
    }
  }

  public async publish(event: Event): Promise<void> {
    const connectedRelays = Array.from(this.relayStatuses.values())
      .filter(status => status.status === 'connected')
      .map(status => status.url);

    if (connectedRelays.length === 0) {
      throw new Error('No connected relays available');
    }

    await this.pool.publish(connectedRelays, event);
  }

  public getConnectedRelays(): string[] {
    return Array.from(this.relayStatuses.entries())
      .filter(([_, status]) => status.status === 'connected')
      .map(([url, _]) => url);
  }

  getPool(): SimplePool {
    return this.pool;
  }

  public cleanup(): void {
    // Clear all reconnection timeouts
    this.reconnectTimeouts.forEach(timeout => clearTimeout(timeout));
    this.reconnectTimeouts.clear();

    // Close all subscriptions
    this.subscriptions.forEach(sub => sub.unsub());
    this.subscriptions.clear();

    // Disconnect from all relays
    this.disconnectAllRelays();
  }
}