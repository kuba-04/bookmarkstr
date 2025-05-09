import React, { useState, useEffect } from 'react';
import { RelayService, RelayStatus } from '../services/relay.service';
import { AuthService } from '../services/auth.service';
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
  const authService = AuthService.getInstance();

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
      const { publicKey, secretKey } = await authService.getLoggedInUser();
      if (!publicKey || !secretKey) {
        throw new Error('User not logged in');
      }
      await relayService.publishRelayList(publicKey, secretKey);
      
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
      const { publicKey, secretKey } = await authService.getLoggedInUser();
      if (!publicKey || !secretKey) {
        throw new Error('User not logged in');
      }
      await relayService.publishRelayList(publicKey, secretKey);
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
      const { publicKey, secretKey } = await authService.getLoggedInUser();
      if (!publicKey || !secretKey) {
        throw new Error('User not logged in');
      }
      await relayService.publishRelayList(publicKey, secretKey);
    } catch (err) {
      console.error("Error connecting relay:", err);
      setError(err instanceof Error ? err.message : 'Failed to connect relay.');
    } finally {
      setIsLoading(false);
    }
  };

  const connectedCount = relayStatuses.filter(relay => relay.status === 'connected').length;

  return (
    <div className={`mt-2 ${styles.glass} rounded-lg text-xs`}>
      <div className="p-2 flex flex-col">
        <div className="flex items-center gap-1 text-[11px]">
          <span className="opacity-70">Relays</span>
          <span className="opacity-70">{connectedCount}</span>
          <button className="ml-auto opacity-50 hover:opacity-100">
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleAddRelay} className="flex gap-1 mb-2">
          <input
            type="text"
            value={newRelayUrl}
            onChange={(e) => setNewRelayUrl(e.target.value)}
            className={`px-1.5 py-1 text-xs rounded-md ${styles.glassInput} focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent flex-1 min-w-0`}
            placeholder="wss://your.relay.com"
            disabled={isLoading}
          />
          <button
            type="submit"
            className={`px-1.5 py-1 text-xs rounded-md ${styles.glassButton} focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-indigo-500 whitespace-nowrap flex-shrink-0 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={isLoading}
          >
            Add
          </button>
        </form>

        {error && <p className="text-red-500 text-xs mb-1">Error: {error}</p>}
        {isLoading && <p className="text-xs text-gray-500 mb-1">Processing...</p>}

        <div className="space-y-0.5">
          {relayStatuses.length === 0 && !isLoading && (
              <p className="text-xs text-gray-500">No relays configured.</p>
          )}
          {relayStatuses.map(({ url, status, error: relayError }) => (
            <div 
              key={url} 
              className={`flex items-center justify-between py-1 px-1.5 ${styles.glassCard} rounded-md`}
            >
              <div className="flex-grow mr-1 overflow-hidden flex items-center min-w-0">
                  <div className={`${styles.statusDot} ${status === 'connected' ? styles.connected : styles.disconnected} mr-1.5 flex-shrink-0 w-1.5 h-1.5`} />
                  <span className="text-xs font-medium truncate flex-1 min-w-0">{url}</span>
                  {relayError && <span className="text-xs text-red-500 truncate ml-1 flex-shrink-0">({relayError})</span>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                {(status === 'connected' || status === 'connecting' || status === 'error') && (
                  <button
                    onClick={() => handleDisconnectRelay(url)}
                    className={`px-1.5 py-0.5 text-xs font-medium rounded-md text-red-600 ${styles.glassDisconnect} ${
                       isLoading ? 'opacity-50 cursor-not-allowed' : ''
                     }`}
                    disabled={isLoading}
                    title={url}
                  >
                    Disconnect
                  </button>
                )}
                {status === 'disconnected' && (
                   <button
                    onClick={() => handleConnectRelay(url)}
                    className={`px-1.5 py-0.5 text-xs font-medium rounded-md border border-green-500 text-green-600 hover:bg-green-50 ${
                      isLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={isLoading}
                    title={url}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 