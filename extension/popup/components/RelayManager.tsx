import React, { useState, useEffect } from 'react';
import { RelayService, RelayStatus } from '../services/relay.service';
import styles from '../styles/glassmorphism.module.css';

// NIP-07 extension type declarations
declare global {
  interface Window {
    nostr: {
      getPublicKey: () => Promise<string>;
      getSecretKey: () => Promise<string>;
      signEvent: (event: any) => Promise<any>;
      getRelays: () => Promise<{ [url: string]: { read: boolean; write: boolean; } }>;
    };
  }
}

export const RelayManager: React.FC = () => {
  const [relayStatuses, setRelayStatuses] = useState<RelayStatus[]>([]);
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const relayService = RelayService.getInstance();

  useEffect(() => {
    // Subscribe to status updates
    const unsubscribe = relayService.subscribeToStatusUpdates(setRelayStatuses);

    // Initial status update
    setRelayStatuses(relayService.getRelayStatuses());

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []); // Run only on mount

  const handleAddRelay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const urlToAdd = newRelayUrl.trim();

    if (!urlToAdd) {
      setError('Relay URL cannot be empty.');
      return;
    }

    // Basic URL validation (consider a more robust check)
    if (!urlToAdd.startsWith('wss://')) {
        setError('Invalid relay URL format. Must start with wss://');
        return;
    }

    setIsLoading(true);
    try {
      // First connect to the relay
      await relayService.connectToRelays([urlToAdd]);
      
      // Then publish the updated relay list
      const pubkey = await window.nostr.getPublicKey();
      await relayService.publishRelayList(pubkey);
      
      setNewRelayUrl(''); // Clear input on success
    } catch (err) {
      console.error("Error adding relay:", err);
      setError(err instanceof Error ? err.message : 'Failed to add relay.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectRelay = async (url: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await relayService.disconnectFromRelay(url);
      
      // Update the published relay list after disconnecting
      const pubkey = await window.nostr.getPublicKey();
      await relayService.publishRelayList(pubkey);
    } catch (err) {
      console.error("Error disconnecting relay:", err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect relay.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectRelay = async (url: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await relayService.connectToRelays([url]);
      
      // Update the published relay list after connecting
      const pubkey = await window.nostr.getPublicKey();
      await relayService.publishRelayList(pubkey);
    } catch (err) {
      console.error("Error connecting relay:", err);
      setError(err instanceof Error ? err.message : 'Failed to connect relay.');
    } finally {
      setIsLoading(false);
    }
  };

  const connectedCount = relayStatuses.filter(relay => relay.status === 'connected').length;

  return (
    <div className={`mt-6 p-4 ${styles.glass} rounded-lg`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={styles.title}>
          Relay Connections
          <span className={styles.badge}>
            {" "} { connectedCount} connected
          </span>
        </h3>
      </div>

      <form onSubmit={handleAddRelay} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newRelayUrl}
          onChange={(e) => setNewRelayUrl(e.target.value)}
          className={`px-3 py-2 rounded-md ${styles.glassInput} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
          placeholder="wss://your.relay.com"
          disabled={isLoading}
        />
        <button
          type="submit"
          className={`px-4 py-2 rounded-md ${styles.glassButton} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={isLoading}
        >
          Add & Connect
        </button>
      </form>

      {error && <p className="text-red-500 text-sm mb-2">Error: {error}</p>}

      {isLoading && <p className="text-sm text-gray-500 mb-2">Processing...</p>}

      <div className="space-y-2">
        {relayStatuses.length === 0 && !isLoading && (
            <p className="text-sm text-gray-500">No relays configured or connected.</p>
        )}
        {relayStatuses.map(({ url, status, error: relayError }) => (
          <div 
            key={url} 
            className={`flex items-center justify-between p-3 ${styles.glassCard} rounded-md`}
          >
            <div className="flex-grow mr-2 overflow-hidden flex items-center">
                <div className={`${styles.statusDot} ${status === 'connected' ? styles.connected : styles.disconnected} mr-3`} />
                <span className="text-sm font-medium truncate">{url}</span>
                {relayError && <span className="block text-xs text-red-500 truncate ml-2">({relayError})</span>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(status === 'connected' || status === 'connecting' || status === 'error') && (
                <button
                  onClick={() => handleDisconnectRelay(url)}
                  className={`px-3 py-1 text-sm font-medium rounded-md text-red-600 ${styles.glassDisconnect} ${
                     isLoading ? 'opacity-50 cursor-not-allowed' : ''
                   }`}
                  disabled={isLoading}
                  title={`Disconnect from ${url}`}
                >
                  Disconnect
                </button>
              )}
              {status === 'disconnected' && (
                 <button
                  onClick={() => handleConnectRelay(url)}
                  className={`px-3 py-1 text-sm font-medium rounded-md border border-green-500 text-green-600 hover:bg-green-50 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={isLoading}
                  title={`Connect to ${url}`}
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}; 