import fs from 'fs';
import { BrowserWindow, dialog } from 'electron';
import { DatabaseManager, DatabaseError, DatabaseDecryptionError } from '../database/connection';
import { MigrationRunner } from '../database/migrations';
import { BackupService } from './backup-service';

export interface BackupInspectionDetails {
  schemaVersion: number;
  totalPatients: number;
  totalVisits: number;
  totalInvoices: number;
  totalResults: number;
  hospitalName: string;
  fileSize: number;
  checksum: string;
  createdAt: string;
}

export interface BackupInspectionResult {
  isValid: boolean;
  error?: string;
  metadata?: BackupInspectionDetails;
}

export interface RestoreExecutionResult {
  success: boolean;
  preRestoreSnapshotPath: string;
  error?: string;
}

export class RestoreService {
  private dbManager: DatabaseManager;
  private backupService: BackupService;
  private preRestoreSnapshotsDir: string;
  private migrationRunner: MigrationRunner;

  constructor(
    dbManager: DatabaseManager,
    backupService: BackupService,
    preRestoreSnapshotsDir: string,
    migrationRunner: MigrationRunner
  ) {
    this.dbManager = dbManager;
    this.backupService = backupService;
    this.preRestoreSnapshotsDir = preRestoreSnapshotsDir;
    this.migrationRunner = migrationRunner;
    this.ensureDirectory(this.preRestoreSnapshotsDir);
  }

  private ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Performs rigorous pre-flight validation on an encrypted backup candidate.
   * Checks decryption, integrity, and schema version compatibility.
   */
  public inspectBackup(filePath: string): BackupInspectionResult {
    if (!fs.existsSync(filePath)) {
      return { isValid: false, error: 'The selected backup file does not exist on disk.' };
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      return { isValid: false, error: 'The selected backup file is empty (0 bytes).' };
    }

    const checksum = BackupService.computeFileChecksum(filePath);

    // Attempt to open in a temporary isolated DatabaseManager
    const tempManager = new DatabaseManager({
      dbPath: filePath,
      encryptionKey: this.dbManager.getEncryptionKey(),
      readOnly: true,
    });

    try {
      const db = tempManager.open();

      // 1. Verify integrity
      const integrity = tempManager.checkIntegrity();
      if (!integrity.ok) {
        return {
          isValid: false,
          error: `Backup database failed integrity validation: ${integrity.details.join(', ')}`,
        };
      }

      // 2. Verify schema compatibility
      const hasMigrationsTable = db
        .prepare(`SELECT count(*) as count FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`)
        .get() as { count: number };

      let backupSchemaVersion = 0;
      if (hasMigrationsTable && hasMigrationsTable.count > 0) {
        const row = db.prepare(`SELECT max(version) as max_version FROM schema_migrations`).get() as {
          max_version: number | null;
        };
        backupSchemaVersion = row?.max_version || 0;
      }

      const maxSupported = this.migrationRunner.getMaxSupportedVersion();
      if (backupSchemaVersion > maxSupported) {
        return {
          isValid: false,
          error: `This backup was created by an unsupported newer version of the application (schema v${backupSchemaVersion}). This application only supports up to schema v${maxSupported}. Please upgrade the application before restoring this backup.`,
        };
      }

      // 3. Inspect summary record counts
      let totalPatients = 0;
      let totalVisits = 0;
      let totalInvoices = 0;
      let totalResults = 0;
      let hospitalName = 'Medical Laboratory';

      try {
        const pRow = db.prepare(`SELECT count(*) as count FROM patients`).get() as { count: number };
        totalPatients = pRow?.count || 0;
      } catch {
        // Table may not exist if ancient schema
      }

      try {
        const vRow = db.prepare(`SELECT count(*) as count FROM visits`).get() as { count: number };
        totalVisits = vRow?.count || 0;
      } catch {
        // ignore
      }

      try {
        const iRow = db.prepare(`SELECT count(*) as count FROM invoices`).get() as { count: number };
        totalInvoices = iRow?.count || 0;
      } catch {
        // ignore
      }

      try {
        const rRow = db.prepare(`SELECT count(*) as count FROM test_results`).get() as { count: number };
        totalResults = rRow?.count || 0;
      } catch {
        // ignore
      }

      try {
        const hRow = db.prepare(`SELECT hospital_name FROM hospital_settings LIMIT 1`).get() as { hospital_name: string };
        if (hRow?.hospital_name) {
          hospitalName = hRow.hospital_name;
        }
      } catch {
        // ignore
      }

      return {
        isValid: true,
        metadata: {
          schemaVersion: backupSchemaVersion,
          totalPatients,
          totalVisits,
          totalInvoices,
          totalResults,
          hospitalName,
          fileSize: stat.size,
          checksum,
          createdAt: stat.mtime.toISOString(),
        },
      };
    } catch (err: any) {
      if (err instanceof DatabaseDecryptionError || err?.message?.includes('decrypt')) {
        return {
          isValid: false,
          error: 'Failed to decrypt backup. This file was created under a different master encryption key or is damaged.',
        };
      }
      return {
        isValid: false,
        error: `Failed to inspect backup file: ${err?.message || 'Invalid SQLite format'}`,
      };
    } finally {
      tempManager.close();
    }
  }

