import { SimplePool, getPublicKey, nip19 } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export class AuthService {
  private static instance: AuthService;
  private readonly storageKey = 'nostrUserPublicKey';
  private readonly secretKey = 'secretKey';

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Logs in the user using a private key (nsec or hex).
   * Validates the key, derives the public key, and stores it in local storage.
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

      // Store the keys hex string
      await chrome.storage.local.set({ [this.storageKey]: publicKeyHex });
      await chrome.storage.local.set({ [this.secretKey]: secretKeyHex });

      return { publicKey: publicKeyHex, secretKey: secretKeyHex };
    } catch (error) {
      console.error('Login failed:', error);
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
    await chrome.storage.local.remove([this.storageKey, this.secretKey]);
    console.log('User logged out, public key removed from storage.');
  }

  /**
   * Checks if a user is currently logged in by looking for the public key in storage.
   * @returns The public key (hex format) if logged in, otherwise null.
   */
  async getLoggedInUser(): Promise<{ publicKey: string | null, secretKey: string | null }> {
    const result = await chrome.storage.local.get([this.storageKey, this.secretKey]);
    return {
      publicKey: result[this.storageKey] || null,
      secretKey: result[this.secretKey] || null
    };
  }
} 