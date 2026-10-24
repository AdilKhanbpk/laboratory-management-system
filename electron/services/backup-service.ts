import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BrowserWindow, dialog } from 'electron';
import { DatabaseManager, DatabaseError } from '../database/connection';

export interface BackupResult {
  success: boolean;
  filePath: string;
  fileName: string;
  fileSize: number;
  timestamp: string;
  checksum: string;
}

export interface BackupMetadata {
  fileName: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  isPreRestoreSnapshot: boolean;
}

export class BackupService {
  private dbManager: DatabaseManager;
  private defaultBackupDir: string;

  constructor(dbManager: DatabaseManager, defaultBackupDir: string) {
    this.dbManager = dbManager;
    this.defaultBackupDir = defaultBackupDir;
    this.ensureDirectory(this.defaultBackupDir);
  }

  private ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Generates a collision-proof timestamped filename adhering to operator requirements.
   * Format: lms_backup_MMM-DD-YYYY&Time-H-MM-ampm.db (e.g. lms_backup_Oct-24-2026&Time-3-00-pm.db)
   */
  public generateBackupFilename(prefix = 'lms_backup'): string {
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[now.getMonth()];
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();

    const rawHour = now.getHours();
    const hour12 = rawHour % 12 || 12;
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = rawHour >= 12 ? 'pm' : 'am';

    return `${prefix}_${month}-${day}-${year}&Time-${hour12}-${minutes}-${ampm}.db`;
  }

  /**
   * Verifies that a target directory is accessible and writable.
   */
  private verifyWritableDirectory(targetDir: string): void {
    this.ensureDirectory(targetDir);

    const probeFile = path.join(targetDir, `.write_probe_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.tmp`);
    try {
      fs.writeFileSync(probeFile, 'probe');
      fs.unlinkSync(probeFile);
    } catch (err: any) {
      throw new DatabaseError(
        `Destination directory is not writable or drive is disconnected: ${err?.message || targetDir}`,
        err
      );
    }
  }

  /**
   * Computes the SHA-256 checksum of a file.
   */
  public static computeFileChecksum(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Creates a consistent, encrypted online SQLite backup.
   * Leverages atomic staging: writes to a temp file, verifies integrity, then renames.
   * If deletePrevious is true, removes older backup files in target directory after successful verification.
   */
  public async createBackup(options: {
    destinationDir?: string;
    filenamePrefix?: string;
    deletePrevious?: boolean;
  } = {}): Promise<BackupResult> {
    const targetDir = options.destinationDir || this.defaultBackupDir;
    this.verifyWritableDirectory(targetDir);

    const prefix = options.filenamePrefix || 'lms_backup';
    const finalFilename = this.generateBackupFilename(prefix);
    const finalPath = path.join(targetDir, finalFilename);

    // Staging file
    const stagingFilename = `.tmp_staging_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.db`;
    const stagingPath = path.join(targetDir, stagingFilename);

    try {
      // 1. Execute online database snapshot
      this.dbManager.backupOnline(stagingPath);

      // 2. Validate staged file presence and size
      if (!fs.existsSync(stagingPath)) {
        throw new DatabaseError('Backup staging file was not created by the database engine.');
      }

      const stat = fs.statSync(stagingPath);
      if (stat.size === 0) {
        throw new DatabaseError('Generated backup file is empty (0 bytes).');
      }

      // 3. Pre-flight verification: open staged database and check integrity
      const tempManager = new DatabaseManager({
        dbPath: stagingPath,
        encryptionKey: this.dbManager.getEncryptionKey(),
      });

      try {
        tempManager.open();
        const integrity = tempManager.checkIntegrity();
        if (!integrity.ok) {
          throw new DatabaseError(`Staged backup failed database integrity check: ${integrity.details.join(', ')}`);
        }
      } finally {
        tempManager.close();
      }

      // 4. Calculate SHA-256 digital checksum
      const checksum = BackupService.computeFileChecksum(stagingPath);

      // 5. Atomically rename staging file to final destination
      fs.renameSync(stagingPath, finalPath);

      const finalStat = fs.statSync(finalPath);

      // 6. Purge previous backups in the target folder if requested
      if (options.deletePrevious) {
        try {
          const files = fs.readdirSync(targetDir);
          for (const file of files) {
            // Match previous .db or .bak files but NEVER the freshly verified file or hidden temp files
            if (
              (file.endsWith('.db') || file.endsWith('.bak')) &&
              !file.startsWith('.') &&
              file !== finalFilename
            ) {
              try {
                fs.unlinkSync(path.join(targetDir, file));
              } catch {
                // ignore deletion error on individual legacy file
              }
            }
          }
        } catch {
          // non-fatal: backup was still successfully created
        }
      }

      return {
        success: true,
        filePath: finalPath,
        fileName: finalFilename,
        fileSize: finalStat.size,
        timestamp: new Date().toISOString(),
        checksum,
      };
    } catch (err: any) {
      // Clean up temporary staging file if error occurred
      if (fs.existsSync(stagingPath)) {
        try {
          fs.unlinkSync(stagingPath);
        } catch {
          // ignore cleanup error
        }
      }
      throw new DatabaseError(`Backup creation failed: ${err?.message || 'Unknown error'}`, err);
    }
  }

  /**
   * Lists existing local backups from target directory or default storage.
   */
  public listLocalBackups(directoryPath?: string | null): BackupMetadata[] {
    const targetDir = directoryPath && fs.existsSync(directoryPath) ? directoryPath : this.defaultBackupDir;
    this.ensureDirectory(targetDir);

    const files = fs.readdirSync(targetDir)
      .filter((file) => (file.endsWith('.db') || file.endsWith('.bak')) && !file.startsWith('.'))
      .sort((a, b) => {
        try {
          const statA = fs.statSync(path.join(targetDir, a));
          const statB = fs.statSync(path.join(targetDir, b));
          return statB.mtimeMs - statA.mtimeMs;
        } catch {
          return b.localeCompare(a);
        }
      });

    return files.map((fileName) => {
      const filePath = path.join(targetDir, fileName);
      const stat = fs.statSync(filePath);
      return {
        fileName,
        filePath,
        fileSize: stat.size,
        createdAt: stat.mtime.toISOString(),
        isPreRestoreSnapshot: fileName.startsWith('PreRestore-Snapshot'),
      };
    });
  }

  /**
   * Prompts the operator via native Windows dialog to pick a backup destination directory.
   */
  public async selectBackupDestination(mainWindow: BrowserWindow): Promise<string | null> {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Backup Destination Folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Select Backup Folder',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }
}

