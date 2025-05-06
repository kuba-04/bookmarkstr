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

// Debug component to show connection status 
const ConnectionDebugInfo = ({ relayService, isVisible }: { relayService: RelayService, isVisible: boolean }) => {
  if (!isVisible) return null;

  const connectedRelays = relayService.getConnectedRelays();
  const allRelays = relayService.getRelayStatuses();
  
  return (
    <div className="text-xs bg-gray-50 border border-gray-200 rounded-md p-2 mb-3">
      <h4 className="font-medium mb-1">Connection Debug Info:</h4>
      <div>
        <p><span className="font-medium">Connected relays:</span> {connectedRelays.length}</p>
        <div className="ml-2">
          {connectedRelays.length > 0 ? (
            connectedRelays.map((url, i) => (
              <p key={i} className="truncate text-green-600">{url}</p>
            ))
          ) : (
            <p className="text-red-500">No connected relays</p>
          )}
        </div>
      </div>
      <div className="mt-1">
        <p><span className="font-medium">All relay statuses:</span> {allRelays.length}</p>
        <div className="ml-2 max-h-20 overflow-y-auto">
          {allRelays.map((relay, i) => (
            <p key={i} className={`truncate ${relay.status === 'connected' ? 'text-green-600' : relay.status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
              {relay.url} - {relay.status} {relay.error ? `(${relay.error})` : ''}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

const Popup: React.FC = () => {
  // Add a new state for debug mode
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  
  const [publicKey, setPublicKey] = useState<string | null>(null);
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
      console.log('[Popup] Checking auth status...');
      setIsAuthLoading(true);
      setInitializationError(null);
      setBookmarksError(null);
      let userPk: string | null = null;
      try {
        userPk = await authService.getLoggedInUser();
        setPublicKey(userPk);
        if (userPk) {
          console.log(`[Popup] User ${userPk} is logged in. Initializing relays...`);
          await relayService.initializeForUser(userPk);
          console.log(`[Popup] Relay initialization attempt finished for ${userPk}.`);
          fetchAndSetBookmarks(userPk);
        } else {
          console.log('[Popup] No user logged in.');
        }
      } catch (error) {
        console.error("[Popup] Error during initial auth check or relay init:", error);
        setInitializationError(error instanceof Error ? error.message : "Failed to initialize session");
        if (userPk) setPublicKey(userPk); 
      } finally {
        setIsAuthLoading(false);
      }
    };

    checkAuthAndInitRelays();
    return () => {
      // relayService.cleanup(); // Consider if cleanup is needed here or managed elsewhere
    };
  }, []);

  useEffect(() => {
    if (bookmarksError || initializationError) {
      setShowDebugInfo(true);
    }
  }, [bookmarksError, initializationError]);

  const fetchAndSetBookmarks = async (pk: string) => {
    if (!pk) return;
    console.log(`[Popup] Fetching bookmarks for ${pk}...`);
    setIsBookmarksLoading(true);
    setBookmarksError(null);
    try {
      const fetchedBookmarks = await bookmarkService.fetchBookmarks(pk);
      setBookmarks(fetchedBookmarks);
      console.log(`[Popup] Fetched ${fetchedBookmarks.length} bookmarks.`);
    } catch (error) {
      console.error(`[Popup] Error fetching bookmarks for ${pk}:`, error);
      setBookmarksError(error instanceof Error ? error.message : "Failed to fetch bookmarks");
      setBookmarks([]);
    } finally {
      setIsBookmarksLoading(false);
    }
  };

  const handleLoginSuccess = async (pk: string) => {
    console.log(`[Popup] Login successful for ${pk}. Initializing relays...`);
    setIsAuthLoading(true);
    setInitializationError(null);
    setBookmarksError(null);
    setPublicKey(pk);
    setBookmarks([]);
    try {
      await relayService.initializeForUser(pk);
      console.log(`[Popup] Relay initialization attempt finished for ${pk}.`);
      fetchAndSetBookmarks(pk);
    } catch (error) {
      console.error(`[Popup] Error initializing relays after login for ${pk}:`, error);
      setInitializationError(error instanceof Error ? error.message : "Failed to initialize relays after login");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    console.log('[Popup] Logging out...');
    setIsAuthLoading(true);
    setInitializationError(null);
    setBookmarksError(null);
    try {
      console.log('[Popup] Cleaning up relay connections...');
      relayService.cleanup();
      await authService.logout();
      setPublicKey(null);
      setBookmarks([]);
      console.log('[Popup] Logout successful.');
    } catch (error) {
      console.error("[Popup] Error during logout or relay cleanup:", error);
      setPublicKey(null);
      setBookmarks([]);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    console.log('[Popup] handleDeleteBookmark called with:', bookmarkId);
    if (!publicKey) {
      console.warn('[Popup] Cannot delete bookmark: no public key');
      return;
    }
    
    // Optimistically update UI by removing the bookmark immediately
    const bookmarkToDelete = bookmarks.find(b => b.id === bookmarkId);
    if (bookmarkToDelete) {
      setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
    }
    
    try {
      const usableRelays = relayService.getConnectedRelays();
      console.log(`[Popup] Currently have ${usableRelays.length} usable relay connections`);
      
      if (usableRelays.length === 0) {
        try {
        } catch (error) {
          console.warn('[Popup] Error during relay reconnection:', error);
          // Continue anyway - the bookmark service will handle relay issues
        }
      }
      
      // Delete the bookmark
      await bookmarkService.deleteBookmark(bookmarkId, publicKey);
      console.log(`[Popup] Successfully deleted bookmark ${bookmarkId}`);
      
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
          // Handle both old and new bookmark formats
          const timeA = 'createdAt' in a ? a.createdAt : a.created_at;
          const timeB = 'createdAt' in b ? b.createdAt : b.created_at;
          return timeB - timeA;
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
      <div className="min-w-[400px] min-h-[500px] p-4 flex justify-center items-center bg-gray-50">
        <div className="flex flex-col items-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Loading Session...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-w-[400px] min-h-[500px] flex flex-col bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800 text-center">Bookmarkstr</h1>
        </header>
        
        {renderError()}
        
        {publicKey ? (
          <div className="flex-grow flex flex-col p-4 space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Logged in as:</p>
                  <p className="text-xs font-mono break-all text-gray-500">{publicKey}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="ml-4 px-3 py-1.5 border border-red-200 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150"
                >
                  Logout
                </button>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <button 
                  onClick={() => setShowRelayManager(!showRelayManager)}
                  className="flex items-center text-lg font-medium text-gray-800 focus:outline-none"
                >
                  <span>Relay Connections</span>
                  <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                    {relayService.getRelayStatuses().filter(status => status.status === 'connected').length} connected
                  </span>
                  <svg 
                    className={`ml-2 w-5 h-5 transition-transform ${showRelayManager ? 'transform rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              
              {showRelayManager && <RelayManager />}
            </div>

            <div className="flex-grow bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-hidden flex flex-col">
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-800">My Bookmarks</h2>
                  <div className="flex items-center space-x-2">
                    {!isBookmarksLoading && (
                      <button 
                        onClick={() => fetchAndSetBookmarks(publicKey!)} 
                        className="text-xs text-blue-600 hover:text-blue-800"
                        title="Retry loading bookmarks"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    )}
                    <button 
                      onClick={() => setShowDebugInfo(!showDebugInfo)} 
                      className="text-xs text-gray-500 hover:text-gray-700"
                      title={showDebugInfo ? "Hide debug info" : "Show debug info"}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    {isBookmarksLoading && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    )}
                  </div>
                </div>
                
                <ConnectionDebugInfo 
                  relayService={relayService} 
                  isVisible={showDebugInfo} 
                />
              </div>
              <div className="flex-grow overflow-auto -mx-4 px-4">
                <BookmarkList 
                  bookmarks={bookmarks} 
                  isLoading={isBookmarksLoading} 
                  error={bookmarksError}
                  onDeleteBookmark={handleDeleteBookmark}
                />
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