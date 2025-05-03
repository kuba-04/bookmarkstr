import { SimplePool, Event, Filter } from 'nostr-tools';
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
  private readonly CONNECTION_TIMEOUT = 30000; // Increased to 30 seconds
  private readonly RECONNECT_DELAY = 5000; // 5 seconds

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
   * Fetches user's relay list from kind:3 events (or kind:10002)
   */
  public async fetchUserRelays(pubkey: string): Promise<RelayListItem[]> {
    console.log(`[RelayService] fetchUserRelays called for pubkey: ${pubkey}`);
    const discoveryRelays = this.fallbackRelays;
    console.log(`[RelayService] Using discovery relays: ${discoveryRelays.join(', ')}`);
    
    return new Promise((resolve) => {
      const filter = {
        kinds: [3], // Using Kind 3 as per original code, might need change to 10002 based on NIP-65
        authors: [pubkey],
        limit: 1
      };
      console.log(`[RelayService] Subscribing to discovery relays for filter:`, filter);
      
      let eventReceived = false;
      const sub = this.pool.subscribe(discoveryRelays, filter, {
        onevent: (event) => {
          eventReceived = true;
          console.log(`[RelayService] Received kind:3 event for relays:`, event);
          try {
            // Kind 3 content is often stringified JSON mapping relay URLs to read/write booleans
            const relays = JSON.parse(event.content);
            if (typeof relays !== 'object' || relays === null) {
              throw new Error('Parsed content is not an object');
            }
            const relayList: RelayListItem[] = Object.entries(relays).map(([url, settings]: [string, any]) => ({
              url,
              // Default to true if read/write properties are missing or not explicitly false
              read: settings?.read !== false, 
              write: settings?.write !== false 
            })).filter(item => item.url.startsWith('wss://')); // Basic validation
            
            console.log(`[RelayService] Parsed relay list from event:`, relayList);
            sub.close(); // Close subscription once we have the event
            resolve(relayList);
          } catch (e) {
            console.error('[RelayService] Failed to parse relay list from event content:', e, 'Event content:', event.content);
            sub.close(); 
            resolve([]); // Resolve with empty list on parsing error
          }
        },
        onclose: (reason) => {
          console.log(`[RelayService] Subscription to discovery relays closed. Reason: ${reason}`);
          // If closed without receiving an event (e.g., timeout hit before event arrived), resolve empty
          if (!eventReceived) {
             console.log('[RelayService] Subscription closed without receiving event, resolving empty.');
             resolve([]);
          }
          // If event was received, the promise should already be resolved.
        }
        // Add EOSE handling? Might not be necessary if limit: 1 works reliably.
      });

      const timeoutDuration = 5000; // 5 seconds for discovery
      console.log(`[RelayService] Setting timeout for relay discovery: ${timeoutDuration}ms`);
      setTimeout(() => {
        if (!eventReceived) {
            console.log('[RelayService] Relay discovery timed out.');
            sub.close(); // Explicitly close on timeout
            // Resolve happens via onclose handler now
        }
      }, timeoutDuration);
    });
  }

  /**
   * Initializes relay connections for a user
   */
  public async initializeForUser(pubkey: string): Promise<void> {
    console.log(`[RelayService] Initializing relays for user: ${pubkey}`);
    let relayList: RelayListItem[] = [];
    let relaysToConnect: string[] = [];
    try {
      relayList = await this.fetchUserRelays(pubkey);
      console.log(`[RelayService] Fetched relay list result:`, relayList);
      
      if (relayList && relayList.length > 0) {
         console.log('[RelayService] Using relays found in user profile.');
         relaysToConnect = relayList.map(r => r.url);
      } else {
         console.log('[RelayService] No relays found in profile or fetch failed/timed out. Using fallback relays.');
         relaysToConnect = this.fallbackRelays;
      }
      
      console.log(`[RelayService] Relays determined for connection: ${relaysToConnect.join(', ')}`);
      if (relaysToConnect.length === 0) {
          console.error('[RelayService] No relays to connect to (neither user nor fallback worked).');
          throw new Error('No relays available to connect.');
      }

      await this.connectToRelays(relaysToConnect);
      
      console.log('[RelayService] Initial connection attempt finished. Checking connection status...');
      // Wait for at least one relay to connect
      const maxWaitTime = 15000; // 15 seconds
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        const connectedRelays = this.getConnectedRelays();
        if (connectedRelays.length > 0) {
          console.log(`[RelayService] Successfully connected to initial relays: ${connectedRelays.join(', ')}`);
          return; // Success!
        }
        console.log(`[RelayService] Waiting for connection... (${(Date.now() - startTime) / 1000}s / ${maxWaitTime / 1000}s)`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before checking again
      }
      
      console.error('[RelayService] Timed out waiting for any relay connection after initial attempt.');
      throw new Error('Timed out waiting for relay connections');

    } catch (error) {
      console.error(`[RelayService] Error during initializeForUser for ${pubkey}:`, error);
      // Check if we already tried fallbacks
      const triedFallbacks = relaysToConnect.every(url => this.fallbackRelays.includes(url));

      if (!triedFallbacks && this.getConnectedRelays().length === 0) {
          console.warn('[RelayService] Initial connection failed, attempting connection to fallback relays as a last resort.');
          try {
             await this.connectToRelays(this.fallbackRelays); 
             // Check again after trying fallbacks
             const connectedFallbacks = this.getConnectedRelays();
             if (connectedFallbacks.length > 0) {
                 console.log(`[RelayService] Successfully connected to fallback relays: ${connectedFallbacks.join(', ')}`);
                 return; // Success with fallbacks
             } else {
                  console.error('[RelayService] Failed to connect even to fallback relays.');
                  throw new Error('Failed to connect to initial relays and fallback relays.');
             }
          } catch (fallbackError) {
              console.error('[RelayService] Error connecting to fallback relays:', fallbackError);
              throw new Error('Failed to connect to initial relays. Error during fallback connection attempt.');
          }
      } else if (this.getConnectedRelays().length === 0) {
          // If we already tried fallbacks or there was another error and nothing is connected
          console.error('[RelayService] Initialization failed. No relays connected.');
          throw new Error('Failed to connect to initial relays. No relays configured or connected.');
      }
      // If we reach here, it means some error occurred but maybe some relays are connected, 
      // or we already tried fallbacks. The original error might be more informative.
      // Depending on desired behavior, we might re-throw the original error or just log it.
      // For now, we let the specific error from the blocks above be thrown.
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
    // Clear any existing reconnect timeout
    const existingTimeout = this.reconnectTimeouts.get(url);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new reconnect attempt
    const timeout = setTimeout(async () => {
      console.log(`Attempting to reconnect to ${url}`);
      try {
        await this.connectToRelays([url]);
      } catch (error) {
        console.error(`Reconnection attempt to ${url} failed:`, error);
        // Schedule another attempt if still a target
        if (this.targetRelays.has(url)) {
          this.scheduleReconnect(url);
        }
      }
    }, this.RECONNECT_DELAY);

    this.reconnectTimeouts.set(url, timeout);
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

  private async connectToRelays(relayUrls: string[]): Promise<void> {
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
          return; // Skip if already connected or connecting
        }

        this.targetRelays.add(url);
        this.updateRelayStatus(url, 'connecting');
        
        try {
          console.log(`[RelayService] Attempting pool.ensureRelay(${url})`);
          // Wait for ensureRelay to resolve or reject based on its internal timeout
          await this.pool.ensureRelay(url, {
            connectionTimeout: this.CONNECTION_TIMEOUT 
          });
          
          // If ensureRelay resolves without error, mark as connected
          console.log(`[RelayService] ensureRelay(${url}) succeeded.`);
          this.updateRelayStatus(url, 'connected'); 
          
        } catch (error) {
          // If ensureRelay fails (rejects or times out internally)
          console.error(`[RelayService] Failed to connect to relay ${url}:`, error);
          this.updateRelayStatus(url, 'error', error instanceof Error ? error.message : 'Connection failed');
          this.targetRelays.delete(url); 
          // Do not re-throw; let Promise.allSettled handle reporting
        }
      });

      console.log('[RelayService] Waiting for all connection promises...');
      const results = await Promise.allSettled(promises);
      console.log('[RelayService] All connection promises settled.');

      // Log results (optional but helpful)
      results.forEach((result, index) => {
        const url = relayUrls[index];
        if (result.status === 'fulfilled') {
          // Check final status, ensureRelay might succeed but underlying connection drops fast?
          if (this.relayStatuses.get(url)?.status === 'connected') {
             console.log(`[RelayService] Connection attempt for ${url} successful.`);
          } else {
             console.warn(`[RelayService] ensureRelay promise for ${url} fulfilled, but final status is: ${this.relayStatuses.get(url)?.status}`);
          }
        } else {
          console.error(`[RelayService] Connection attempt for ${url} rejected:`, result.reason);
           if (this.relayStatuses.get(url)?.status !== 'error') {
               this.updateRelayStatus(url, 'error', result.reason instanceof Error ? result.reason.message : String(result.reason));
           }
        }
      });

      const successfulConnections = this.getConnectedRelays().length; // Use the getter
      console.log(`[RelayService] Final connected count: ${successfulConnections} out of ${relayUrls.length}`);
      
      // Throw error only if no relays connected *after attempting* connection
      if (successfulConnections === 0 && relayUrls.length > 0) {
        console.error('[RelayService] Failed to connect to ANY target relays after attempts.');
        // Decide if initializeForUser should handle this or if we throw here
        // Throwing here makes connectToRelays signal total failure clearly
        throw new Error('Failed to connect to any relays'); 
      }
      
      // this.notifyListeners(); // Notify listeners after updates are done (moved to finally block?)
    } catch (error) {
       console.error('[RelayService] Error in connectToRelays outer block:', error);
       throw error; // Re-throw error caught by outer block (e.g., the guard clause error)
    }
     finally {
      console.log('[RelayService] Releasing connection mutex.');
      this.notifyListeners(); // Ensure listeners are notified regardless of success/error
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