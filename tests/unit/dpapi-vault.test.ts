import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  KeyManager,
  encryptWithWindowsDPAPI,
  decryptWithWindowsDPAPI,
} from '../../electron/security/dpapi-key';

describe('Security: Windows DPAPI Key Management & Vault', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-dpapi-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('encrypts and decrypts arbitrary secret data using DPAPI', () => {
    const rawSecret = Buffer.from('DatabaseMasterEncryptionSecret_2026', 'utf8');
    const encrypted = encryptWithWindowsDPAPI(rawSecret);

    expect(encrypted).not.toEqual(rawSecret);
    expect(encrypted.length).toBeGreaterThan(rawSecret.length);

    // Verify plaintext is NOT visible in raw encrypted buffer
    expect(encrypted.includes(rawSecret)).toBe(false);

    const decrypted = decryptWithWindowsDPAPI(encrypted);
    expect(decrypted.toString('utf8')).toBe('DatabaseMasterEncryptionSecret_2026');
  });

  it('generates a new master key on first access and stores it encrypted in vault', () => {
    const manager = new KeyManager(tempDir);
    const key = manager.getOrCreateDatabaseKey();

    expect(key).toBeDefined();
    expect(key.length).toBe(64); // 32 bytes hex = 64 chars

    // Check disk file
    const vaultPath = path.join(tempDir, 'vault.enc');
    expect(fs.existsSync(vaultPath)).toBe(true);

    const fileBytes = fs.readFileSync(vaultPath);
    // Plaintext key must NOT be readable on disk
    expect(fileBytes.includes(Buffer.from(key, 'utf8'))).toBe(false);

    // Re-opening manager must return the exact same key
    const manager2 = new KeyManager(tempDir);
    const key2 = manager2.getOrCreateDatabaseKey();
    expect(key2).toBe(key);
  });

  it('formats emergency recovery key phrase and restores correctly', () => {
    const manager = new KeyManager(tempDir);
    const originalKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    manager.saveKey(originalKey);

    const recoveryCode = manager.getEmergencyRecoveryCode(originalKey);
    expect(recoveryCode).toContain('-');

    // Simulate recovery in a fresh directory
    const recoveryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-recovery-test-'));
    const recoveryManager = new KeyManager(recoveryDir);
    const restoredKey = recoveryManager.restoreFromEmergencyCode(recoveryCode);

    expect(restoredKey).toBe(originalKey);
    expect(recoveryManager.getOrCreateDatabaseKey()).toBe(originalKey);

    fs.rmSync(recoveryDir, { recursive: true, force: true });
  }, 15000);
});

