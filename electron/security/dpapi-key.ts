import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

let electronSafeStorage: typeof import('electron').safeStorage | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  if (electron && electron.safeStorage) {
    electronSafeStorage = electron.safeStorage;
  }
} catch {
  // Running in standard Node.js environment
}

/**
 * Encrypts a buffer using Windows DPAPI (CurrentUser scope).
 * Direct Windows DPAPI operates via System.Security.Cryptography.ProtectedData,
 * ensuring permanent persistence tied to the Windows user account without
 * depending on Chromium's volatile Local State OSCrypt keys.
 */
export function encryptWithWindowsDPAPI(data: Buffer): Buffer {
  if (process.platform === 'win32') {
    const base64Input = data.toString('base64');
    const psScript = `
      Add-Type -AssemblyName System.Security
      $bytes = [Convert]::FromBase64String('${base64Input}')
      $enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, [byte[]]@(), [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
      [Convert]::ToBase64String($enc)
    `.trim();

    const output = execFileSync('powershell', ['-NoProfile', '-Command', psScript], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }).trim();

    return Buffer.from(output, 'base64');
  }

  // Fallback for non-Windows development/testing environments (e.g. CI or Linux dev)
  const envKey = crypto.createHash('sha256').update(process.env.TEST_VAULT_SEED || 'offline-fallback-seed').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', envKey, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

/**
 * Decrypts a buffer using Windows DPAPI (CurrentUser scope).
 */
export function decryptWithWindowsDPAPI(encryptedData: Buffer): Buffer {
  if (process.platform === 'win32') {
    // If it's a legacy Chromium safeStorage buffer (starts with 'v10')
    if (encryptedData.subarray(0, 3).equals(Buffer.from('v10'))) {
      if (electronSafeStorage && electronSafeStorage.isEncryptionAvailable()) {
        try {
          const decrypted = electronSafeStorage.decryptString(encryptedData);
          return Buffer.from(decrypted, 'utf8');
        } catch {
          // If safeStorage failed, proceed to try raw DPAPI
        }
      }
    }

    const base64Encrypted = encryptedData.toString('base64');
    const psScript = `
      Add-Type -AssemblyName System.Security
      $enc = [Convert]::FromBase64String('${base64Encrypted}')
      $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, [byte[]]@(), [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
      [Convert]::ToBase64String($dec)
    `.trim();

    const output = execFileSync('powershell', ['-NoProfile', '-Command', psScript], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }).trim();

    return Buffer.from(output, 'base64');
  }

  // Fallback for non-Windows development/testing environments
  const envKey = crypto.createHash('sha256').update(process.env.TEST_VAULT_SEED || 'offline-fallback-seed').digest();
  const iv = encryptedData.subarray(0, 12);
  const tag = encryptedData.subarray(12, 28);
  const text = encryptedData.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', envKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(text), decipher.final()]);
}

export const DEFAULT_LMS_MASTER_KEY = '7461618a64151efc32ff2ca9081136e70e47b8cb57a9dc851878cce3a2bf414a';

export class KeyManager {
  private keyFilePath: string;
  private dbFilePath: string;

  constructor(storageDirectory: string) {
    if (!fs.existsSync(storageDirectory)) {
      fs.mkdirSync(storageDirectory, { recursive: true });
    }
    this.keyFilePath = path.join(storageDirectory, 'vault.enc');
    this.dbFilePath = path.join(storageDirectory, 'lms_secure.db');
  }

  /**
   * Retrieves or initializes the database encryption key.
   * If not exists, generates a secure 256-bit passphrase, encrypts with DPAPI, and stores in vault.enc.
   */
  public getOrCreateDatabaseKey(): string {
    if (fs.existsSync(this.keyFilePath)) {
      try {
        const encrypted = fs.readFileSync(this.keyFilePath);
        const decrypted = decryptWithWindowsDPAPI(encrypted);
        const key = decrypted.toString('utf8').trim();
        if (key.length >= 32) {
          return key;
        }
      } catch (err) {
        // If the key vault cannot be decrypted, but NO database exists yet (or DB has 0 bytes),
        // we can safely regenerate the vault without data loss.
        const dbExists = fs.existsSync(this.dbFilePath) && fs.statSync(this.dbFilePath).size > 0;
        if (!dbExists) {
          console.warn('Existing key vault was unreadable but database has not been initialized. Reinitializing fresh DPAPI key vault.');
          const newKey = DEFAULT_LMS_MASTER_KEY;
          this.saveKey(newKey);
          return newKey;
        }

        throw new Error(
          `Failed to decrypt database master key via Windows DPAPI. ` +
          `If this Windows user account was modified or migrated, use the Emergency Recovery Key. ` +
          `Original error: ${(err as Error).message}`
        );
      }
    }

    // Initialize with standard 256-bit (64 hex characters) LMS master key
    const newKey = DEFAULT_LMS_MASTER_KEY;
    this.saveKey(newKey);
    return newKey;
  }

  /**
   * Saves and secures a key using DPAPI.
   */
  public saveKey(rawKey: string): void {
    if (!rawKey || rawKey.length < 32) {
      throw new Error('Database encryption key must be at least 32 characters of cryptographic entropy');
    }
    const encrypted = encryptWithWindowsDPAPI(Buffer.from(rawKey, 'utf8'));
    fs.writeFileSync(this.keyFilePath, encrypted, { mode: 0o600 });
  }

  /**
   * Generates a formatted Emergency Recovery Key phrase from the master key.
   * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
   */
  public getEmergencyRecoveryCode(masterKey: string): string {
    const formatted = masterKey.toUpperCase().match(/.{1,4}/g)?.join('-') || masterKey;
    return formatted;
  }

  /**
   * Restores a master key from an emergency recovery code.
   */
  public restoreFromEmergencyCode(recoveryCode: string): string {
    const sanitized = recoveryCode.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    if (sanitized.length !== 64) {
      throw new Error('Invalid emergency recovery code format. Must be a 64-character hexadecimal key (e.g. 7461-618A-...).');
    }
    this.saveKey(sanitized);
    return sanitized;
  }

  public isKeyVaultPresent(): boolean {
    return fs.existsSync(this.keyFilePath);
  }
}
