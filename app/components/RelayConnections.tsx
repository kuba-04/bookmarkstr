import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/glassmorphism.module.css';

const RelayConnections = () => {
  const [connections, setConnections] = useState([
    { url: 'wss://relay.damus.io', connected: true },
    { url: 'wss://nos.lol', connected: true },
    { url: 'wss://nostr.land', connected: true },
    { url: 'wss://relay.primal.net', connected: true }
  ]);
  const [newRelay, setNewRelay] = useState('');

  const handleDisconnect = (url: string) => {
    setConnections(connections.map(conn => 
      conn.url === url ? {...conn, connected: false} : conn
    ));
  };

  const handleAddRelay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelay) return;
    
    setConnections([...connections, { url: newRelay, connected: true }]);
    setNewRelay('');
  };

  return (
    <div className={styles.container}>
      <div className={`p-6 max-w-md w-full ${styles.glass} rounded-xl space-y-4`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={styles.title}>
            Relay Connections 
            <span className={styles.badge}>
               {connections.filter(c => c.connected).length} connected
            </span>
          </h2>
        </div>

        <form onSubmit={handleAddRelay} className="flex gap-2 mb-6">
          <input
            type="text"
            value={newRelay}
            onChange={(e) => setNewRelay(e.target.value)}
            placeholder="wss://your.relay.com"
            className={`px-4 py-2 rounded-lg ${styles.glassInput} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
          />
          <button
            type="submit"
            className={`px-4 py-2 rounded-lg ${styles.glassButton}`}
          >
            Add
          </button>
        </form>

        <div className="space-y-3">
          <AnimatePresence>
            {connections.map((connection) => (
              <motion.div
                key={connection.url}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex items-center justify-between p-4 rounded-lg ${styles.glassCard}`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`${styles.statusDot} ${connection.connected ? styles.connected : styles.disconnected}`} />
                  <span className="text-sm font-medium text-gray-700">{connection.url}</span>
                </div>
                
                {connection.connected && (
                  <button
                    onClick={() => handleDisconnect(connection.url)}
                    className={`px-3 py-1 text-sm text-red-600 rounded-md ${styles.glassDisconnect}`}
                  >
                    Disconnect
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default RelayConnections; 