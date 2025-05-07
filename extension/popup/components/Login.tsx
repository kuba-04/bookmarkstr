import React, { useState } from 'react';
import { AuthService } from '../services/auth.service';
import styles from '../styles/glassmorphism.module.css';

interface LoginProps {
  onLoginSuccess: (publicKey: string, secretKey: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [privateKey, setPrivateKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const authService = AuthService.getInstance();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!privateKey.trim()) {
      setError('Private key cannot be empty.');
      setIsLoading(false);
      return;
    }

    try {
      const { publicKey, secretKey } = await authService.login(privateKey);
      onLoginSuccess(publicKey, secretKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`p-6 ${styles.glass} rounded-lg max-w-md mx-auto`}>
      <div className="text-center mb-6">
        <p className="text-gray-600 text-sm">
          Sign in with your Nostr private key to access your bookmarks across devices
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <div className={`${styles.inputWrapper} relative`}>
            <input
              type="password"
              id="privateKey"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg ${styles.glassInput} focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-base`}
              placeholder="Enter your nsec or hex key"
              disabled={isLoading}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-md p-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          className={`w-full py-3 px-4 rounded-lg ${styles.glassButton} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-base font-medium ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Logging in...
            </span>
          ) : (
            'Sign In'
          )}
        </button>

        <p className="text-center text-xs text-gray-500 mt-4">
          Your private key is only stored locally and never shared with any server
        </p>
      </form>
    </div>
  );
}; 