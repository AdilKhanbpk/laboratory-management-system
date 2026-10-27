import { ipcMain, app, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from './channels';
import { z } from 'zod';
import {
  detectLegacyTestCatalog,
  importLegacyTestsToActiveDatabase,
  clearAllCatalogTests,
  wipeAllDatabaseData,
  LegacyTestDetectionResult,
  LegacyTestImportStats,
} from '../database/legacy-test-importer';
import {
  detectSavedTemplate,
  applySavedTemplateSeed,
} from '../database/template-seeder';
import {
  SavedTemplateDetectionResult,
  SavedTemplateSeedResult,
} from '../types/ipc';
import {
  InitialSetupSchema,
  LoginSchema,
  UnlockSchema,
  RestoreKeySchema,
  RestoreFromBackupSchema,
  UpdateHospitalSettingsSchema,
  CreateUserSchema,
  UpdateUserSchema,
  UpdateUserPasswordSchema,
  CreatePatientSchema,
  UpdatePatientSchema,
  CreateDoctorSchema,
  UpdateDoctorSchema,
  CreateTestSchema,
  UpdateTestSchema,
  CreateVisitOrderSchema,
  UpdateVisitOrderAndInvoiceSchema,
  RecordPaymentSchema,
  DoctorStatsQuerySchema,
  SaveDraftResultsSchema,
  FinalizeReportSchema,
  AmendResultSchema,
  ExportPdfSchema,
  CreateBackupSchema,
  PurgeOlderBackupsSchema,
  InspectBackupSchema,
  ExecuteRestoreSchema,
  CreateAssetSchema,
  UpdateAssetSchema,
  VerifyResetKeySchema,
  ResetPasswordWithKeySchema,
  DevResetPasswordSchema,
  RecordPayoutSchema,
  RecordLabCollectionSchema,
  RecordPartnershipExpenseSchema,
  RecordPartnerPaymentSchema,
  ReversePartnershipTransactionSchema,
  ClosePartnershipMonthSchema,
  RecordDoctorCommissionPaymentSchema,
  RecordInvestorCapitalSchema,
  UpdatePartnershipSplitSchema,
  PartnershipDashboardData,
  IpcResponse,
  SessionInfo,
  AppInfo,
  VisitDetail,
  VisitSearchResult,
  Payment,
  Invoice,
  DoctorReferralStats,
  LabAsset,
  AssetFilterQuery,
  OwnerPayout,
  MyPercentageSummary,
  TestResult,
  ReportSnapshot,
  WorklistOrderItem,
  FullDiagnosticReport,
  PatientHistoryItem,
  BackupResult,
  BackupMetadata,
  BackupInspectionResult,
  RestoreExecutionResult,
} from '../types/ipc';
import { DatabaseManager } from '../database/connection';
import { UserRepository, SafeUser } from '../database/repositories/user-repository';
import { HospitalRepository, HospitalSettings } from '../database/repositories/hospital-repository';
import { AuditRepository } from '../database/repositories/audit-repository';
import { PatientRepository } from '../database/repositories/patient-repository';
import { DoctorRepository } from '../database/repositories/doctor-repository';
import { CatalogRepository } from '../database/repositories/catalog-repository';
import { VisitRepository } from '../database/repositories/visit-repository';
import { DoctorStatsRepository } from '../database/repositories/doctor-stats-repository';
import { ResultRepository } from '../database/repositories/result-repository';
import { PatientHistoryRepository } from '../database/repositories/patient-history-repository';
import { TemplateRepository } from '../database/repositories/template-repository';
import { AssetRepository } from '../database/repositories/asset-repository';
import { FinanceRepository } from '../database/repositories/finance-repository';
import { PdfService } from '../services/pdf-service';
import { BackupService } from '../services/backup-service';
import { RestoreService } from '../services/restore-service';
import { MigrationRunner } from '../database/migrations';
import { LogoService } from '../security/logo-service';
import { KeyManager } from '../security/dpapi-key';
import { wipeDatabaseAndSeedStandardCatalog } from '../database/standard-catalog-seeder';
import { hashPasswordSync, verifyPassword } from '../security/hash';
import {
  generateDynamicHourlyKey,
  validateDynamicHourlyKey,
  getMinutesRemainingInCurrentHour,
} from '../security/dynamic-key';

export interface HandlerContext {
  dbManager: DatabaseManager;
  keyManager: KeyManager;
  userRepo: UserRepository;
  hospitalRepo: HospitalRepository;
  auditRepo: AuditRepository;
  patientRepo: PatientRepository;
  doctorRepo: DoctorRepository;
  catalogRepo: CatalogRepository;
  visitRepo: VisitRepository;
  doctorStatsRepo: DoctorStatsRepository;
  resultRepo: ResultRepository;
  patientHistoryRepo: PatientHistoryRepository;
  migrationRunner: MigrationRunner;
  templateRepo: TemplateRepository;
  assetRepo: AssetRepository;
  financeRepo: FinanceRepository;
  logoService: LogoService;
  backupService: BackupService;
  restoreService: RestoreService;
  isPackaged: boolean;
  getMainWindow?: () => BrowserWindow | null;
}

function attachLogoUrl(hospital: HospitalSettings | null, logoService: LogoService): HospitalSettings | null {
  if (!hospital) return null;
  return {
    ...hospital,
    logo_url: logoService.getLogoDataUrl(hospital.logo_relative_path),
  };
}

export function registerIpcHandlers(ctx: HandlerContext): void {
  let currentSession: SessionInfo | null = null;

  // 1. Check if Initial Setup has been completed
  ipcMain.handle(IPC_CHANNELS.AUTH_CHECK_SETUP, async (): Promise<IpcResponse<{ isConfigured: boolean }>> => {
    try {
      const userCount = ctx.userRepo.countUsers();
      const hospital = ctx.hospitalRepo.getSettings();
      const isConfigured = userCount > 0 && hospital !== null;
      return { success: true, data: { isConfigured } };
    } catch {
      return { success: false, error: 'Failed to verify system setup status.' };
    }
  });

  // 2. Initial Setup (Operator Account + Hospital Profile)
  ipcMain.handle(IPC_CHANNELS.AUTH_SETUP, async (_, rawInput: unknown): Promise<IpcResponse<{ user: SafeUser; hospital: any }>> => {
    try {
      const parsed = InitialSetupSchema.safeParse(rawInput);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues?.[0]?.message || 'Invalid setup parameters.';
        return { success: false, error: errorMsg };
      }

      const input = parsed.data;

      const userCount = ctx.userRepo.countUsers();
      if (userCount > 0) {
        return { success: false, error: 'System has already been initialized.' };
      }

      const { hash, salt } = hashPasswordSync(input.adminPassword);

      let createdUser: SafeUser;
      let hospitalSettings: any;

      ctx.dbManager.runTransaction(() => {
        createdUser = ctx.userRepo.createInitialOperator({
          username: input.adminUsername,
          passwordHash: hash,
          passwordSalt: salt,
          fullName: input.adminFullName,
        });

        hospitalSettings = ctx.hospitalRepo.initializeSettings({
          hospital_name: input.hospitalName,
          tagline: input.tagline,
          address: input.address,
          phone_primary: input.phonePrimary,
          phone_secondary: input.phoneSecondary,
          email: input.email,
          currency_code: input.currencyCode,
          timezone: input.timezone,
          inactivity_timeout_minutes: input.inactivityTimeoutMinutes,
        });

        ctx.auditRepo.logAction({
          userId: createdUser.id,
          action: 'SYSTEM_INITIALIZED',
          entityType: 'SYSTEM',
          entityId: '1',
          details: {
            adminUsername: createdUser.username,
            hospitalName: hospitalSettings.hospital_name,
            timestamp: new Date().toISOString(),
          },
        });
      });

      const hospitalWithLogo = attachLogoUrl(hospitalSettings, ctx.logoService);
      currentSession = {
        user: createdUser!,
        hospital: hospitalWithLogo!,
        sessionStartedAt: new Date().toISOString(),
      };

      return {
        success: true,
        data: {
          user: createdUser!,
          hospital: hospitalWithLogo!,
        },
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to complete initial setup.' };
    }
  });

  // 3. Login
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_, rawInput: unknown): Promise<IpcResponse<SessionInfo>> => {
    try {
      const parsed = LoginSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: 'Please enter valid credentials.' };
      }

      const { username, password } = parsed.data;
      const user = ctx.userRepo.findByUsername(username);

      if (!user) {
        verifyPassword(password, '0'.repeat(128), '0'.repeat(64));
        ctx.auditRepo.logAction({
          action: 'LOGIN_FAILED',
          entityType: 'AUTH',
          details: { attemptedUsername: username, reason: 'INVALID_CREDENTIALS' },
        });
        return { success: false, error: 'Invalid username or password.' };
      }

      if (!user.is_active) {
        ctx.auditRepo.logAction({
          userId: user.id,
          action: 'LOGIN_REJECTED',
          entityType: 'AUTH',
          details: { reason: 'ACCOUNT_DEACTIVATED' },
        });
        return { success: false, error: 'This operator account has been deactivated.' };
      }

      if (ctx.userRepo.isUserLocked(user)) {
        ctx.auditRepo.logAction({
          userId: user.id,
          action: 'LOGIN_BLOCKED',
          entityType: 'AUTH',
          details: { reason: 'ACCOUNT_LOCKED_TEMPORARILY' },
        });
        return {
          success: false,
          error: 'Account temporarily locked due to excessive failed attempts. Please try again later.',
        };
      }

      const isValid = verifyPassword(password, user.password_hash, user.password_salt);
      if (!isValid) {
        const lockout = ctx.userRepo.recordFailedLogin(user.username);
        ctx.auditRepo.logAction({
          userId: user.id,
          action: 'LOGIN_FAILED',
          entityType: 'AUTH',
          details: { reason: 'INVALID_PASSWORD', attemptsIncremented: true },
        });

        if (lockout.locked) {
          return {
            success: false,
            error: 'Account locked for 15 minutes due to too many failed attempts.',
          };
        }

        return { success: false, error: 'Invalid username or password.' };
      }

      ctx.userRepo.recordSuccessfulLogin(user.id);
      const hospital = ctx.hospitalRepo.getSettings();
      if (!hospital) {
        return { success: false, error: 'Hospital profile not configured.' };
      }

      const hospitalWithLogo = attachLogoUrl(hospital, ctx.logoService)!;
      const safeUser = ctx.userRepo.toSafeUser(user);
      currentSession = {
        user: safeUser,
        hospital: hospitalWithLogo,
        sessionStartedAt: new Date().toISOString(),
      };

      ctx.auditRepo.logAction({
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        entityType: 'AUTH',
        details: { username: user.username },
      });

      return { success: true, data: currentSession };
    } catch {
      return { success: false, error: 'An unexpected authentication error occurred.' };
    }
  });

  // 4. Logout
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (): Promise<IpcResponse<boolean>> => {
    if (currentSession) {
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'LOGOUT',
        entityType: 'AUTH',
        details: { username: currentSession.user.username },
      });
      currentSession = null;
    }
    return { success: true, data: true };
  });

  // 5. Get Active Session
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_SESSION, async (): Promise<IpcResponse<SessionInfo | null>> => {
    if (currentSession && currentSession.hospital) {
      currentSession.hospital = attachLogoUrl(ctx.hospitalRepo.getSettings(), ctx.logoService) || currentSession.hospital;
    }
    return { success: true, data: currentSession };
  });

  // 6. Unlock
  ipcMain.handle(IPC_CHANNELS.AUTH_UNLOCK, async (_, rawInput: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) {
        return { success: false, error: 'No active session to unlock.' };
      }

      const parsed = UnlockSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: 'Password is required.' };
      }

      const user = ctx.userRepo.findById(currentSession.user.id);
      if (!user) {
        currentSession = null;
        return { success: false, error: 'User account no longer exists.' };
      }

      const isValid = verifyPassword(parsed.data.password, user.password_hash, user.password_salt);
      if (!isValid) {
        ctx.auditRepo.logAction({
          userId: user.id,
          action: 'UNLOCK_FAILED',
          entityType: 'AUTH',
          details: { reason: 'INVALID_PASSWORD' },
        });
        return { success: false, error: 'Incorrect password.' };
      }

      ctx.auditRepo.logAction({
        userId: user.id,
        action: 'UNLOCK_SUCCESS',
        entityType: 'AUTH',
        details: { username: user.username },
      });

      return { success: true, data: true };
    } catch {
      return { success: false, error: 'Unlock verification failed.' };
    }
  });

  // 7. Get Emergency Recovery Key
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_RECOVERY_KEY, async (): Promise<IpcResponse<string>> => {
    try {
      const key = ctx.keyManager.getOrCreateDatabaseKey();
      const code = ctx.keyManager.getEmergencyRecoveryCode(key);
      return { success: true, data: code };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve recovery key.' };
    }
  });

  // 8. Restore Master Key & Database via Emergency Recovery Key
  ipcMain.handle(IPC_CHANNELS.AUTH_RESTORE_KEY, async (_, rawInput: unknown): Promise<IpcResponse<boolean>> => {
    try {
      const parsed = RestoreKeySchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid recovery key format.' };
      }

      const { recoveryKey, dbBackupPath } = parsed.data;
      const restoredKey = ctx.keyManager.restoreFromEmergencyCode(recoveryKey);

      const userDataPath = app.getPath('userData');
      const activeDbPath = path.join(userDataPath, 'lms_secure.db');

      if (dbBackupPath && fs.existsSync(dbBackupPath)) {
        ctx.dbManager.close();
        fs.copyFileSync(dbBackupPath, activeDbPath);
      }

      // Reconfigure database manager with the restored master key
      ctx.dbManager.reconfigure({
        dbPath: activeDbPath,
        encryptionKey: restoredKey,
      });

      ctx.dbManager.open();
      ctx.migrationRunner.runPendingMigrations();

      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to decrypt database with this recovery key.' };
    }
  });

  // 8b. Restore & Setup Database from USB/Backup using 100-digit dynamic hourly key
  ipcMain.handle(IPC_CHANNELS.AUTH_RESTORE_FROM_BACKUP, async (_, rawInput: unknown): Promise<IpcResponse<boolean>> => {
    try {
      const parsed = RestoreFromBackupSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid parameters.' };
      }

      const { dbBackupPath, dynamicKey } = parsed.data;

      // 1. Verify 100-digit hourly dynamic authorization key
      const keyValidation = validateDynamicHourlyKey(dynamicKey);
      if (!keyValidation.valid) {
        return {
          success: false,
          error: keyValidation.error || 'Invalid or expired 100-digit dynamic authorization key. Please use current hour key.',
        };
      }

      if (!fs.existsSync(dbBackupPath)) {
        return { success: false, error: 'Selected database backup file does not exist.' };
      }

      const userDataPath = app.getPath('userData');
      const activeDbPath = path.join(userDataPath, 'lms_secure.db');

      // 2. Retrieve or initialize the master key sealed in DPAPI vault
      const masterKey = ctx.keyManager.getOrCreateDatabaseKey();

      // 3. Pre-flight verification: test opening the candidate backup database
      const tempManager = new DatabaseManager({
        dbPath: dbBackupPath,
        encryptionKey: masterKey,
      });

      try {
        tempManager.open();
        const integrity = tempManager.checkIntegrity();
        if (!integrity.ok) {
          throw new Error('Database integrity check failed.');
        }
      } catch (err: any) {
        tempManager.close();
        return {
          success: false,
          error: `The selected database file cannot be verified or decrypted: ${err?.message || 'Decryption error'}`,
        };
      } finally {
        tempManager.close();
      }

      // 4. Close current active DB connection, copy backup to active database file
      ctx.dbManager.close();
      fs.copyFileSync(dbBackupPath, activeDbPath);

      // 5. Reconfigure with active database and run pending migrations
      ctx.dbManager.reconfigure({
        dbPath: activeDbPath,
        encryptionKey: masterKey,
      });
      ctx.dbManager.open();
      ctx.migrationRunner.runPendingMigrations();

      // 6. Audit log entry
      ctx.auditRepo.logAction({
        action: 'MIGRATION_RESTORE_SUCCESS',
        entityType: 'SYSTEM',
        details: {
          sourcePath: dbBackupPath,
          restoredAt: new Date().toISOString(),
        },
      });

      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Database restoration from backup failed.' };
    }
  });

  // Emergency Password Reset: Verify 102-digit key
  ipcMain.handle(IPC_CHANNELS.AUTH_VERIFY_RESET_KEY, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      const parsed = VerifyResetKeySchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Key must be exactly 102 characters.' };
      }
      const rawKey = parsed.data.key.trim();
      if (rawKey.length !== 102) {
        return { success: false, error: 'Authorization key must be exactly 102 characters long.' };
      }
      const baseKey = rawKey.slice(0, 100);
      const suffix = rawKey.slice(100).toLowerCase();

      if (suffix !== 'aa' && suffix !== 'uu') {
        return {
          success: false,
          error: "Invalid authorization suffix. Key must end with 'aa' for Administrator or 'uu' for Staff/Operator.",
        };
      }

      const keyCheck = validateDynamicHourlyKey(baseKey);
      if (!keyCheck.valid) {
        return {
          success: false,
          error: keyCheck.error || 'Invalid or expired emergency authorization key. Contact developer Muhammad Adil (03178261618) for the current key.',
        };
      }

      const allUsers = ctx.userRepo.listUsers();
      const isForAdmin = suffix === 'aa';
      const eligibleUsers = allUsers.filter((u) => isForAdmin ? u.role === 'admin' : u.role !== 'admin');

      if (eligibleUsers.length === 0) {
        return {
          success: false,
          error: isForAdmin ? 'No administrator account found in system.' : 'No operator/staff accounts found in system.',
        };
      }

      return {
        success: true,
        data: {
          valid: true,
          targetScope: isForAdmin ? 'admin' : 'operator',
          scopeLabel: isForAdmin ? 'Administrator Account' : 'Staff / Operator Account',
          users: eligibleUsers.map((u) => ({
            id: u.id,
            username: u.username,
            fullName: u.full_name,
            role: u.role,
          })),
        },
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to verify authorization key.' };
    }
  });

  // Emergency Password Reset: Execute reset with verified 102-digit key
  ipcMain.handle(IPC_CHANNELS.AUTH_RESET_PASSWORD_WITH_KEY, async (_, rawInput: unknown): Promise<IpcResponse<boolean>> => {
    try {
      const parsed = ResetPasswordWithKeySchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid reset data.' };
      }
      const { key, userId, newPassword } = parsed.data;
      const rawKey = key.trim();
      if (rawKey.length !== 102) {
        return { success: false, error: 'Authorization key must be exactly 102 characters long.' };
      }
      const baseKey = rawKey.slice(0, 100);
      const suffix = rawKey.slice(100).toLowerCase();

      if (suffix !== 'aa' && suffix !== 'uu') {
        return { success: false, error: "Invalid key suffix. Must end with 'aa' or 'uu'." };
      }

      const keyCheck = validateDynamicHourlyKey(baseKey);
      if (!keyCheck.valid) {
        return { success: false, error: 'Emergency authorization key has expired. Please request the latest key from developer.' };
      }

      const targetUser = ctx.userRepo.findById(userId);
      if (!targetUser) {
        return { success: false, error: 'Selected user does not exist.' };
      }

      if (suffix === 'aa' && targetUser.role !== 'admin') {
        return { success: false, error: 'This key is only authorized to reset Administrator accounts.' };
      }
      if (suffix === 'uu' && targetUser.role === 'admin') {
        return { success: false, error: 'This key is only authorized to reset Staff/Operator accounts, not Administrator.' };
      }

      const { hash, salt } = hashPasswordSync(newPassword);
      ctx.userRepo.updatePassword(userId, hash, salt);

      ctx.auditRepo.logAction({
        userId,
        action: 'EMERGENCY_PASSWORD_RESET',
        entityType: 'USER',
        entityId: String(userId),
        details: {
          username: targetUser.username,
          scope: suffix === 'aa' ? 'admin' : 'operator',
          resetVia: '102_DIGIT_DEVELOPER_KEY',
        },
      });

      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to reset password.' };
    }
  });

  // 9. Get Hospital Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_HOSPITAL, async (): Promise<IpcResponse<any>> => {
    try {
      const settings = ctx.hospitalRepo.getSettings();
      if (!settings) {
        return { success: false, error: 'Hospital settings not configured.' };
      }
      return { success: true, data: attachLogoUrl(settings, ctx.logoService) };
    } catch {
      return { success: false, error: 'Failed to retrieve hospital settings.' };
    }
  });

  // 8. Update Hospital Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE_HOSPITAL, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) {
        return { success: false, error: 'Unauthorized. Operator session required.' };
      }

      const parsed = UpdateHospitalSettingsSchema.safeParse(rawInput);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues?.[0]?.message || 'Invalid settings payload.';
        return { success: false, error: errorMsg };
      }

      const updated = ctx.hospitalRepo.updateSettings(parsed.data);
      const withLogo = attachLogoUrl(updated, ctx.logoService);
      currentSession.hospital = withLogo!;

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'HOSPITAL_SETTINGS_UPDATED',
        entityType: 'SETTINGS',
        entityId: '1',
        details: {
          updatedFields: Object.keys(parsed.data),
        },
      });

      return { success: true, data: withLogo };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update hospital settings.' };
    }
  });

  // 9. Upload & Save Logo
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPLOAD_LOGO, async (_, base64Image: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) {
        return { success: false, error: 'Unauthorized.' };
      }
      if (typeof base64Image !== 'string' || !base64Image) {
        return { success: false, error: 'Image data is required.' };
      }

      const saved = ctx.logoService.saveLogo(base64Image);
      const updated = ctx.hospitalRepo.updateSettings({ logo_relative_path: saved.relativePath });
      const logoUrl = ctx.logoService.getLogoDataUrl(saved.relativePath);
      const withLogo = { ...updated, logo_url: logoUrl };
      currentSession.hospital = withLogo;

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'HOSPITAL_LOGO_UPDATED',
        entityType: 'SETTINGS',
        entityId: '1',
        details: { relativePath: saved.relativePath, mimeType: saved.mimeType },
      });

      return { success: true, data: { logoPath: saved.relativePath, logoUrl } };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save logo image.' };
    }
  });

  // 10. Get Logo Data URL
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_LOGO_URL, async (): Promise<IpcResponse<string | null>> => {
    try {
      const settings = ctx.hospitalRepo.getSettings();
      const logoUrl = ctx.logoService.getLogoDataUrl(settings?.logo_relative_path);
      return { success: true, data: logoUrl };
    } catch {
      return { success: true, data: null };
    }
  });

  // --- PATIENTS HANDLERS ---
  // 11. Search Patients
  ipcMain.handle(IPC_CHANNELS.PATIENTS_SEARCH, async (_, params: any): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const res = ctx.patientRepo.searchPatients(params || {});
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to search patient records.' };
    }
  });

  // 12. Get Patient by ID
  ipcMain.handle(IPC_CHANNELS.PATIENTS_GET_BY_ID, async (_, id: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'number' || isNaN(id)) return { success: false, error: 'Invalid patient ID.' };
      const patient = ctx.patientRepo.getPatientById(id);
      return { success: true, data: patient };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve patient.' };
    }
  });

  // 13. Create Patient
  ipcMain.handle(IPC_CHANNELS.PATIENTS_CREATE, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = CreatePatientSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid patient data.' };
      }

      const created = ctx.patientRepo.createPatient(parsed.data);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'PATIENT_REGISTERED',
        entityType: 'PATIENT',
        entityId: String(created.id),
        details: { patient_mrn: created.patient_mrn, full_name: created.full_name, gender: created.gender },
      });

      return { success: true, data: created };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to register patient.' };
    }
  });

  // 14. Update Patient
  ipcMain.handle(IPC_CHANNELS.PATIENTS_UPDATE, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = UpdatePatientSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid patient update.' };
      }

      const updated = ctx.patientRepo.updatePatient(parsed.data.id, parsed.data);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'PATIENT_UPDATED',
        entityType: 'PATIENT',
        entityId: String(updated.id),
        details: { patient_mrn: updated.patient_mrn, full_name: updated.full_name },
      });

      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update patient record.' };
    }
  });

  // 15. Check Duplicate Patients
  ipcMain.handle(IPC_CHANNELS.PATIENTS_CHECK_DUPLICATES, async (_, { fullName, phoneNumber, excludeId }: any): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (!fullName || typeof fullName !== 'string') return { success: true, data: { hasDuplicate: false } };
      const warnings = ctx.patientRepo.checkDuplicates(fullName, phoneNumber, excludeId);
      return { success: true, data: warnings };
    } catch {
      return { success: true, data: { hasDuplicate: false } };
    }
  });

  // --- DOCTORS HANDLERS ---
  // 16. List Doctors
  ipcMain.handle(IPC_CHANNELS.DOCTORS_LIST, async (_, params: any): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const docs = ctx.doctorRepo.listDoctors(params || {});
      return { success: true, data: docs };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to list doctors.' };
    }
  });

  // 17. Get Doctor by ID
  ipcMain.handle(IPC_CHANNELS.DOCTORS_GET_BY_ID, async (_, id: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'number' || isNaN(id)) return { success: false, error: 'Invalid doctor ID.' };
      const doc = ctx.doctorRepo.getDoctorById(id);
      return { success: true, data: doc };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve doctor.' };
    }
  });

  // 18. Create Doctor
  ipcMain.handle(IPC_CHANNELS.DOCTORS_CREATE, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = CreateDoctorSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid doctor data.' };
      }

      const created = ctx.doctorRepo.createDoctor(parsed.data);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'DOCTOR_REGISTERED',
        entityType: 'DOCTOR',
        entityId: String(created.id),
        details: { full_name: created.full_name, specialization: created.specialization },
      });

      return { success: true, data: created };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to register doctor.' };
    }
  });

  // 19. Update Doctor
  ipcMain.handle(IPC_CHANNELS.DOCTORS_UPDATE, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = UpdateDoctorSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid doctor update.' };
      }

      const updated = ctx.doctorRepo.updateDoctor(parsed.data.id, parsed.data);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'DOCTOR_UPDATED',
        entityType: 'DOCTOR',
        entityId: String(updated.id),
        details: { full_name: updated.full_name, is_active: updated.is_active },
      });

      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update doctor.' };
    }
  });

  // 20. Set Doctor Active Status
  ipcMain.handle(IPC_CHANNELS.DOCTORS_SET_ACTIVE, async (_, { id, isActive }: any): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'number') return { success: false, error: 'Invalid doctor ID.' };

      const updated = ctx.doctorRepo.setDoctorActiveStatus(id, !!isActive);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: isActive ? 'DOCTOR_ACTIVATED' : 'DOCTOR_DEACTIVATED',
        entityType: 'DOCTOR',
        entityId: String(id),
        details: { full_name: updated.full_name, is_active: updated.is_active },
      });

      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to alter doctor status.' };
    }
  });

  // 21. Check Duplicate Doctors
  ipcMain.handle(IPC_CHANNELS.DOCTORS_CHECK_DUPLICATES, async (_, { fullName, excludeId }: any): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (!fullName || typeof fullName !== 'string') return { success: true, data: { hasDuplicate: false } };
      const warnings = ctx.doctorRepo.checkDuplicates(fullName, excludeId);
      return { success: true, data: warnings };
    } catch {
      return { success: true, data: { hasDuplicate: false } };
    }
  });

  // --- TESTS & CATALOG HANDLERS ---
  // 22. List Tests
  ipcMain.handle(IPC_CHANNELS.TESTS_LIST, async (_, params: any): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const tests = ctx.catalogRepo.listTests(params || {});
      return { success: true, data: tests };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to list laboratory tests.' };
    }
  });

  // 23. Get Test by ID
  ipcMain.handle(IPC_CHANNELS.TESTS_GET_BY_ID, async (_, id: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'number' || isNaN(id)) return { success: false, error: 'Invalid test ID.' };
      const test = ctx.catalogRepo.getTestById(id, true);
      return { success: true, data: test };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve test details.' };
    }
  });

  // 24. Create Test
  ipcMain.handle(IPC_CHANNELS.TESTS_CREATE, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = CreateTestSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid test catalog data.' };
      }

      const input = parsed.data;
      const created = ctx.catalogRepo.createTest(
        {
          testCode: input.testCode,
          testName: input.testName,
          category: input.category,
          description: input.description,
          pricePaisa: input.pricePaisa,
          sampleType: input.sampleType,
          collectionContainer: input.collectionContainer,
          patientPreparation: input.patientPreparation,
          turnaroundTime: input.turnaroundTime,
          testMethod: input.testMethod,
        },
        input.parameters as any
      );

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'TEST_CATALOG_CREATED',
        entityType: 'TEST',
        entityId: String(created.id),
        details: { test_code: created.test_code, test_name: created.test_name, price_paisa: created.price_paisa },
      });

      return { success: true, data: created };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to create test catalog entry.' };
    }
  });

  // 25. Update Test
  ipcMain.handle(IPC_CHANNELS.TESTS_UPDATE, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = UpdateTestSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid test update.' };
      }

      const input = parsed.data;
      const updated = ctx.catalogRepo.updateTest(
        input.id,
        {
          testCode: input.testCode,
          testName: input.testName,
          category: input.category,
          description: input.description,
          pricePaisa: input.pricePaisa,
          sampleType: input.sampleType,
          collectionContainer: input.collectionContainer,
          patientPreparation: input.patientPreparation,
          turnaroundTime: input.turnaroundTime,
          testMethod: input.testMethod,
          isActive: input.isActive,
        },
        input.parameters as any
      );

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'TEST_CATALOG_UPDATED',
        entityType: 'TEST',
        entityId: String(updated.id),
        details: { test_code: updated.test_code, test_name: updated.test_name, price_paisa: updated.price_paisa },
      });

      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update test catalog entry.' };
    }
  });

  // 26. Set Test Active Status
  ipcMain.handle(IPC_CHANNELS.TESTS_SET_ACTIVE, async (_, { id, isActive }: any): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'number') return { success: false, error: 'Invalid test ID.' };

      const updated = ctx.catalogRepo.setTestActiveStatus(id, !!isActive);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: isActive ? 'TEST_ACTIVATED' : 'TEST_DEACTIVATED',
        entityType: 'TEST',
        entityId: String(id),
        details: { test_code: updated.test_code, is_active: updated.is_active },
      });

      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to alter test status.' };
    }
  });

  // 27. Get Test Categories
  ipcMain.handle(IPC_CHANNELS.TESTS_GET_CATEGORIES, async (): Promise<IpcResponse<string[]>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const cats = ctx.catalogRepo.getCategories();
      return { success: true, data: cats };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve test categories.' };
    }
  });

  // --- VISITS & BILLING HANDLERS ---

  // 28. Create Visit, Order Items, and Invoice
  ipcMain.handle(IPC_CHANNELS.VISITS_CREATE, async (_, rawInput: unknown): Promise<IpcResponse<VisitDetail>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized. Please log in.' };
      const parsed = CreateVisitOrderSchema.safeParse(rawInput);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(' ');
        return { success: false, error: msg };
      }

      const detail = ctx.visitRepo.createVisitWithOrder(parsed.data, currentSession.user.id);
      return { success: true, data: detail };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to register visit and create order.' };
    }
  });

  // 28b. Update Visit, Order Items, and Invoice
  ipcMain.handle(IPC_CHANNELS.VISITS_UPDATE_ORDER_INVOICE, async (_, rawInput: unknown): Promise<IpcResponse<VisitDetail>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized. Please log in.' };
      const parsed = UpdateVisitOrderAndInvoiceSchema.safeParse(rawInput);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(' ');
        return { success: false, error: msg };
      }

      const detail = ctx.visitRepo.updateVisitOrderAndInvoice(parsed.data, currentSession.user.id);
      return { success: true, data: detail };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update order and invoice.' };
    }
  });

  // 29. Get Visit By ID
  ipcMain.handle(IPC_CHANNELS.VISITS_GET_BY_ID, async (_, id: unknown): Promise<IpcResponse<VisitDetail | null>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'number' || id <= 0) return { success: false, error: 'Invalid visit ID.' };

      const detail = ctx.visitRepo.getVisitById(id);
      return { success: true, data: detail };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve visit details.' };
    }
  });

  // 30. Search Visits
  ipcMain.handle(IPC_CHANNELS.VISITS_SEARCH, async (_, params: any): Promise<IpcResponse<VisitSearchResult>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const result = ctx.visitRepo.searchVisits(params || {});
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to search visits.' };
    }
  });

  // 31. Get Patient Visit History
  ipcMain.handle(IPC_CHANNELS.VISITS_GET_PATIENT_HISTORY, async (_, patientId: unknown): Promise<IpcResponse<any[]>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof patientId !== 'number' || patientId <= 0) return { success: false, error: 'Invalid patient ID.' };

      const visits = ctx.visitRepo.getVisitsByPatientId(patientId);
      return { success: true, data: visits };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve patient history.' };
    }
  });

  // 32. Record Payment Against Invoice
  ipcMain.handle(IPC_CHANNELS.BILLING_RECORD_PAYMENT, async (_, rawInput: unknown): Promise<IpcResponse<Payment>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = RecordPaymentSchema.safeParse(rawInput);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(' ');
        return { success: false, error: msg };
      }

      const payment = ctx.visitRepo.recordPayment(parsed.data, currentSession.user.id);
      return { success: true, data: payment };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to record payment.' };
    }
  });

  // 33. Get Invoice By ID
  ipcMain.handle(IPC_CHANNELS.BILLING_GET_INVOICE, async (_, id: unknown): Promise<IpcResponse<Invoice | null>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'number' || id <= 0) return { success: false, error: 'Invalid invoice ID.' };

      const db = ctx.dbManager.getDatabase();
      const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(id) as Invoice | undefined;
      return { success: true, data: invoice || null };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve invoice.' };
    }
  });

  // --- RESULTS & VERIFICATION HANDLERS (Prompt 4) ---

  // 34. Get Accession Worklist
  ipcMain.handle(IPC_CHANNELS.RESULTS_GET_WORKLIST, async (_, params: any): Promise<IpcResponse<WorklistOrderItem[]>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const worklist = ctx.resultRepo.getWorklist(params || {});
      return { success: true, data: worklist };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve laboratory worklist.' };
    }
  });

  // 35. Get Parameters and Existing Results for Order Item
  ipcMain.handle(IPC_CHANNELS.RESULTS_GET_FOR_ORDER_ITEM, async (_, orderItemId: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof orderItemId !== 'number' || orderItemId <= 0) {
        return { success: false, error: 'Invalid order item ID.' };
      }

      const details = ctx.resultRepo.getOrderResults(orderItemId);
      return { success: true, data: details };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve test parameters and results.' };
    }
  });

  // 36. Save Draft Results
  ipcMain.handle(IPC_CHANNELS.RESULTS_SAVE_DRAFT, async (_, rawInput: unknown): Promise<IpcResponse<TestResult[]>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = SaveDraftResultsSchema.safeParse(rawInput);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(' ');
        return { success: false, error: msg };
      }

      const results = ctx.resultRepo.saveDraftResults(parsed.data, currentSession.user.id);
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save draft results.' };
    }
  });

  // 37. Mark Results Reviewed
  ipcMain.handle(IPC_CHANNELS.RESULTS_MARK_REVIEWED, async (_, orderItemId: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof orderItemId !== 'number' || orderItemId <= 0) {
        return { success: false, error: 'Invalid order item ID.' };
      }

      const db = ctx.dbManager.getDatabase();
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE test_results
        SET status = 'reviewed', reviewed_by = ?, reviewed_at = ?, updated_at = ?
        WHERE order_item_id = ? AND status = 'draft'
      `).run(currentSession.user.id, now, now, orderItemId);

      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to mark results as reviewed.' };
    }
  });

  // 38. Finalize Report
  ipcMain.handle(IPC_CHANNELS.RESULTS_FINALIZE_REPORT, async (_, rawInput: unknown): Promise<IpcResponse<ReportSnapshot>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = FinalizeReportSchema.safeParse(rawInput);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(' ');
        return { success: false, error: msg };
      }

      const snapshot = ctx.resultRepo.finalizeReport(parsed.data, currentSession.user.id);
      return { success: true, data: snapshot };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to finalize laboratory report.' };
    }
  });

  // 39. Amend Finalized Result
  ipcMain.handle(IPC_CHANNELS.RESULTS_AMEND, async (_, rawInput: unknown): Promise<IpcResponse<TestResult>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = AmendResultSchema.safeParse(rawInput);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(' ');
        return { success: false, error: msg };
      }

      const amended = ctx.resultRepo.amendResult(parsed.data, currentSession.user.id);
      return { success: true, data: amended };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to record clinical amendment.' };
    }
  });

  // 40. Get Full Diagnostic Report
  ipcMain.handle(IPC_CHANNELS.REPORTS_GET_DIAGNOSTIC_REPORT, async (_, visitId: unknown): Promise<IpcResponse<FullDiagnosticReport>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof visitId !== 'number' || visitId <= 0) {
        return { success: false, error: 'Invalid visit ID.' };
      }

      const report = ctx.resultRepo.getFullDiagnosticReport(visitId);
      if (report) {
        if (report.hospital) {
          report.hospital = attachLogoUrl(report.hospital, ctx.logoService) || report.hospital;
        }
        report.template = ctx.templateRepo.getActiveTemplate();
      }
      return { success: true, data: report };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to compile diagnostic report.' };
    }
  });

  // 41. Export Local PDF
  ipcMain.handle(IPC_CHANNELS.REPORTS_EXPORT_PDF, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = ExportPdfSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: 'Invalid export parameters.' };
      }

      const mainWindow = ctx.getMainWindow ? ctx.getMainWindow() : null;
      if (!mainWindow) {
        return { success: false, error: 'Application window is not available for PDF generation.' };
      }

      const reportData = ctx.resultRepo.getFullDiagnosticReport(parsed.data.visitId);
      if (reportData.hospital) {
        reportData.hospital = attachLogoUrl(reportData.hospital, ctx.logoService) || reportData.hospital;
      }
      reportData.template = ctx.templateRepo.getActiveTemplate();

      const result = await PdfService.exportReportPdf(
        mainWindow,
        reportData,
        parsed.data.defaultFileName || `Lab_Report_Visit_${parsed.data.visitId}.pdf`
      );
      return { success: result.success, data: result };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to export PDF.' };
    }
  });

  // 41b. Print Local Diagnostic Report via Native Windows Print Window
  ipcMain.handle(IPC_CHANNELS.REPORTS_PRINT, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = z.object({ visitId: z.number().int().positive() }).safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: 'Invalid visit ID for print.' };
      }

      const reportData = ctx.resultRepo.getFullDiagnosticReport(parsed.data.visitId);
      if (reportData.hospital) {
        reportData.hospital = attachLogoUrl(reportData.hospital, ctx.logoService) || reportData.hospital;
      }
      reportData.template = ctx.templateRepo.getActiveTemplate();

      const printRes = await PdfService.printReport(reportData);
      return printRes;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to print report.' };
    }
  });

  // 42. Get Comprehensive Patient History
  ipcMain.handle(IPC_CHANNELS.PATIENTS_GET_FULL_HISTORY, async (_, patientId: unknown): Promise<IpcResponse<PatientHistoryItem[]>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof patientId !== 'number' || patientId <= 0) {
        return { success: false, error: 'Invalid patient ID.' };
      }

      const history = ctx.patientHistoryRepo.getFullHistory(patientId);
      return { success: true, data: history };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve patient clinical history.' };
    }
  });

  // 43. Doctor Referral Statistics
  ipcMain.handle(IPC_CHANNELS.REPORTS_DOCTOR_STATS, async (_, rawQuery: unknown): Promise<IpcResponse<DoctorReferralStats[]>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = DoctorStatsQuerySchema.safeParse(rawQuery || {});
      const query = parsed.success ? parsed.data : {};
      const stats = ctx.doctorStatsRepo.getDoctorReferralStats(query);
      return { success: true, data: stats };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to calculate doctor statistics.' };
    }
  });

  // 44. Backup: Select Destination Folder
  ipcMain.handle(IPC_CHANNELS.BACKUP_SELECT_DESTINATION, async (): Promise<IpcResponse<string | null>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const mainWindow = ctx.getMainWindow ? ctx.getMainWindow() : null;
      if (!mainWindow) return { success: false, error: 'Application window not available.' };
      const selected = await ctx.backupService.selectBackupDestination(mainWindow);
      return { success: true, data: selected };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to select backup destination.' };
    }
  });

  // Backup: Save Default Destination Path
  ipcMain.handle(IPC_CHANNELS.BACKUP_SET_DEFAULT_PATH, async (_, destinationPath: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof destinationPath !== 'string' || !destinationPath.trim()) {
        return { success: false, error: 'Invalid destination folder path.' };
      }
      ctx.hospitalRepo.updateSettings({ default_backup_path: destinationPath.trim() });
      if (currentSession.hospital) {
        currentSession.hospital.default_backup_path = destinationPath.trim();
      }
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save default backup destination.' };
    }
  });

  // 45. Backup: Create Database Backup
  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, async (_, rawInput: unknown): Promise<IpcResponse<BackupResult>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = CreateBackupSchema.safeParse(rawInput || {});
      if (!parsed.success) {
        return { success: false, error: 'Invalid backup input parameters.' };
      }

      const hospital = ctx.hospitalRepo.getSettings();
      const destinationDir = parsed.data.destinationDir || hospital?.default_backup_path || undefined;
      const result = await ctx.backupService.createBackup({
        destinationDir,
        deletePrevious: parsed.data.deletePrevious,
      });

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'DATABASE_BACKUP_CREATED',
        entityType: 'DATABASE',
        details: {
          fileName: result.fileName,
          fileSize: result.fileSize,
          checksum: result.checksum,
          deletedPrevious: !!parsed.data.deletePrevious,
        },
      });

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Database backup failed.' };
    }
  });

  // 45b. Backup: Purge Older Backups
  ipcMain.handle(IPC_CHANNELS.BACKUP_PURGE_OLDER, async (_, rawInput: unknown): Promise<IpcResponse<{ deletedCount: number }>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = PurgeOlderBackupsSchema.safeParse(rawInput || {});
      const hospital = ctx.hospitalRepo.getSettings();
      const targetDir = parsed.success && parsed.data.destinationDir
        ? parsed.data.destinationDir
        : hospital?.default_backup_path || undefined;
      const keepFileName = parsed.success ? parsed.data.keepFileName : undefined;
      const deletedCount = ctx.backupService.purgeOlderBackups(targetDir, keepFileName);
      return { success: true, data: { deletedCount } };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to purge older backups.' };
    }
  });

  // 46. Backup: List Local Backups
  ipcMain.handle(IPC_CHANNELS.BACKUP_LIST_LOCAL, async (_, customDir: unknown): Promise<IpcResponse<BackupMetadata[]>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const hospital = ctx.hospitalRepo.getSettings();
      const scanDir = typeof customDir === 'string' && customDir.trim()
        ? customDir.trim()
        : hospital?.default_backup_path || undefined;
      const backups = ctx.backupService.listLocalBackups(scanDir);
      return { success: true, data: backups };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve backups list.' };
    }
  });

  // Developer: Validate Access Password ('aaaaaaaa')
  ipcMain.handle(IPC_CHANNELS.DEV_VALIDATE_PASSWORD, async (_, password: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const isCorrect = password === 'ADIIKING34aa@@';
      return { success: true, data: isCorrect };
    } catch {
      return { success: false, error: 'Failed to validate developer credentials.' };
    }
  });

  // Developer: Get Current Dynamic Hourly Key
  ipcMain.handle(IPC_CHANNELS.DEV_GET_CURRENT_DYNAMIC_KEY, async (): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const now = new Date();
      const key = generateDynamicHourlyKey(now);
      const minutesRemaining = getMinutesRemainingInCurrentHour();
      const rawHour = now.getHours();
      const hour12 = rawHour % 12 || 12;
      const ampm = rawHour >= 12 ? 'PM' : 'AM';
      return {
        success: true,
        data: {
          key,
          adminKey: `${key}aa`,
          userKey: `${key}uu`,
          minutesRemaining,
          currentHourStr: `${hour12} ${ampm}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to generate dynamic authorization key.' };
    }
  });

  // Developer: Direct Password Reset Console
  ipcMain.handle(IPC_CHANNELS.DEV_RESET_USER_PASSWORD, async (_, rawInput: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = DevResetPasswordSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid password reset input.' };
      }
      const { userId, newPassword } = parsed.data;
      const targetUser = ctx.userRepo.findById(userId);
      if (!targetUser) {
        return { success: false, error: 'User not found.' };
      }

      const { hash, salt } = hashPasswordSync(newPassword);
      ctx.userRepo.updatePassword(userId, hash, salt);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'DEVELOPER_PASSWORD_RESET',
        entityType: 'USER',
        entityId: String(userId),
        details: { targetUsername: targetUser.username, resetBy: currentSession.user.username },
      });

      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to reset user password.' };
    }
  });

  // Developer: Detect Legacy Backup Database
  ipcMain.handle(IPC_CHANNELS.DEV_DETECT_LEGACY_BACKUP, async (_, filePath?: unknown): Promise<IpcResponse<LegacyTestDetectionResult>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const customPath = typeof filePath === 'string' && filePath.trim() ? filePath.trim() : undefined;
      const detected = detectLegacyTestCatalog(customPath);
      return { success: true, data: detected };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to detect legacy test catalog.' };
    }
  });

  // Developer: Import Legacy Tests with One Click ("Add Tests")
  ipcMain.handle(IPC_CHANNELS.DEV_IMPORT_LEGACY_TESTS, async (_, filePath?: unknown): Promise<IpcResponse<LegacyTestImportStats>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const customPath = typeof filePath === 'string' && filePath.trim() ? filePath.trim() : undefined;
      const stats = importLegacyTestsToActiveDatabase(ctx.dbManager, customPath);

      // Audit log the test catalog import
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'IMPORT_LEGACY_TESTS',
        entityType: 'LAB_TEST',
        entityId: 'CATALOG',
        details: {
          totalTests: stats.totalTests,
          parametersInserted: stats.parametersInserted,
          sourceFile: path.basename(stats.filePath),
        },
      });

      return { success: true, data: stats };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to import legacy tests.' };
    }
  });

  // Developer: Select Legacy Backup File Dialog
  ipcMain.handle(IPC_CHANNELS.DEV_SELECT_LEGACY_FILE, async (): Promise<IpcResponse<string | null>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const mainWindow = ctx.getMainWindow ? ctx.getMainWindow() : null;
      const res = await dialog.showOpenDialog(mainWindow as any, {
        title: 'Select Legacy Laboratory Backup File (.bak / .db)',
        filters: [
          { name: 'Legacy Backup Files', extensions: ['bak', 'db', 'sqlite'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (res.canceled || res.filePaths.length === 0) {
        return { success: true, data: null };
      }
      return { success: true, data: res.filePaths[0] };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to open file dialog.' };
    }
  });

  // Developer: Detect Saved Report Template Seed
  ipcMain.handle(IPC_CHANNELS.DEV_DETECT_SAVED_TEMPLATE, async (_, filePath?: unknown): Promise<IpcResponse<SavedTemplateDetectionResult>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const customPath = typeof filePath === 'string' && filePath.trim() ? filePath.trim() : undefined;
      const detected = detectSavedTemplate(customPath);
      return { success: true, data: detected };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to detect saved report template seed.' };
    }
  });

  // Developer: Seed / Apply Saved Report Design to Active Database
  ipcMain.handle(IPC_CHANNELS.DEV_SEED_SAVED_TEMPLATE, async (_, filePath?: unknown): Promise<IpcResponse<SavedTemplateSeedResult>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const customPath = typeof filePath === 'string' && filePath.trim() ? filePath.trim() : undefined;
      const result = applySavedTemplateSeed(ctx.dbManager, customPath);

      // Audit log the template seed
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'SEED_REPORT_TEMPLATE',
        entityType: 'REPORT_TEMPLATE',
        entityId: result.templateId,
        details: {
          templateName: result.templateName,
          hospitalName: result.hospitalName,
          hasLogo: result.hasLogo,
          activated: result.activated,
        },
      });

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to apply saved report design.' };
    }
  });

  // Developer: Select Report Template File Dialog
  ipcMain.handle(IPC_CHANNELS.DEV_SELECT_TEMPLATE_FILE, async (): Promise<IpcResponse<string | null>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const mainWindow = ctx.getMainWindow ? ctx.getMainWindow() : null;
      const res = await dialog.showOpenDialog(mainWindow as any, {
        title: 'Select Saved Report Template File (.json / .db)',
        filters: [
          { name: 'Report Template Seed Files', extensions: ['json', 'db', 'sqlite'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (res.canceled || res.filePaths.length === 0) {
        return { success: true, data: null };
      }
      return { success: true, data: res.filePaths[0] };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to open file dialog.' };
    }
  });

  // Developer: Clear All Existing Tests
  ipcMain.handle(IPC_CHANNELS.DEV_CLEAR_ALL_TESTS, async (): Promise<IpcResponse<{ deletedTests: number; deletedParams: number }>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const res = clearAllCatalogTests(ctx.dbManager);

      // Audit log the test catalog wipe
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'CLEAR_ALL_TESTS',
        entityType: 'LAB_TEST',
        entityId: 'CATALOG',
        details: res,
      });

      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to clear tests from database.' };
    }
  });

  // Developer: Wipe All Database Data (Transactional & Catalog - Fresh Start)
  ipcMain.handle(IPC_CHANNELS.DEV_WIPE_ALL_DATA, async (): Promise<IpcResponse<{ deletedTests: number; deletedParams: number; deletedVisits: number }>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const res = wipeAllDatabaseData(ctx.dbManager);

      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to wipe database data.' };
    }
  });

  // 47. Restore: Select Backup File
  ipcMain.handle(IPC_CHANNELS.RESTORE_SELECT_FILE, async (): Promise<IpcResponse<string | null>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const mainWindow = ctx.getMainWindow ? ctx.getMainWindow() : null;
      if (!mainWindow) return { success: false, error: 'Application window not available.' };
      const selected = await ctx.restoreService.selectBackupFile(mainWindow);
      return { success: true, data: selected };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to select backup file.' };
    }
  });

  // 48. Restore: Inspect Candidate Backup File
  ipcMain.handle(IPC_CHANNELS.RESTORE_INSPECT_FILE, async (_, filePath: unknown): Promise<IpcResponse<BackupInspectionResult>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof filePath !== 'string' || !filePath.trim()) {
        return { success: false, error: 'Invalid backup file path.' };
      }
      const inspection = ctx.restoreService.inspectBackup(filePath.trim());
      return { success: true, data: inspection };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to inspect backup file.' };
    }
  });

  // 49. Restore: Execute Database Restoration
  ipcMain.handle(IPC_CHANNELS.RESTORE_EXECUTE, async (_, rawInput: unknown): Promise<IpcResponse<RestoreExecutionResult>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = ExecuteRestoreSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: 'Invalid restore parameters.' };
      }

      const result = await ctx.restoreService.executeRestore(parsed.data.filePath);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'DATABASE_RESTORED',
        entityType: 'DATABASE',
        details: {
          restoredFrom: parsed.data.filePath,
          preRestoreSnapshot: result.preRestoreSnapshotPath,
        },
      });

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Database restoration failed.' };
    }
  });

  // 35. Audit Logs
  ipcMain.handle(IPC_CHANNELS.AUDIT_GET_RECENT, async (_, limit = 50): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const safeLimit = Math.min(Math.max(1, limit), 200);
      const logs = ctx.auditRepo.getRecentLogs(safeLimit);
      return { success: true, data: logs };
    } catch {
      return { success: false, error: 'Failed to retrieve audit log.' };
    }
  });

  // 35b. Audit Logs with Date Range & Pagination
  ipcMain.handle(IPC_CHANNELS.AUDIT_QUERY, async (_, params: any): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const result = ctx.auditRepo.getLogs(params || {});
      return { success: true, data: result };
    } catch {
      return { success: false, error: 'Failed to query audit logs.' };
    }
  });

  // 36. Report Templates Designer
  ipcMain.handle(IPC_CHANNELS.TEMPLATES_LIST, async (): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const templates = ctx.templateRepo.getTemplates();
      return { success: true, data: templates };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to list report templates.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATES_GET_ACTIVE, async (): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const template = ctx.templateRepo.getActiveTemplate();
      return { success: true, data: template };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to get active report template.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATES_SAVE, async (_, template: any): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (!template || !template.name) return { success: false, error: 'Template name is required.' };
      const saved = ctx.templateRepo.saveTemplate(template);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'REPORT_TEMPLATE_SAVED',
        entityType: 'report_template',
        entityId: saved.id,
        details: { name: saved.name, active: saved.active },
      });
      return { success: true, data: saved };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save report template.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATES_ACTIVATE, async (_, id: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'string' || !id.trim()) return { success: false, error: 'Invalid template ID.' };
      ctx.templateRepo.activateTemplate(id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'REPORT_TEMPLATE_ACTIVATED',
        entityType: 'report_template',
        entityId: id,
      });
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to activate report template.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATES_DELETE, async (_, id: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'string' || !id.trim()) return { success: false, error: 'Invalid template ID.' };
      ctx.templateRepo.deleteTemplate(id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'REPORT_TEMPLATE_DELETED',
        entityType: 'report_template',
        entityId: id,
      });
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete report template.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATES_PRINT_TEST, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const { template } = (rawInput as any) || {};
      if (!template) return { success: false, error: 'Template data is required.' };

      let hospital = ctx.hospitalRepo.getSettings();
      if (hospital) {
        hospital = attachLogoUrl(hospital, ctx.logoService) || hospital;
      }
      const sample = PdfService.createSampleReport(template, hospital);
      const printRes = await PdfService.printReport(sample);
      return printRes;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to print test report.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATES_EXPORT_PDF_TEST, async (_, rawInput: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const { template } = (rawInput as any) || {};
      if (!template) return { success: false, error: 'Template data is required.' };

      const mainWindow = ctx.getMainWindow ? ctx.getMainWindow() : null;
      if (!mainWindow) return { success: false, error: 'Window not available.' };

      let hospital = ctx.hospitalRepo.getSettings();
      if (hospital) {
        hospital = attachLogoUrl(hospital, ctx.logoService) || hospital;
      }
      const sample = PdfService.createSampleReport(template, hospital);
      const exportRes = await PdfService.exportReportPdf(mainWindow, sample, 'Sample_Diagnostic_Report.pdf');
      return exportRes;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to export test report PDF.' };
    }
  });

  // --- USERS MANAGEMENT & RBAC HANDLERS ---
  // Users List
  ipcMain.handle(IPC_CHANNELS.USERS_LIST, async (): Promise<IpcResponse<SafeUser[]>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const users = ctx.userRepo.listUsers();
      return { success: true, data: users };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to list users.' };
    }
  });

  // Users Create
  ipcMain.handle(IPC_CHANNELS.USERS_CREATE, async (_, rawInput: unknown): Promise<IpcResponse<SafeUser>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (currentSession.user.role !== 'admin') {
        return { success: false, error: 'Access denied. Only administrators can create new users.' };
      }

      const parsed = CreateUserSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid user data.' };
      }

      const { username, fullName, password, role, permissions } = parsed.data;
      const { hash, salt } = hashPasswordSync(password);

      const created = ctx.userRepo.createUser({
        username,
        fullName,
        passwordHash: hash,
        passwordSalt: salt,
        role,
        permissions,
      });

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: String(created.id),
        details: { username: created.username, role: created.role, fullName: created.full_name },
      });

      return { success: true, data: created };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to create user.' };
    }
  });

  // Users Update
  ipcMain.handle(IPC_CHANNELS.USERS_UPDATE, async (_, rawInput: unknown): Promise<IpcResponse<SafeUser>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (currentSession.user.role !== 'admin') {
        return { success: false, error: 'Access denied. Only administrators can modify user profiles.' };
      }

      const parsed = UpdateUserSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid user data.' };
      }

      const { id, fullName, role, permissions, isActive } = parsed.data;
      const updated = ctx.userRepo.updateUser(id, { fullName, role, permissions, isActive });

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'USER_UPDATED',
        entityType: 'USER',
        entityId: String(id),
        details: { username: updated.username, role: updated.role, permissions: updated.permissions, isActive: updated.is_active },
      });

      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update user.' };
    }
  });

  // Users Update Password
  ipcMain.handle(IPC_CHANNELS.USERS_UPDATE_PASSWORD, async (_, rawInput: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };

      const parsed = UpdateUserPasswordSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid password data.' };
      }

      const { id, newPassword } = parsed.data;

      // Allow if admin OR changing own password
      if (currentSession.user.role !== 'admin' && currentSession.user.id !== id) {
        return { success: false, error: 'Access denied. You can only change your own password.' };
      }

      const { hash, salt } = hashPasswordSync(newPassword);
      ctx.userRepo.updatePassword(id, hash, salt);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'USER',
        entityId: String(id),
        details: { targetUserId: id, changedBy: currentSession.user.username },
      });

      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update password.' };
    }
  });

  // Users Toggle Active
  ipcMain.handle(IPC_CHANNELS.USERS_TOGGLE_ACTIVE, async (_, params: any): Promise<IpcResponse<SafeUser>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (currentSession.user.role !== 'admin') {
        return { success: false, error: 'Access denied. Only administrators can alter user active status.' };
      }

      const { id, isActive } = params || {};
      if (typeof id !== 'number' || typeof isActive !== 'boolean') {
        return { success: false, error: 'Invalid parameters.' };
      }

      if (id === currentSession.user.id && !isActive) {
        return { success: false, error: 'You cannot deactivate your own administrative account.' };
      }

      const updated = ctx.userRepo.toggleUserStatus(id, isActive);

      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entityType: 'USER',
        entityId: String(id),
        details: { targetUserId: id, username: updated.username, isActive },
      });

      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to toggle user status.' };
    }
  });

  // --- ASSETS & PURCHASES HANDLERS ---
  ipcMain.handle(IPC_CHANNELS.ASSETS_LIST, async (_, query: any): Promise<IpcResponse<LabAsset[]>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const assets = ctx.assetRepo.listAssets(query || {});
      return { success: true, data: assets };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to list assets and purchases.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ASSETS_GET_BY_ID, async (_, id: unknown): Promise<IpcResponse<LabAsset | null>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'number' || isNaN(id)) return { success: false, error: 'Invalid asset ID.' };
      const asset = ctx.assetRepo.getAssetById(id);
      return { success: true, data: asset };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to get asset details.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ASSETS_CREATE, async (_, rawInput: unknown): Promise<IpcResponse<LabAsset>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = CreateAssetSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid asset data.' };
      }
      const created = ctx.assetRepo.createAsset(parsed.data, currentSession.user.id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'ASSET_PURCHASE_CREATED',
        entityType: 'ASSET',
        entityId: String(created.id),
        details: { title: created.title, amount_paisa: created.amount_paisa, purchase_date: created.purchase_date },
      });
      return { success: true, data: created };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to record asset/purchase.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ASSETS_UPDATE, async (_, rawInput: unknown): Promise<IpcResponse<LabAsset>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = UpdateAssetSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid asset update data.' };
      }
      const updated = ctx.assetRepo.updateAsset(parsed.data, currentSession.user.id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'ASSET_PURCHASE_UPDATED',
        entityType: 'ASSET',
        entityId: String(updated.id),
        details: { title: updated.title, amount_paisa: updated.amount_paisa, reason: parsed.data.editReason },
      });
      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update asset/purchase.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ASSETS_DELETE, async (_): Promise<IpcResponse<boolean>> => {
    // Assets cannot be removed once submitted for financial and percentage audit integrity
    return {
      success: false,
      error: 'Asset and purchase entries cannot be removed once recorded to maintain transparent ledger and audit integrity.',
    };
  });

  ipcMain.handle(IPC_CHANNELS.ASSETS_GET_SUMMARY, async (_, query: any): Promise<IpcResponse<{ totalCount: number; totalAmountPaisa: number }>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const summary = ctx.assetRepo.getSummary(query || {});
      return { success: true, data: summary };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to calculate assets summary.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ASSETS_EXPORT_PDF, async (_, query: any): Promise<IpcResponse<{ success: boolean; filePath?: string }>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const assets = ctx.assetRepo.listAssets(query || {});
      const summary = ctx.assetRepo.getSummary(query || {});
      const hospital = ctx.hospitalRepo.getSettings() || currentSession.hospital;
      const dateText = query?.startDate && query?.endDate
        ? `${query.startDate} to ${query.endDate}`
        : query?.startDate
        ? `From ${query.startDate}`
        : query?.endDate
        ? `Up to ${query.endDate}`
        : 'All-time Lifetime';

      const mainWindow = ctx.getMainWindow ? ctx.getMainWindow() : null;
      const res = await PdfService.exportAssetsReportPdf(assets, hospital, dateText, summary, mainWindow);
      return { success: res.success, data: { success: res.success, filePath: res.filePath }, error: res.error };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to export assets PDF report.' };
    }
  });

  // --- OWNER PROFIT & MY PERCENTAGE HANDLERS ---
  ipcMain.handle(IPC_CHANNELS.FINANCE_GET_MY_PERCENTAGE_SUMMARY, async (_, query: any): Promise<IpcResponse<MyPercentageSummary>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const summary = ctx.financeRepo.getMyPercentageSummary(query || {});
      return { success: true, data: summary };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to calculate profit & percentage summary.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCE_RECORD_PAYOUT, async (_, rawInput: unknown): Promise<IpcResponse<OwnerPayout>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = RecordPayoutSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid payout entry.' };
      }
      const recorded = ctx.financeRepo.recordPayout(parsed.data, currentSession.user.id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'OWNER_PAYOUT_RECORDED',
        entityType: 'FINANCE',
        entityId: String(recorded.id),
        details: { amount_paisa: recorded.amount_paisa, payout_date: recorded.payout_date, notes: recorded.notes },
      });
      return { success: true, data: recorded };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to record payout/received amount.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCE_DELETE_PAYOUT, async (_, id: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof id !== 'number' || isNaN(id)) return { success: false, error: 'Invalid payout ID.' };
      const deleted = ctx.financeRepo.deletePayout(id);
      if (deleted) {
        ctx.auditRepo.logAction({
          userId: currentSession.user.id,
          action: 'OWNER_PAYOUT_DELETED',
          entityType: 'FINANCE',
          entityId: String(id),
        });
      }
      return { success: true, data: deleted };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to remove payout record.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCE_UPDATE_OWNER_PERCENTAGE, async (_, percentage: unknown): Promise<IpcResponse<number>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      if (typeof percentage !== 'number' || isNaN(percentage)) {
        return { success: false, error: 'Invalid percentage value.' };
      }
      const updated = ctx.financeRepo.updateOwnerPercentage(percentage);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'OWNER_PERCENTAGE_UPDATED',
        entityType: 'FINANCE',
        entityId: '1',
        details: { percentage: updated },
      });
      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update owner percentage.' };
    }
  });

  // ==========================================
  // Partnership & Settlement Handlers
  // ==========================================

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_GET_DASHBOARD, async (_, query: unknown): Promise<IpcResponse<PartnershipDashboardData>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const q = (query && typeof query === 'object' ? query : {}) as { startDate?: string; endDate?: string };
      const dashboard = ctx.financeRepo.getPartnershipDashboard(q);
      return { success: true, data: dashboard };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to load partnership dashboard.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_RECORD_COLLECTION, async (_, input: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = RecordLabCollectionSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid collection input.' };
      }
      const recorded = ctx.financeRepo.recordLabCollection(parsed.data, currentSession.user.id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'PARTNERSHIP_COLLECTION_RECORDED',
        entityType: 'FINANCE',
        entityId: String(recorded.id),
        details: { amount: recorded.amountPaisa, collectedBy: recorded.collectedBy, type: recorded.entry_type },
      });
      return { success: true, data: recorded };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to record collection.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_RECORD_EXPENSE, async (_, input: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = RecordPartnershipExpenseSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid expense input.' };
      }
      const recorded = ctx.financeRepo.recordPartnershipExpense(parsed.data, currentSession.user.id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'PARTNERSHIP_EXPENSE_RECORDED',
        entityType: 'FINANCE',
        entityId: String(recorded.id),
        details: { amount: recorded.amountPaisa, category: recorded.category, paidBy: recorded.paidBy },
      });
      return { success: true, data: recorded };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to record expense.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_REVERSE_EXPENSE, async (_, input: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = z.object({
        expenseId: z.number().int().positive(),
        reason: z.string().trim().min(3, 'Reversal reason must be at least 3 characters'),
      }).safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid expense reversal request.' };
      }
      const ok = ctx.financeRepo.reversePartnershipExpense(parsed.data, currentSession.user.id);
      if (ok) {
        ctx.auditRepo.logAction({
          userId: currentSession.user.id,
          action: 'PARTNERSHIP_EXPENSE_REVERSED',
          entityType: 'FINANCE',
          entityId: String(parsed.data.expenseId),
          details: { reason: parsed.data.reason },
        });
      }
      return { success: true, data: ok };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to reverse expense.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_RECORD_PAYMENT, async (_, input: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = RecordPartnerPaymentSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid partner payment input.' };
      }
      const recorded = ctx.financeRepo.recordPartnerPayment(parsed.data, currentSession.user.id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'PARTNERSHIP_PAYMENT_RECORDED',
        entityType: 'FINANCE',
        entityId: String(recorded.id),
        details: { amount: recorded.amountPaisa, partner: recorded.partner, type: recorded.type },
      });
      return { success: true, data: recorded };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to record partner payment.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_REVERSE_TRANSACTION, async (_, input: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = ReversePartnershipTransactionSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid reversal request.' };
      }
      const ok = ctx.financeRepo.reversePartnershipTransaction(parsed.data, currentSession.user.id);
      if (ok) {
        ctx.auditRepo.logAction({
          userId: currentSession.user.id,
          action: 'PARTNERSHIP_TRANSACTION_REVERSED',
          entityType: 'FINANCE',
          entityId: String(parsed.data.transactionId),
          details: { reason: parsed.data.reason },
        });
      }
      return { success: true, data: ok };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to reverse transaction.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_CLOSE_MONTH, async (_, input: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = ClosePartnershipMonthSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid month.' };
      }
      const result = ctx.financeRepo.closePartnershipMonth(parsed.data, currentSession.user.id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'PARTNERSHIP_MONTH_CLOSED',
        entityType: 'FINANCE',
        entityId: parsed.data.month,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to close month.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_RECORD_DOCTOR_COMMISSION_PAYMENT, async (_, input: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = RecordDoctorCommissionPaymentSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid commission payment input.' };
      }
      const recorded = ctx.financeRepo.recordDoctorCommissionPayment(parsed.data, currentSession.user.id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'DOCTOR_COMMISSION_PAYMENT_RECORDED',
        entityType: 'DOCTOR',
        entityId: String(parsed.data.doctorId),
        details: { amount: parsed.data.amountPaisa },
      });
      return { success: true, data: recorded };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to record doctor commission payment.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_RECORD_INVESTOR_CAPITAL, async (_, input: unknown): Promise<IpcResponse<any>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = RecordInvestorCapitalSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid capital transaction input.' };
      }
      const recorded = ctx.financeRepo.recordInvestorCapital(parsed.data, currentSession.user.id);
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'INVESTOR_CAPITAL_RECORDED',
        entityType: 'FINANCE',
        entityId: String(recorded.id),
        details: { amount: parsed.data.amountPaisa, type: parsed.data.type },
      });
      return { success: true, data: recorded };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to record capital transaction.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_EXPORT_STATEMENT, async (_, query: unknown): Promise<IpcResponse<{ success: boolean; filePath?: string; cancelled?: boolean }>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const q = (query && typeof query === 'object' ? query : {}) as { startDate?: string; endDate?: string };
      const dashboard = ctx.financeRepo.getPartnershipDashboard(q);
      const hospital = ctx.hospitalRepo.getSettings() || currentSession.hospital;

      let dateRangeText = 'Lifetime Total';
      if (q.startDate && q.endDate) {
        dateRangeText = `${q.startDate} to ${q.endDate}`;
      } else if (q.startDate) {
        dateRangeText = `From ${q.startDate}`;
      } else if (q.endDate) {
        dateRangeText = `Until ${q.endDate}`;
      }

      const mainWindow = ctx.getMainWindow ? ctx.getMainWindow() : null;
      const res = await PdfService.exportPartnershipStatementPdf(dashboard, hospital, dateRangeText, mainWindow);
      if (res.cancelled) {
        return { success: true, data: { success: false, cancelled: true } };
      }
      return { success: res.success, data: res, error: res.error };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to export statement.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_UPDATE_SPLIT, async (_, input: unknown): Promise<IpcResponse<number>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const parsed = UpdatePartnershipSplitSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues?.[0]?.message || 'Invalid split input.' };
      }
      const updated = ctx.financeRepo.updatePartnershipSplit(
        parsed.data.technicianPercentage,
        parsed.data.investorPercentage,
        currentSession.user.id,
        parsed.data.effectiveFrom,
        parsed.data.reason
      );
      ctx.auditRepo.logAction({
        userId: currentSession.user.id,
        action: 'PARTNERSHIP_SPLIT_UPDATED',
        entityType: 'FINANCE',
        entityId: '1',
        details: { technicianPercentage: updated, investorPercentage: parsed.data.investorPercentage },
      });
      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update partnership split.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_UPDATE_TRANSACTION, async (_, input: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const raw = input as any;
      if (!raw || !raw.id || !raw.paymentDate || !raw.amountPaisa) {
        return { success: false, error: 'Valid transaction id, date, and amount are required.' };
      }
      const ok = ctx.financeRepo.updatePartnerTransaction(raw, currentSession.user.id);
      if (ok) {
        ctx.auditRepo.logAction({
          userId: currentSession.user.id,
          action: 'PARTNER_TRANSACTION_UPDATED',
          entityType: 'FINANCE',
          entityId: String(raw.id),
          details: {
            reason: raw.editReason || 'Modified transaction',
            amountPaisa: raw.amountPaisa,
            paymentDate: raw.paymentDate,
          },
        });
      }
      return { success: ok, data: ok };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update transaction.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_DELETE_TRANSACTION, async (_, id: unknown): Promise<IpcResponse<boolean>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const txId = Number(id);
      if (!txId) return { success: false, error: 'Invalid transaction ID.' };
      const ok = ctx.financeRepo.deletePartnerTransaction(txId);
      return { success: ok, data: ok };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete transaction.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARTNERSHIP_CLEAR_PAYOUTS, async (): Promise<IpcResponse<{ deletedCount: number }>> => {
    try {
      if (!currentSession) return { success: false, error: 'Unauthorized.' };
      const res = ctx.financeRepo.clearTechnicianPayouts();
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to clear technician payouts.' };
    }
  });

  // 29. App Info
  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, async (): Promise<IpcResponse<AppInfo>> => {
    return {
      success: true,
      data: {
        version: app.getVersion() || '1.0.0',
        isPackaged: ctx.isPackaged,
        isOffline: true,
        databaseEncrypted: true,
        schemaVersion: ctx.migrationRunner.getCurrentVersion(),
        environment: process.env.NODE_ENV || 'production',
      },
    };
  });

  // 30. Integrity Check
  ipcMain.handle(IPC_CHANNELS.APP_CHECK_INTEGRITY, async (): Promise<IpcResponse<any>> => {
    try {
      const integrity = ctx.dbManager.checkIntegrity();
      return { success: true, data: integrity };
    } catch {
      return { success: false, error: 'Database integrity check encountered an error.' };
    }
  });

  // 31. App Quit
  ipcMain.handle(IPC_CHANNELS.APP_QUIT, async (): Promise<void> => {
    app.quit();
  });
}
