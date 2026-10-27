import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { BackupService } from '../../electron/services/backup-service';
import { RestoreService } from '../../electron/services/restore-service';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';

describe('Prompt 5: Database Backup & Destructive Restore Lifecycle', () => {
  const testDir = path.join(__dirname, `temp_backup_test_${Date.now()}`);
  const activeDbPath = path.join(testDir, 'active_lms.db');
  const backupsDir = path.join(testDir, 'backups');
  const preRestoreDir = path.join(testDir, 'pre-restore-snapshots');
  const migrationsDir = path.resolve(__dirname, '../../database/migrations');
  const encryptionKey = 'prompt5-secret-key-test-12345';

  let dbManager: DatabaseManager;
  let migrationRunner: MigrationRunner;
  let backupService: BackupService;
  let restoreService: RestoreService;
  let patientRepo: PatientRepository;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.mkdirSync(preRestoreDir, { recursive: true });

    dbManager = new DatabaseManager({
      dbPath: activeDbPath,
      encryptionKey,
    });
    dbManager.open();

    migrationRunner = new MigrationRunner(dbManager, migrationsDir);
    migrationRunner.runPendingMigrations();

    backupService = new BackupService(dbManager, backupsDir);
    restoreService = new RestoreService(dbManager, backupService, preRestoreDir, migrationRunner);
    patientRepo = new PatientRepository(dbManager);
  });

  afterEach(() => {
    if (dbManager) {
      dbManager.close();
    }
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('creates a consistent online encrypted backup with SHA-256 verification', async () => {
    // 1. Create initial patient record
    patientRepo.createPatient({
      fullName: 'Muhammad Ahmad',
      gender: 'male',
      phoneNumber: '03001234567',
    });

    // 2. Perform online backup
    const backup = await backupService.createBackup();

    expect(backup.success).toBe(true);
    expect(fs.existsSync(backup.filePath)).toBe(true);
    expect(backup.fileName).toMatch(/^lms_backup_[A-Za-z]{3}-\d{2}-\d{4}&Time-\d{1,2}-\d{2}-\d{2}-(am|pm)\.db$/);
    expect(backup.fileSize).toBeGreaterThan(0);
    expect(backup.checksum).toHaveLength(64); // SHA-256 hex string

    // 3. Inspect backup file directly: verify raw bytes DO NOT contain plaintext patient name
    const rawBytes = fs.readFileSync(backup.filePath);
    expect(rawBytes.includes(Buffer.from('Muhammad Ahmad'))).toBe(false);

    // 4. Verify listed in local archives
    const list = backupService.listLocalBackups();
    expect(list.length).toBe(1);
    expect(list[0].fileName).toBe(backup.fileName);
  });

  it('inspects a valid backup file and extracts correct metadata without modifying the active database', async () => {
    patientRepo.createPatient({
      fullName: 'Ayesha Khan',
      gender: 'female',
    });

    const backup = await backupService.createBackup();
    const inspection = restoreService.inspectBackup(backup.filePath);

    expect(inspection.isValid).toBe(true);
    expect(inspection.metadata).toBeDefined();
    expect(inspection.metadata?.totalPatients).toBe(1);
    expect(inspection.metadata?.schemaVersion).toBe(11);
    expect(inspection.metadata?.checksum).toBe(backup.checksum);
  });

  it('rejects corrupted or improperly encrypted backup files', () => {
    const corruptPath = path.join(testDir, 'corrupted_backup.db');
    fs.writeFileSync(corruptPath, 'THIS IS NOT AN ENCRYPTED SQLITE DATABASE FILE GARBAGE');

    const inspection = restoreService.inspectBackup(corruptPath);
    expect(inspection.isValid).toBe(false);
    expect(inspection.error).toMatch(/Failed to decrypt backup|integrity validation|Invalid SQLite format/);
  });

  it('rejects a backup created by an unsupported future schema version', () => {
    const fakeFutureDbPath = path.join(testDir, 'future_schema.db');
    const futureManager = new DatabaseManager({
      dbPath: fakeFutureDbPath,
      encryptionKey,
    });
    const db = futureManager.open();
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT, checksum TEXT);
      INSERT INTO schema_migrations VALUES (999, 'future_quantum_schema', '2030-01-01', 'abcdef');
    `);
    futureManager.close();

    const inspection = restoreService.inspectBackup(fakeFutureDbPath);
    expect(inspection.isValid).toBe(false);
    expect(inspection.error).toContain('unsupported newer version');
    expect(inspection.error).toContain('schema v999');
  });

  it('executes a safe restore, creates an automated pre-restore safety snapshot, and restores exact records', async () => {
    // State 1: Register Patient Alpha and create backup
    const p1 = patientRepo.createPatient({
      fullName: 'Alpha Patient',
      gender: 'male',
    });
    expect(p1.id).toBeGreaterThan(0);

    const backupState1 = await backupService.createBackup();

    // State 2: Register Patient Beta (created AFTER backup)
    const p2 = patientRepo.createPatient({
      fullName: 'Beta Patient',
      gender: 'female',
    });
    expect(p2.id).toBeGreaterThan(0);

    const activeListBeforeRestore = patientRepo.searchPatients({ limit: 10 });
    expect(activeListBeforeRestore.total).toBe(2);

    // State 3: Execute Restore from State 1 backup
    const restoreResult = await restoreService.executeRestore(backupState1.filePath);

    expect(restoreResult.success).toBe(true);
    expect(fs.existsSync(restoreResult.preRestoreSnapshotPath)).toBe(true);
    expect(restoreResult.preRestoreSnapshotPath).toContain('PreRestore-Snapshot');

    // Verify Active Database state after restore: ONLY Patient Alpha should exist!
    const activeListAfterRestore = patientRepo.searchPatients({ limit: 10 });
    expect(activeListAfterRestore.total).toBe(1);
    expect(activeListAfterRestore.patients[0].full_name).toBe('Alpha Patient');

    // Verify that the Pre-Restore Safety Snapshot actually preserved State 2 (both Alpha and Beta)
    const snapshotInspection = restoreService.inspectBackup(restoreResult.preRestoreSnapshotPath);
    expect(snapshotInspection.isValid).toBe(true);
    expect(snapshotInspection.metadata?.totalPatients).toBe(2);
  });
});

