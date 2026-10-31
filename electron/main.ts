import { app, BrowserWindow, dialog, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { DatabaseManager } from './database/connection';
import { MigrationRunner } from './database/migrations';
import { KeyManager } from './security/dpapi-key';
import { UserRepository } from './database/repositories/user-repository';
import { HospitalRepository } from './database/repositories/hospital-repository';
import { AuditRepository } from './database/repositories/audit-repository';
import { PatientRepository } from './database/repositories/patient-repository';
import { DoctorRepository } from './database/repositories/doctor-repository';
import { CatalogRepository } from './database/repositories/catalog-repository';
import { VisitRepository } from './database/repositories/visit-repository';
import { DoctorStatsRepository } from './database/repositories/doctor-stats-repository';
import { ResultRepository } from './database/repositories/result-repository';
import { PatientHistoryRepository } from './database/repositories/patient-history-repository';
import { TemplateRepository } from './database/repositories/template-repository';
import { AssetRepository } from './database/repositories/asset-repository';
import { FinanceRepository } from './database/repositories/finance-repository';
import { DoctorCommissionRepository } from './database/repositories/doctor-commission-repository';
import { LogoService } from './security/logo-service';
import { wipeDatabaseAndSeedStandardCatalog } from './database/standard-catalog-seeder';
import { BackupService } from './services/backup-service';
import { RestoreService } from './services/restore-service';
import { registerIpcHandlers } from './ipc/handlers';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let dbManager: DatabaseManager | null = null;

// Determine whether running in development
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function setupSecurityHeaders(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self' 'unsafe-inline' http://localhost:5174 ws://localhost:5174 data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5174; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
        ],
      },
    });
  });
}

function initializeDatabase(): {
  dbManager: DatabaseManager;
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
  templateRepo: TemplateRepository;
  assetRepo: AssetRepository;
  financeRepo: FinanceRepository;
  doctorCommissionRepo: DoctorCommissionRepository;
  logoService: LogoService;
  backupService: BackupService;
  restoreService: RestoreService;
  migrationRunner: MigrationRunner;
  keyManager: KeyManager;
} {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'lms_secure.db');

  // Key management with Windows DPAPI
  const keyManager = new KeyManager(userDataPath);
  const encryptionKey = keyManager.getOrCreateDatabaseKey();

  const manager = new DatabaseManager({
    dbPath,
    encryptionKey,
    verbose: isDev,
  });

  manager.open();

  // Run migrations across development and packaged environments
  const candidateDirs = [
    path.join(app.getAppPath(), 'database/migrations'),
    path.resolve(__dirname, '../database/migrations'),
    path.resolve(process.resourcesPath, 'database/migrations'),
  ];
  const migrationsDir = candidateDirs.find((d) => fs.existsSync(d)) || candidateDirs[0];

  const migrationRunner = new MigrationRunner(manager, migrationsDir);
  migrationRunner.runPendingMigrations();

  // One-time fresh software initialization: wipe all demo data, user, and load standard catalog
  const cleanSlateMarker = path.join(userDataPath, '.fresh_v1_marker');
  if (!fs.existsSync(cleanSlateMarker)) {
    try {
      const rawDb = manager.getDatabase();
      wipeDatabaseAndSeedStandardCatalog(rawDb);
      fs.writeFileSync(cleanSlateMarker, 'fresh_initialized');
    } catch (err) {
      console.error('[LMS] Clean slate initialization error:', err);
    }
  }

  // Clear existing technician payouts as requested
  const clearTechnicianPayoutsMarker = path.join(userDataPath, '.clear_technician_payouts_v1_marker');
  if (!fs.existsSync(clearTechnicianPayoutsMarker)) {
    try {
      const rawDb = manager.getDatabase();
      rawDb.prepare("DELETE FROM partner_transactions WHERE partner = 'technician'").run();
      rawDb.prepare("DELETE FROM owner_payouts").run();
      fs.writeFileSync(clearTechnicianPayoutsMarker, 'cleared');
    } catch (err) {
      console.error('[LMS] Clear technician payouts initialization error:', err);
    }
  }

  const userRepo = new UserRepository(manager);
  const hospitalRepo = new HospitalRepository(manager);
  const auditRepo = new AuditRepository(manager);
  const patientRepo = new PatientRepository(manager);
  const doctorRepo = new DoctorRepository(manager);
  const catalogRepo = new CatalogRepository(manager);
  const visitRepo = new VisitRepository(manager);
  const doctorStatsRepo = new DoctorStatsRepository(manager);
  const resultRepo = new ResultRepository(manager);
  const patientHistoryRepo = new PatientHistoryRepository(manager);
  const templateRepo = new TemplateRepository(manager);
  const assetRepo = new AssetRepository(manager);
  const financeRepo = new FinanceRepository(manager);
  const doctorCommissionRepo = new DoctorCommissionRepository(manager);
  const logoService = new LogoService(userDataPath);

  const backupsDir = path.join(userDataPath, 'backups');
  const preRestoreSnapshotsDir = path.join(userDataPath, 'pre-restore-snapshots');
  const backupService = new BackupService(manager, backupsDir);
  const restoreService = new RestoreService(manager, backupService, preRestoreSnapshotsDir, migrationRunner);

  return {
    dbManager: manager,
    userRepo,
    hospitalRepo,
    auditRepo,
    patientRepo,
    doctorRepo,
    catalogRepo,
    visitRepo,
    doctorStatsRepo,
    resultRepo,
    patientHistoryRepo,
    templateRepo,
    assetRepo,
    financeRepo,
    doctorCommissionRepo,
    logoService,
    backupService,
    restoreService,
    migrationRunner,
    keyManager,
  };
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'Offline Laboratory Management System',
    backgroundColor: '#f8fafc',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Safe navigation controls
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDevUrl = url.startsWith('http://localhost:5174');
    const isFileUrl = url.startsWith('file://');
    if (!isDevUrl && !isFileUrl) {
      event.preventDefault();
    }
  });

  // Renderer crash handling
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.error('Renderer process gone:', details);
    dialog.showErrorBox(
      'Application Error',
      `The user interface experienced an unexpected issue (${details.reason}). Please restart the application.`
    );
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.maximize();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// App Lifecycle
app.whenReady().then(() => {
  try {
    setupSecurityHeaders();
    const ctx = initializeDatabase();
    dbManager = ctx.dbManager;

    registerIpcHandlers({
      ...ctx,
      isPackaged: app.isPackaged,
      getMainWindow: () => mainWindow,
    });

    createMainWindow();
  } catch (err: any) {
    console.error('Failed to initialize application:', err);
    dialog.showErrorBox(
      'Laboratory System Startup Failure',
      `Could not initialize the secure local database:\n\n${err.message}\n\n` +
      `The application will close safely. Your database has NOT been modified.`
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Clean shutdown
app.on('before-quit', () => {
  if (dbManager) {
    try {
      dbManager.close();
    } catch (err) {
      console.error('Error closing database during quit:', err);
    }
    dbManager = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
