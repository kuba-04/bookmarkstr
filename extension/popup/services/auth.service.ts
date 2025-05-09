import { SimplePool, getPublicKey, nip19 } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

declare const browser: typeof chrome;

export class AuthService {
  private static instance: AuthService;
  private readonly storageKey = 'nostrUserPublicKey';
  private readonly secretKey = 'secretKey';
  private readonly isFirefox: boolean;
  private readonly storage: typeof chrome.storage.local;

  private constructor() {
    // Check if we're in Firefox by checking for the browser namespace
    this.isFirefox = typeof browser !== 'undefined';
    // Use browser.storage.local for Firefox, chrome.storage.local for Chrome
    this.storage = this.isFirefox ? browser.storage.local : chrome.storage.local;
    console.log('[AuthService] Using storage:', this.isFirefox ? 'browser.storage.local' : 'chrome.storage.local');
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Logs in the user using a private key (nsec or hex).
   * Validates the key, derives the public key, and stores it in storage.
   * @param privateKey The private key string (nsec or hex format).
   * @returns The public key (hex format) if login is successful.
   * @throws Error if the private key is invalid.
   */
  async login(privateKey: string): Promise<{ publicKey: string, secretKey: string }> {
    let pkBytes: Uint8Array; // Private key bytes

    try {
      // Check if it's nsec format
      if (privateKey.startsWith('nsec')) {
        const { type, data } = nip19.decode(privateKey);
        if (type !== 'nsec') {
          throw new Error('Invalid nsec private key format.');
        }
        pkBytes = data; // data is already Uint8Array
      } else {
        // Assume hex format, validate length
        if (!/^[a-f0-9]{64}$/.test(privateKey)) {
          throw new Error('Invalid hex private key format.');
        }
        pkBytes = hexToBytes(privateKey); // Convert hex to Uint8Array
      }

      // getPublicKey expects private key Uint8Array, returns public key hex string
      const publicKeyHex = getPublicKey(pkBytes);
      const secretKeyHex = bytesToHex(pkBytes);

      // Store the keys in storage with additional metadata
      const storageData = {
        [this.storageKey]: publicKeyHex,
        [this.secretKey]: secretKeyHex,
        lastLogin: Date.now() // Add timestamp for session management
      };
      
      await this.storage.set(storageData);
      console.log('[AuthService] Login successful, data stored:', {
        storage: this.isFirefox ? 'browser.storage.local' : 'chrome.storage.local',
        publicKeyLength: publicKeyHex.length,
        hasSecretKey: !!secretKeyHex
      });

      return { publicKey: publicKeyHex, secretKey: secretKeyHex };
    } catch (error) {
      console.error('[AuthService] Login failed:', error);
      if (error instanceof Error) {
        throw new Error(`Private key validation failed: ${error.message}`);
      }
      throw new Error('Private key validation failed due to an unknown error.');
    }
  }

  /**
   * Logs out the current user by removing the public key from storage.
   */
  async logout(): Promise<void> {
    try {
      await this.storage.remove([this.storageKey, this.secretKey, 'lastLogin']);
      console.log('[AuthService] User logged out, keys removed from storage');
    } catch (error) {
      console.error('[AuthService] Error during logout:', error);
      // Still try to clear the keys even if there's an error
      try {
        await this.storage.remove([this.storageKey, this.secretKey, 'lastLogin']);
      } catch (e) {
        console.error('[AuthService] Failed to clear storage during error recovery:', e);
      }
    }
  }

  /**
   * Checks if a user is currently logged in by looking for the public key in storage.
   * @returns The public key (hex format) if logged in, otherwise null.
   */
  async getLoggedInUser(): Promise<{ publicKey: string | null, secretKey: string | null }> {
    try {
      const result = await this.storage.get([this.storageKey, this.secretKey, 'lastLogin']);
      
      // For debugging
      console.log('[AuthService] Retrieved storage data:', {
        storage: this.isFirefox ? 'browser.storage.local' : 'chrome.storage.local',
        hasPublicKey: !!result[this.storageKey],
        hasSecretKey: !!result[this.secretKey],
        lastLogin: result.lastLogin
      });

      return {
        publicKey: result[this.storageKey] || null,
        secretKey: result[this.secretKey] || null
      };
    } catch (error) {
      console.error('[AuthService] Error getting logged in user:', error);
      return {
        publicKey: null,
        secretKey: null
      };
    }
  }
} 