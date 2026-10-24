import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  InitialSetupSchema,
  UpdateHospitalSettingsSchema,
} from '../../electron/types/ipc';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { AuditRepository } from '../../electron/database/repositories/audit-repository';

describe('Security: IPC Payload Validation & Audit Trail Sanitization', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let auditRepo: AuditRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-audit-test-'));
    dbPath = path.join(tempDir, 'audit_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'AuditSecKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    auditRepo = new AuditRepository(manager);
  });

  afterEach(() => {
    if (manager) manager.close();
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it('validates setup input and rejects invalid passwords and malformed usernames', () => {
    // 1. Weak password (<8 chars)
    const weakPass = InitialSetupSchema.safeParse({
      hospitalName: 'Lab Name',
      address: 'Address 123',
      phonePrimary: '12345678',
      adminUsername: 'valid_user',
      adminFullName: 'Full Name',
      adminPassword: 'short',
    });
    expect(weakPass.success).toBe(false);

    // 2. Malformed username (spaces/symbols)
    const badUser = InitialSetupSchema.safeParse({
      hospitalName: 'Lab Name',
      address: 'Address 123',
      phonePrimary: '12345678',
      adminUsername: 'invalid user!@#',
      adminFullName: 'Full Name',
      adminPassword: 'ValidPassword123!',
    });
    expect(badUser.success).toBe(false);

    // 3. Valid setup input passes
    const valid = InitialSetupSchema.safeParse({
      hospitalName: 'Lab Name',
      address: 'Address 123',
      phonePrimary: '12345678',
      adminUsername: 'valid_user_99',
      adminFullName: 'Full Name',
      adminPassword: 'ValidPassword123!',
    });
    expect(valid.success).toBe(true);
  });

  it('validates settings update and rejects out-of-range inactivity timeout', () => {
    // Timeout must be between 1 and 120 minutes
    const negativeTimeout = UpdateHospitalSettingsSchema.safeParse({
      inactivity_timeout_minutes: 0,
    });
    expect(negativeTimeout.success).toBe(false);

    const excessiveTimeout = UpdateHospitalSettingsSchema.safeParse({
      inactivity_timeout_minutes: 999,
    });
    expect(excessiveTimeout.success).toBe(false);

    const validTimeout = UpdateHospitalSettingsSchema.safeParse({
      inactivity_timeout_minutes: 30,
    });
    expect(validTimeout.success).toBe(true);
  });

  it('sanitizes audit details and redacts passwords, salts, and keys', () => {
    auditRepo.logAction({
      action: 'SECURITY_TEST_EVENT',
      entityType: 'TEST',
      details: {
        operatorName: 'Dr. Tariq',
        password: 'PlainTextSecretPassword!',
        passwordHash: '8f43434abcdef...',
        encryptionKey: 'MasterKeyPassphrase123',
        normalField: 'PreservedValue',
      },
    });

    const logs = auditRepo.getRecentLogs(1);
    expect(logs.length).toBe(1);

    const parsedDetails = JSON.parse(logs[0].details_json);
    expect(parsedDetails.operatorName).toBe('Dr. Tariq');
    expect(parsedDetails.normalField).toBe('PreservedValue');

    // Secrets MUST be redacted
    expect(parsedDetails.password).toBe('[REDACTED]');
    expect(parsedDetails.passwordHash).toBe('[REDACTED]');
    expect(parsedDetails.encryptionKey).toBe('[REDACTED]');
  });
});

