import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';
import { AuthService } from './services/auth.service';
import { Login } from './components/Login';
import { RelayManager } from './components/RelayManager';
import ErrorBoundary from './components/ErrorBoundary';
import { RelayService } from './services/relay.service';
import { BookmarkService } from './services/bookmark.service';
import { ProcessedBookmark } from '../common/types';
import BookmarkList from './components/BookmarkList';
import styles from './styles/glassmorphism.module.css';
import { nip19 } from 'nostr-tools';

const Popup: React.FC = () => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<ProcessedBookmark[]>([]);
  const [isBookmarksLoading, setIsBookmarksLoading] = useState(false);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);
  const [showRelayManager, setShowRelayManager] = useState(false);

  const authService = AuthService.getInstance();
  const relayService = RelayService.getInstance();
  const bookmarkService = useMemo(() => new BookmarkService(relayService), [relayService]);

  useEffect(() => {
    const checkAuthAndInitRelays = async () => {
      setIsAuthLoading(true);
      setInitializationError(null);
      setBookmarksError(null);
      let keySet: { publicKey: string | null, secretKey: string | null } | null = null;
      try {
        keySet = await authService.getLoggedInUser();

        setPublicKey(keySet.publicKey);
        setSecretKey(keySet.secretKey);
        if (keySet.publicKey) {
          await relayService.initializeForUser(keySet.publicKey);
          fetchAndSetBookmarks(keySet.publicKey);
        }
      } catch (error) {
        console.error("[Popup] Error during initial auth check or relay init:", error);
        setInitializationError(error instanceof Error ? error.message : "Failed to initialize session");
        if (keySet) setPublicKey(keySet.publicKey); 
      } finally {
        setIsAuthLoading(false);
      }
    };

    checkAuthAndInitRelays();
    return () => {
      // relayService.cleanup(); // Consider if cleanup is needed here or managed elsewhere
    };
  }, []);

  const fetchAndSetBookmarks = async (pk: string) => {
    if (!pk) return;
    setIsBookmarksLoading(true);
    setBookmarksError(null);
    try {
      const fetchedBookmarks = await bookmarkService.fetchBookmarks(pk);
      setBookmarks(fetchedBookmarks);
    } catch (error) {
      console.error(`[Popup] Error fetching bookmarks for ${pk}:`, error);
      setBookmarksError(error instanceof Error ? error.message : "Failed to fetch bookmarks");
      setBookmarks([]);
    } finally {
      setIsBookmarksLoading(false);
    }
  };

  const handleLoginSuccess = async (pk: string, secretKey: string) => {
    setInitializationError(null);
    setBookmarksError(null);
    setPublicKey(pk);
    setSecretKey(secretKey);
    setBookmarks([]);
    try {
      await relayService.initializeForUser(pk);
      fetchAndSetBookmarks(pk);
    } catch (error) {
      console.error(`[Popup] Error initializing relays after login for ${pk}:`, error);
      setInitializationError(error instanceof Error ? error.message : "Failed to initialize relays after login");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsAuthLoading(true);
    setInitializationError(null);
    setBookmarksError(null);
    try {
      relayService.cleanup();
      await authService.logout();
      setPublicKey(null);
      setSecretKey(null);
      setBookmarks([]);
    } catch (error) {
      console.error("[Popup] Error during logout or relay cleanup:", error);
      setPublicKey(null);
      setBookmarks([]);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    if (!publicKey || !secretKey) {
      console.warn('[Popup] Cannot delete bookmark: no public key or secret key');
      return;
    }
    
    // Optimistically update UI by removing the bookmark immediately
    const bookmarkToDelete = bookmarks.find(b => b.id === bookmarkId);
    if (bookmarkToDelete) {
      setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
    }
    
    try {
      const usableRelays = relayService.getConnectedRelays();
      
      if (usableRelays.length === 0) {
        try {
        } catch (error) {
          console.warn('[Popup] Error during relay reconnection:', error);
          // Continue anyway - the bookmark service will handle relay issues
        }
      }
      
      // Delete the bookmark
      await bookmarkService.deleteBookmark(bookmarkId, publicKey, secretKey);
      
      // Refresh bookmarks list to ensure consistency with server state
      // Use a small delay to allow relays to process the update
      setTimeout(() => {
        // Check if we still have the public key (user hasn't logged out)
        if (publicKey) {
          fetchAndSetBookmarks(publicKey).catch(error => {
            console.error('[Popup] Error refreshing bookmarks after deletion:', error);
          });
        }
      }, 3000); // Increased delay to 1.5 seconds to give more time for relay processing
    } catch (error) {
      console.error('[Popup] Error deleting bookmark:', error);
      
      // Revert the optimistic update if deletion failed
      if (bookmarkToDelete) {
        setBookmarks(prev => [...prev, bookmarkToDelete].sort((a, b) => {
          return b.createdAt - a.createdAt;
        }));
      }
      
      setBookmarksError('Failed to delete bookmark. Please try again.');
    }
  };

  const renderError = () => {
    if (!initializationError) return null;
    return (
      <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded mb-4">
        <p className="font-bold">Initialization Error:</p>
        <p>{initializationError}</p>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="w-[320px] min-h-[500px] p-4 flex justify-center items-center">
        <div className="flex flex-col items-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="text-gray-700">Connecting to relays...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="w-[320px] min-h-[500px] flex flex-col">
        <header className={`px-4 py-3 ${styles.glass} mb-4 shadow-lg`}>
          <h1 className="text-2xl font-bold text-gray-800 text-center">Bookmarkstr</h1>
        </header>
        
        {renderError()}
        
        {publicKey ? (
          <div className="flex-grow flex flex-col p-4 space-y-4">
            <div className={`rounded-lg ${styles.glass} p-4`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">Logged in as:</p>
                  <p className="text-xs font-mono break-all text-gray-600">{publicKey ? nip19.npubEncode(publicKey) : ''}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className={`ml-4 p-2 rounded-md text-sm font-medium text-red-600 ${styles.glassDisconnect} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150 hover:text-red-700`}
                  title="Logout"
                >
                  <svg 
                    className="w-5 h-5" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" 
                    />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className={`rounded-lg ${styles.glass} p-2`}>
              <div className="flex items-center justify-between">
                <button 
                  onClick={() => setShowRelayManager(!showRelayManager)}
                  className="flex items-center text-xs font-medium text-gray-800 focus:outline-none"
                >
                  <span>Relay Connections</span>
                  <span className="ml-1 text-[10px] bg-green-50/50 text-green-600 px-1 py-0.5 rounded">
                    {relayService.getRelayStatuses().filter(status => status.status === 'connected').length} connected
                  </span>
                  <svg 
                    className={`ml-1 w-3 h-3 transition-transform ${showRelayManager ? 'transform rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              
              {showRelayManager && (
                <div className="mt-2">
                  <RelayManager />
                </div>
              )}
            </div>

            <div className={`flex-grow rounded-lg ${styles.glass} p-4 overflow-hidden flex flex-col`}>
              <div className="flex flex-col">
                <div className="flex-grow overflow-auto -mx-4 px-4">
                  <BookmarkList 
                    bookmarks={bookmarks} 
                    isLoading={isBookmarksLoading} 
                    error={bookmarksError}
                    onDeleteBookmark={handleDeleteBookmark}
                    onRefresh={() => fetchAndSetBookmarks(publicKey!)}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-grow p-4">
            <Login onLoginSuccess={handleLoginSuccess} />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <Popup />
    </ErrorBoundary>
  </React.StrictMode>
); 