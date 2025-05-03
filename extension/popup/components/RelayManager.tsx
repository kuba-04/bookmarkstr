import React, { useState, useEffect } from 'react';
import { RelayService, RelayStatus } from '../services/relay.service';

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
      await relayService.disconnectFromRelay(urlToAdd); // First disconnect if exists
      await relayService.initializeForUser('dummy'); // Use a method that calls connectToRelays internally
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
        await relayService.initializeForUser('dummy'); // Use a method that calls connectToRelays internally
    } catch (err) {
        console.error("Error connecting relay:", err);
        setError(err instanceof Error ? err.message : 'Failed to connect relay.');
    } finally {
        setIsLoading(false);
    }
  };

  const getStatusColor = (status: RelayStatus['status']): string => {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'connecting':
      case 'disconnecting': return 'text-yellow-600';
      case 'disconnected': return 'text-gray-500';
      case 'error': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="mt-6">
      <h3 className="text-lg font-medium mb-3">Relay Connections</h3>

      <form onSubmit={handleAddRelay} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newRelayUrl}
          onChange={(e) => setNewRelayUrl(e.target.value)}
          className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          placeholder="wss://your.relay.com"
          disabled={isLoading}
        />
        <button
          type="submit"
          className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={isLoading}
        >
          Add & Connect
        </button>
      </form>

      {error && <p className="text-red-500 text-sm mb-2">Error: {error}</p>}

      {isLoading && <p className="text-sm text-gray-500 mb-2">Processing...</p>}

      <ul className="space-y-2">
        {relayStatuses.length === 0 && !isLoading && (
            <p className="text-sm text-gray-500">No relays configured or connected.</p>
        )}
        {relayStatuses.map(({ url, status, error: relayError }) => (
          <li key={url} className="flex items-center justify-between p-2 border rounded-md bg-gray-50">
            <div className="flex-grow mr-2 overflow-hidden">
                <span className="text-sm font-medium truncate">{url}</span>
                {relayError && <span className="block text-xs text-red-500 truncate">({relayError})</span>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-sm font-semibold ${getStatusColor(status)}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              {(status === 'connected' || status === 'connecting' || status === 'error') && (
                <button
                  onClick={() => handleDisconnectRelay(url)}
                  className={`px-2 py-1 text-xs font-medium rounded border border-red-500 text-red-600 hover:bg-red-50 ${
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
                  className={`px-2 py-1 text-xs font-medium rounded border border-green-500 text-green-600 hover:bg-green-50 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={isLoading}
                  title={`Connect to ${url}`}
                >
                  Connect
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}; 