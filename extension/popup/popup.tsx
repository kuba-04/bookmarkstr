import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthService } from './services/auth.service';
import { Login } from './components/Login';
import { RelayManager } from './components/RelayManager';
import ErrorBoundary from './components/ErrorBoundary';
import { RelayService } from './services/relay.service';
import { BookmarkService } from './services/bookmark.service';
import { ProcessedBookmark } from '../common/types';
import BookmarkList from './components/BookmarkList';

const Popup: React.FC = () => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<ProcessedBookmark[]>([]);
  const [isBookmarksLoading, setIsBookmarksLoading] = useState(false);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);

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
      <div className="min-w-[400px] min-h-[500px] p-4 flex justify-center items-center">
        <p>Loading Session...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-w-[400px] min-h-[500px] p-4 flex flex-col">
        <h1 className="text-2xl font-bold mb-4 text-center">Nostr Bookmarks</h1>
        {renderError()}
        {publicKey ? (
          <div className="flex-grow flex flex-col">
            <div className="mb-4 pb-4 border-b border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Logged in as:</p>
              <p className="text-xs font-mono break-all mb-3">{publicKey}</p>
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Logout
              </button>
            </div>
            
            <div className="mb-4">
              <RelayManager />
            </div>

            <div className="flex-grow overflow-auto">
              <h2 className="text-lg font-semibold mb-2">My Bookmarks</h2>
              <BookmarkList 
                bookmarks={bookmarks} 
                isLoading={isBookmarksLoading} 
                error={bookmarksError}
              />
            </div>

          </div>
        ) : (
          <Login onLoginSuccess={handleLoginSuccess} />
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