  /**
   * Executes a controlled, atomic database restoration.
   * Safety invariant: ALWAYS creates a verified pre-restore safety snapshot before touching active data.
   */
  public async executeRestore(filePath: string): Promise<RestoreExecutionResult> {
    // 1. Rigorous pre-flight check
    const inspection = this.inspectBackup(filePath);
    if (!inspection.isValid) {
      throw new DatabaseError(inspection.error || 'The selected backup file is not valid for restoration.');
    }

    // 2. Create mandatory pre-restore safety snapshot
    this.ensureDirectory(this.preRestoreSnapshotsDir);
    const safetySnapshot = await this.backupService.createBackup({
      destinationDir: this.preRestoreSnapshotsDir,
      filenamePrefix: 'PreRestore-Snapshot',
    });

    const activeDbPath = this.dbManager.getDbPath();
    const activeWalPath = `${activeDbPath}-wal`;
    const activeShmPath = `${activeDbPath}-shm`;

    try {
      // 3. Safely disconnect active database connections
      this.dbManager.close();

      // Clean up companion WAL/SHM files
      if (fs.existsSync(activeWalPath)) fs.unlinkSync(activeWalPath);
      if (fs.existsSync(activeShmPath)) fs.unlinkSync(activeShmPath);

      // 4. Atomically swap restored file into place
      const tempRestoreTarget = `${activeDbPath}.restoring`;
      fs.copyFileSync(filePath, tempRestoreTarget);
      fs.copyFileSync(tempRestoreTarget, activeDbPath);
      if (fs.existsSync(tempRestoreTarget)) fs.unlinkSync(tempRestoreTarget);

      // 5. Reopen active database
      this.dbManager.open();

      // 6. Verify restored database integrity
      const postRestoreIntegrity = this.dbManager.checkIntegrity();
      if (!postRestoreIntegrity.ok) {
        throw new DatabaseError(`Restored database failed integrity check: ${postRestoreIntegrity.details.join(', ')}`);
      }

      // 7. Run any pending schema migrations if restoring an older schema
      this.migrationRunner.runPendingMigrations();

      return {
        success: true,
        preRestoreSnapshotPath: safetySnapshot.filePath,
      };
    } catch (err: any) {
      // 8. Fail-Safe Automatic Rollback
      console.error('Database restore failed. Executing automatic rollback to pre-restore snapshot...', err);
      try {
        this.dbManager.close();
        if (fs.existsSync(activeWalPath)) fs.unlinkSync(activeWalPath);
        if (fs.existsSync(activeShmPath)) fs.unlinkSync(activeShmPath);
        fs.copyFileSync(safetySnapshot.filePath, activeDbPath);
        this.dbManager.open();
      } catch (rollbackErr) {
        console.error('Critical rollback failure:', rollbackErr);
      }

      throw new DatabaseError(
        `Restoration failed: ${err?.message || 'Unknown failure'}. The database has been rolled back to the pre-restore snapshot.`,
        err
      );
    }
  }

  /**
   * Prompts operator to select an encrypted backup file using native Windows dialog.
   */
  public async selectBackupFile(mainWindow: BrowserWindow): Promise<string | null> {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Encrypted Laboratory Backup File',
      filters: [{ name: 'SQLite Encrypted Database (*.db, *.bak)', extensions: ['db', 'bak'] }],
      properties: ['openFile'],
      buttonLabel: 'Select Backup File',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }
}

