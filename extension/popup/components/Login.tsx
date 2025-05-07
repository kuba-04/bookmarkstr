import React, { useState } from 'react';
import { AuthService } from '../services/auth.service';

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
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Login with Private Key</h2>
      <form onSubmit={handleLogin}>
        <div className="mb-4">
          <label htmlFor="privateKey" className="block text-sm font-medium text-gray-700 mb-1">
            Private Key (nsec or hex):
          </label>
          <input
            type="password"
            id="privateKey"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="nsec... or hex..."
            disabled={isLoading}
          />
        </div>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <button
          type="submit"
          className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={isLoading}
        >
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}; 