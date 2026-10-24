import { describe, it, expect } from 'vitest';
import { hashPassword, hashPasswordSync, verifyPassword } from '../../electron/security/hash';

describe('Security: Password Hashing & Verification (scrypt)', () => {
  it('hashes password with random salt asynchronously', async () => {
    const pwd = 'MedicalOperatorSecret2026!';
    const res = await hashPassword(pwd);

    expect(res.hash).toBeDefined();
    expect(res.hash.length).toBe(128); // 64 bytes = 128 hex chars
    expect(res.salt).toBeDefined();
    expect(res.salt.length).toBe(64);  // 32 bytes = 64 hex chars
  });

  it('hashes password synchronously and produces unique salts each time', () => {
    const pwd = 'SamePassword123';
    const res1 = hashPasswordSync(pwd);
    const res2 = hashPasswordSync(pwd);

    expect(res1.salt).not.toBe(res2.salt);
    expect(res1.hash).not.toBe(res2.hash);
  });

  it('verifies correct password against hash and salt', () => {
    const pwd = 'CorrectPassword999';
    const { hash, salt } = hashPasswordSync(pwd);

    const isValid = verifyPassword(pwd, hash, salt);
    expect(isValid).toBe(true);
  });

  it('rejects incorrect password using constant-time verification', () => {
    const pwd = 'CorrectPassword999';
    const { hash, salt } = hashPasswordSync(pwd);

    const isWrong = verifyPassword('WrongPassword123', hash, salt);
    expect(isWrong).toBe(false);
  });

  it('fails safely when salt or hash are malformed', () => {
    expect(verifyPassword('test', 'invalid-hex', 'invalid-salt')).toBe(false);
    expect(verifyPassword('test', '', '')).toBe(false);
  });
});

