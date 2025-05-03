import { SimplePool } from 'nostr-tools';
import { Mutex } from 'async-mutex';

export interface RelayStatus {
  url: string;
  status: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
  error?: string;
}

export class RelayService {
  private static instance: RelayService;
  private pool: SimplePool;
  private targetRelays: Set<string> = new Set();
  private relayStatuses: Map<string, RelayStatus> = new Map();
  private connectionMutex = new Mutex();
  private listeners: ((statuses: RelayStatus[]) => void)[] = [];

  private defaultRelays: string[] = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol'
  ];

  private constructor() {
    this.pool = new SimplePool();
    this.defaultRelays.forEach(url => {
      // Initialize status but don't add to targetRelays yet
      if (!this.relayStatuses.has(url)) {
         this.relayStatuses.set(url, { url, status: 'disconnected' });
      }
    });
  }

  public static getInstance(): RelayService {
    if (!RelayService.instance) {
      RelayService.instance = new RelayService();
    }
    return RelayService.instance;
  }

  private updateRelayStatus(url: string, status: RelayStatus['status'], error?: string) {
    const current = this.relayStatuses.get(url);
    if (current?.status === status && current?.error === error) {
      return;
    }
    console.log(`Updating status for ${url}: ${status} ${error ? `(${error})` : ''}`);
    this.relayStatuses.set(url, { url, status, error });
    this.notifyListeners();
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
    // Return the current statuses we are tracking
    return Array.from(this.relayStatuses.values());
  }

  async connectToRelays(relayUrls: string[] = this.defaultRelays): Promise<void> {
    const release = await this.connectionMutex.acquire();
    try {
      console.log('Connecting to relays:', relayUrls);
      const promises = relayUrls.map(async (url) => {
        // Only attempt connection if not already connected or connecting
        const currentStatus = this.relayStatuses.get(url)?.status;
        if (currentStatus === 'connected' || currentStatus === 'connecting') {
            console.log(`Skipping connection attempt for ${url} (status: ${currentStatus})`);
            return;
        }

        this.targetRelays.add(url);
        this.updateRelayStatus(url, 'connecting');
        try {
          // This promise resolves when the connection is established or immediately if already connected.
          // It rejects if the connection fails.
          await this.pool.ensureRelay(url);
          this.updateRelayStatus(url, 'connected');
        } catch (error) {
          console.error(`Failed to connect to relay ${url}:`, error);
          this.updateRelayStatus(url, 'error', error instanceof Error ? error.message : 'Connection failed');
          this.targetRelays.delete(url); // Remove from targets if connection failed
        }
      });
      // Wait for all connection attempts to settle
      await Promise.allSettled(promises);
      // Notify listeners once after all attempts are done
      this.notifyListeners();
    } finally {
      release();
    }
  }

  async disconnectFromRelay(url: string): Promise<void> {
    const release = await this.connectionMutex.acquire();
    try {
      if (!this.targetRelays.has(url)) {
          console.log(`Relay ${url} is not a target, skipping disconnect.`);
          // Ensure status is marked disconnected if it wasn't already
          if (this.relayStatuses.get(url)?.status !== 'disconnected') {
            this.updateRelayStatus(url, 'disconnected');
          }
          return;
      }

      this.targetRelays.delete(url);
      this.updateRelayStatus(url, 'disconnecting');

      try {
        // Use SimplePool's close method for specific relays
        this.pool.close([url]);
        console.log(`Closed connection to ${url} via SimplePool.`);
        this.updateRelayStatus(url, 'disconnected');
      } catch (error) {
          // Log error but still mark as disconnected as that's the intent
         console.error(`Error closing relay ${url} via SimplePool:`, error);
         this.updateRelayStatus(url, 'disconnected', error instanceof Error ? error.message : 'Close operation failed');
      }

    } finally {
      // Notify regardless of errors during close attempt
      this.notifyListeners();
      release();
    }
  }

  // Disconnect from all targeted relays
  async disconnectAllRelays(): Promise<void> {
     const urlsToDisconnect = Array.from(this.targetRelays);
     console.log('Disconnecting from all target relays:', urlsToDisconnect);
     const promises = urlsToDisconnect.map(url => this.disconnectFromRelay(url));
     await Promise.allSettled(promises);
     console.log('Finished disconnecting all relays.');
  }

  getPool(): SimplePool {
    return this.pool;
  }
}