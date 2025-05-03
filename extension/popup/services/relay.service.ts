import { SimplePool, Relay } from 'nostr-tools';
import { Mutex } from 'async-mutex';

export interface RelayStatus {
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
}

export class RelayService {
  private static instance: RelayService;
  private pool: SimplePool;
  private relays: Map<string, Relay> = new Map(); // Keep track of individual Relay objects
  private relayStatuses: Map<string, RelayStatus> = new Map();
  private connectionMutex = new Mutex();
  private listeners: ((statuses: RelayStatus[]) => void)[] = [];

  // Default relays - consider making this configurable later
  private defaultRelays: string[] = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
    'wss://nostr.mom',
    // Add more reliable relays here
  ];

  private constructor() {
    this.pool = new SimplePool({ eoseSubTimeout: 5000 }); // 5-second timeout for EOSE
    // Initialize default relays with disconnected status
    this.defaultRelays.forEach(url => {
      this.relayStatuses.set(url, { url, status: 'disconnected' });
    });
  }

  public static getInstance(): RelayService {
    if (!RelayService.instance) {
      RelayService.instance = new RelayService();
    }
    return RelayService.instance;
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getRelayStatuses()));
  }

  public subscribeToStatusUpdates(listener: (statuses: RelayStatus[]) => void): () => void {
    this.listeners.push(listener);
    // Immediately notify with current statuses
    listener(this.getRelayStatuses());
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public getRelayStatuses(): RelayStatus[] {
    return Array.from(this.relayStatuses.values());
  }

  async connectToRelays(relayUrls: string[] = this.defaultRelays): Promise<void> {
    const release = await this.connectionMutex.acquire();
    try {
      console.log('Connecting to relays:', relayUrls);
      const connectPromises = relayUrls.map(async (url) => {
        if (this.relays.has(url) && this.relays.get(url)?.status === 1 /* CONNECTED */) {
          console.log(`Already connected to ${url}`);
          return; // Already connected or connecting
        }

        this.relayStatuses.set(url, { url, status: 'connecting' });
        this.notifyListeners();

        try {
          // SimplePool's ensureRelay automatically handles connection and reuse
          const relay = await this.pool.ensureRelay(url);
          this.relays.set(url, relay);

          // Attach listeners to the specific relay instance
          relay.on('connect', () => {
            console.log(`Connected to ${url}`);
            this.relayStatuses.set(url, { url, status: 'connected' });
            this.notifyListeners();
          });

          relay.on('disconnect', () => {
            console.log(`Disconnected from ${url}`);
            this.relayStatuses.set(url, { url, status: 'disconnected' });
            // Optionally remove from active relays map? Depends on desired reconnect logic.
            // this.relays.delete(url);
            this.notifyListeners();
          });

          relay.on('error', (error: any) => {
            console.error(`Error from ${url}:`, error);
            this.relayStatuses.set(url, { url, status: 'error', error: 'Connection failed' });
            this.notifyListeners();
          });

          // Handle initial connection state (if already connected by the time listeners are attached)
          if (relay.status === 1 /* CONNECTED */) {
             this.relayStatuses.set(url, { url, status: 'connected' });
             this.notifyListeners();
          } else if (relay.status === 2 /* CLOSING */ || relay.status === 3 /* CLOSED */) {
            this.relayStatuses.set(url, { url, status: 'disconnected' });
            this.notifyListeners();
          }

        } catch (error) {
          console.error(`Failed to ensure connection to ${url}:`, error);
          this.relayStatuses.set(url, { url, status: 'error', error: 'Failed to connect' });
          this.notifyListeners();
        }
      });
      await Promise.all(connectPromises);
    } finally {
      release();
    }
  }

  async disconnectFromRelay(url: string): Promise<void> {
     const release = await this.connectionMutex.acquire();
     try {
        const relay = this.relays.get(url);
        if (relay && relay.status === 1 /* CONNECTED */) {
            console.log(`Disconnecting from ${url}...`);
            await relay.close();
            this.relays.delete(url);
            this.relayStatuses.set(url, { url, status: 'disconnected' });
            this.notifyListeners();
        } else {
            console.log(`Not connected to ${url} or already disconnected.`);
             // Ensure status reflects disconnected if we try to disconnect a non-existent/disconnected relay
            this.relayStatuses.set(url, { url, status: 'disconnected' });
            this.notifyListeners();
        }
     } catch (error) {
         console.error(`Error disconnecting from ${url}:`, error);
         this.relayStatuses.set(url, { url, status: 'error', error: 'Disconnection failed' });
         this.notifyListeners();
     } finally {
        release();
     }
  }

  // Method to get the SimplePool instance for subscribing/publishing
  getPool(): SimplePool {
    return this.pool;
  }
} 