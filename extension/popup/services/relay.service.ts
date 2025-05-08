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
    try {
      // pool is already initialized as a class property
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
    const discoveryRelays = this.fallbackRelays;
    
    return new Promise((resolve) => {
      const filter = {
        kinds: [10002], // NIP-65 specifies kind:10002
        authors: [pubkey],
        limit: 1
      };
      
      let eventReceived = false;
      const sub = this.pool.subscribe(discoveryRelays, filter, {
        onevent: (event) => {
          eventReceived = true;
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
            
            sub.close(); // Close subscription once we have the event
            resolve(relayList);
          } catch (e) {
            sub.close(); 
            resolve([]); // Resolve with empty list on parsing error
          }
        },
        onclose: (reason) => {
          if (!eventReceived) {
             resolve([]);
          }
        }
      });

      const timeoutDuration = 5000; // 5 seconds for discovery
      setTimeout(() => {
        if (!eventReceived) {
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
  }

  /**
   * Initializes relay connections for a user
   */
  public async initializeForUser(pubkey: string): Promise<void> {
    
    // First try to get relays from NIP-65 event
    const relayList = await this.fetchUserRelays(pubkey);
    
    if (relayList.length > 0) {
      // Clear existing relays and add the ones from NIP-65
      this.targetRelays.clear();
      relayList.forEach(relay => this.targetRelays.add(relay.url));
      
      // Connect to all relays from the NIP-65 list
      await this.connectToRelays(Array.from(this.targetRelays));
    } else {
      // If no NIP-65 relays found, use fallback relays
      await this.connectToRelays(this.fallbackRelays);
    }
  }

  private updateRelayStatus(url: string, status: RelayStatus['status'], error?: string) {
    const current = this.relayStatuses.get(url);
    if (current?.status === status && current?.error === error) {
      return;
    }
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
      const timeout = setTimeout(async () => {
        try {
          await this.connectToRelays([url]);
        } catch (error) {
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
    if (!Array.isArray(relayUrls)) {
        throw new Error(`[RelayService] connectToRelays called with invalid argument (expected array): ${relayUrls}`);
    }

    const release = await this.connectionMutex.acquire();
    try {
      const promises = relayUrls.map(async (url) => {
        const currentStatus = this.relayStatuses.get(url)?.status;
        if (currentStatus === 'connected' || currentStatus === 'connecting') {
          return;
        }

        // Always add to target relays and keep it there
        this.targetRelays.add(url);
        this.updateRelayStatus(url, 'connecting');
        
        try {
          await this.pool.ensureRelay(url, {
            connectionTimeout: this.CONNECTION_TIMEOUT 
          });
          
          this.updateRelayStatus(url, 'connected');
          this.reconnectAttempts.delete(url); // Clear attempts on successful connection
          
        } catch (error) {
          const attempts = (this.reconnectAttempts.get(url) || 0) + 1;
          this.reconnectAttempts.set(url, attempts);
          
          // Don't remove from targetRelays on failure, just schedule reconnect
          this.updateRelayStatus(url, 'error', `Connection failed (attempt ${attempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
          this.scheduleReconnect(url);
        }
      });

      const results = await Promise.allSettled(promises);

      results.forEach((result, index) => {
        const url = relayUrls[index];
        if (result.status === 'fulfilled') {
          if (this.relayStatuses.get(url)?.status === 'connected') {
          } else {
            console.warn(`[RelayService] ensureRelay promise for ${url} fulfilled, but final status is: ${this.relayStatuses.get(url)?.status}`);
          }
        } else {
          console.error(`[RelayService] Connection attempt for ${url} rejected:`, result.reason);
        }
      });

      const successfulConnections = this.getConnectedRelays().length;
      
      if (successfulConnections === 0 && relayUrls.length > 0) {
        throw new Error("Failed to connect to any relays");
      }
    } catch (error) {
      throw error;
    } finally {
      this.notifyListeners();
      release();
    }
  }

  async disconnectFromRelay(url: string): Promise<void> {
    const release = await this.connectionMutex.acquire();
    try {
      if (!this.targetRelays.has(url)) {
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
        this.updateRelayStatus(url, 'disconnected');
      } catch (error) {
         this.updateRelayStatus(url, 'disconnected', error instanceof Error ? error.message : 'Close operation failed');
      }

    } finally {
      this.notifyListeners();
      release();
    }
  }

  async disconnectAllRelays(): Promise<void> {
     const urlsToDisconnect = Array.from(this.targetRelays);
     const promises = urlsToDisconnect.map(url => this.disconnectFromRelay(url));
     await Promise.allSettled(promises);
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