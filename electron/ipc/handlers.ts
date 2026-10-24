import { ipcMain, app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from './channels';
import {
  InitialSetupSchema,
  LoginSchema,
  UnlockSchema,
  RestoreKeySchema,
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
  RecordPaymentSchema,
  DoctorStatsQuerySchema,
  SaveDraftResultsSchema,
  FinalizeReportSchema,
  AmendResultSchema,
  ExportPdfSchema,
  CreateBackupSchema,
  InspectBackupSchema,
  ExecuteRestoreSchema,
  IpcResponse,
  SessionInfo,
  AppInfo,
  VisitDetail,
  VisitSearchResult,
  Payment,
  Invoice,
  DoctorReferralStats,
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
import { PdfService } from '../services/pdf-service';
import { BackupService } from '../services/backup-service';
import { RestoreService } from '../services/restore-service';
import { MigrationRunner } from '../database/migrations';
import { LogoService } from '../security/logo-service';
import { KeyManager } from '../security/dpapi-key';
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
      if (report && report.hospital) {
        report.hospital = attachLogoUrl(report.hospital, ctx.logoService) || report.hospital;
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

      const result = await PdfService.exportReportPdf(mainWindow, parsed.data.defaultFileName || `Lab_Report_Visit_${parsed.data.visitId}.pdf`);
      return { success: result.success, data: result };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to export PDF.' };
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

      // Check Dynamic Hourly Authorization Key
      const keyValidation = validateDynamicHourlyKey(parsed.data.dynamicKey);
      if (!keyValidation.valid) {
        return { success: false, error: keyValidation.error || 'Invalid or Expired Dynamic Authorization Key.' };
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
      const isCorrect = password === 'aaaaaaaa';
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
          minutesRemaining,
          currentHourStr: `${hour12} ${ampm}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to generate dynamic authorization key.' };
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
