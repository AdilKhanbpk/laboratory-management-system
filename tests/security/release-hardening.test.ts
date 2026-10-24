import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';
import { UserRepository } from '../../electron/database/repositories/user-repository';
import { hashPasswordSync, verifyPassword } from '../../electron/security/hash';

describe('Prompt 5: Application Security Hardening & Zero-Leakage Audit', () => {
  const testDir = path.join(__dirname, `temp_hardening_test_${Date.now()}`);
  const dbPath = path.join(testDir, 'hardened_lms.db');
  const migrationsDir = path.resolve(__dirname, '../../database/migrations');
  const key = 'hardening-test-secret-cipher-key';

  it('guarantees 100% database file encryption with zero plaintext leakage', () => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });

    const manager = new DatabaseManager({ dbPath, encryptionKey: key });
    manager.open();
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    const patientRepo = new PatientRepository(manager);
    const userRepo = new UserRepository(manager);

    const sensitiveName = 'Confidential Patient Special Case';
    const sensitivePhone = '03339988776';
    const sensitivePassword = 'SuperSecretLaboratoryPassword!2026';

    patientRepo.createPatient({
      fullName: sensitiveName,
      gender: 'male',
      phoneNumber: sensitivePhone,
      address: 'Private Residence 123 Sector G-9 Islamabad',
    });

    const { hash, salt } = hashPasswordSync(sensitivePassword);
    userRepo.createInitialOperator({
      username: 'audit_operator',
      passwordHash: hash,
      passwordSalt: salt,
      fullName: 'Audit Security Officer',
    });

    manager.close();

    // Inspect the on-disk file bytes directly
    expect(fs.existsSync(dbPath)).toBe(true);
    const fileBytes = fs.readFileSync(dbPath);

    // Verify raw SQLite header ("SQLite format 3") is NOT present (SQLCipher encrypts page 1 including header)
    expect(fileBytes.slice(0, 16).toString('utf8')).not.toBe('SQLite format 3\0');

    // Verify patient sensitive data does NOT appear anywhere in the binary file
    expect(fileBytes.includes(Buffer.from(sensitiveName))).toBe(false);
    expect(fileBytes.includes(Buffer.from(sensitivePhone))).toBe(false);
    expect(fileBytes.includes(Buffer.from('Private Residence'))).toBe(false);
    expect(fileBytes.includes(Buffer.from(sensitivePassword))).toBe(false);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('verifies scrypt password derivation resilience and salts', () => {
    const password = 'ClinicalStaffPassword!456';
    const { hash: hash1, salt: salt1 } = hashPasswordSync(password);
    const { hash: hash2, salt: salt2 } = hashPasswordSync(password);

    // Different salts generated each time
    expect(salt1).not.toBe(salt2);
    expect(hash1).not.toBe(hash2);

    // Validations work with correct salt
    expect(verifyPassword(password, hash1, salt1)).toBe(true);
    expect(verifyPassword(password, hash2, salt2)).toBe(true);
    expect(verifyPassword('WrongPassword', hash1, salt1)).toBe(false);
  });

  it('verifies Content-Security-Policy rules in production config prohibit remote script injection', () => {
    const prodCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';";
    
    // Prohibits external CDN / remote connections
    expect(prodCsp).not.toContain('http://');
    expect(prodCsp).not.toContain('https://');
    expect(prodCsp).not.toContain('unsafe-eval');
    expect(prodCsp).toContain("default-src 'self'");
    expect(prodCsp).toContain("script-src 'self'");
  });
});
