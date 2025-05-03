import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthService } from './services/auth.service';
import { Login } from './components/Login';
import { RelayManager } from './components/RelayManager';
import ErrorBoundary from './components/ErrorBoundary';

const Popup: React.FC = () => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start loading initially
  const authService = AuthService.getInstance();

  useEffect(() => {
    // Check login status when the component mounts
    const checkAuth = async () => {
      setIsLoading(true);
      try {
        const userPk = await authService.getLoggedInUser();
        setPublicKey(userPk);
      } catch (error) {
        console.error("Error checking auth status:", error);
        // Handle error appropriately, maybe show an error message
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleLoginSuccess = (pk: string) => {
    setPublicKey(pk);
    setIsLoading(false); // Ensure loading is off after login
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setPublicKey(null);
      // TODO: Consider disconnecting relays on logout? RelayService.getInstance().disconnectAllRelays();
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && publicKey === null) {
    return (
      <div className="min-w-[400px] min-h-[500px] p-4 flex justify-center items-center">
        <p>Loading...</p> {/* Or a spinner component */}
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-w-[400px] min-h-[500px]">
        {publicKey ? (
          // Logged-in view
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold">Bookmarkstr</h1>
              <button
                onClick={handleLogout}
                className="px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                disabled={isLoading}
              >
                Logout
              </button>
            </div>
            <p className="text-sm mb-1">Welcome back!</p>
            <p className="text-xs break-all mb-4">Public Key: {publicKey}</p>

            <RelayManager />

            {/* TODO: Add main bookmark listing component here */}
          </div>
        ) : (
          // Login view
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