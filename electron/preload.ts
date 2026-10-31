import { contextBridge, ipcRenderer } from 'electron';
import type {
  ElectronAPI,
  InitialSetupInput,
  LoginInput,
  UnlockInput,
  RestoreKeyInput,
  RestoreFromBackupInput,
  UpdateHospitalSettingsInput,
  CreatePatientInput,
  UpdatePatientInput,
  CreateDoctorInput,
  UpdateDoctorInput,
  CreateTestInput,
  UpdateTestInput,
  UpdateVisitOrderAndInvoiceInput,
} from './types/ipc';

// Inlined channel names to guarantee zero relative module resolution failures in preload
const CHANNELS = {
  // Auth
  AUTH_CHECK_SETUP: 'auth:check-setup',
  AUTH_SETUP: 'auth:setup',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_SESSION: 'auth:get-session',
  AUTH_UNLOCK: 'auth:unlock',
  AUTH_GET_RECOVERY_KEY: 'auth:get-recovery-key',
  AUTH_RESTORE_KEY: 'auth:restore-key',
  AUTH_RESTORE_FROM_BACKUP: 'auth:restore-from-backup',
  AUTH_VERIFY_RESET_KEY: 'auth:verify-reset-key',
  AUTH_RESET_PASSWORD_WITH_KEY: 'auth:reset-password-with-key',

  // Users
  USERS_LIST: 'users:list',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_UPDATE_PASSWORD: 'users:update-password',
  USERS_TOGGLE_ACTIVE: 'users:toggle-active',

  // Settings
  SETTINGS_GET_HOSPITAL: 'settings:get-hospital',
  SETTINGS_UPDATE_HOSPITAL: 'settings:update-hospital',
  SETTINGS_UPLOAD_LOGO: 'settings:upload-logo',
  SETTINGS_GET_LOGO_URL: 'settings:get-logo-url',

  // Patients
  PATIENTS_SEARCH: 'patients:search',
  PATIENTS_GET_BY_ID: 'patients:get-by-id',
  PATIENTS_CREATE: 'patients:create',
  PATIENTS_UPDATE: 'patients:update',
  PATIENTS_CHECK_DUPLICATES: 'patients:check-duplicates',

  // Doctors
  DOCTORS_LIST: 'doctors:list',
  DOCTORS_GET_BY_ID: 'doctors:get-by-id',
  DOCTORS_CREATE: 'doctors:create',
  DOCTORS_UPDATE: 'doctors:update',
  DOCTORS_SET_ACTIVE: 'doctors:set-active',
  DOCTORS_CHECK_DUPLICATES: 'doctors:check-duplicates',

  // Tests & Catalog
  TESTS_LIST: 'tests:list',
  TESTS_GET_BY_ID: 'tests:get-by-id',
  TESTS_CREATE: 'tests:create',
  TESTS_UPDATE: 'tests:update',
  TESTS_SET_ACTIVE: 'tests:set-active',
  TESTS_GET_CATEGORIES: 'tests:get-categories',

  // Visits & Orders
  VISITS_CREATE: 'visits:create',
  VISITS_UPDATE_ORDER_INVOICE: 'visits:update-order-invoice',
  VISITS_GET_BY_ID: 'visits:get-by-id',
  VISITS_SEARCH: 'visits:search',
  VISITS_GET_PATIENT_HISTORY: 'visits:get-patient-history',

  // Billing & Payments
  BILLING_RECORD_PAYMENT: 'billing:record-payment',
  BILLING_GET_INVOICE: 'billing:get-invoice',

  // Results & Verification
  RESULTS_GET_WORKLIST: 'results:get-worklist',
  RESULTS_GET_FOR_ORDER_ITEM: 'results:get-for-order-item',
  RESULTS_SAVE_DRAFT: 'results:save-draft',
  RESULTS_MARK_REVIEWED: 'results:mark-reviewed',
  RESULTS_FINALIZE_REPORT: 'results:finalize-report',
  RESULTS_AMEND: 'results:amend',

  // Reports & Printing
  REPORTS_GET_DIAGNOSTIC_REPORT: 'reports:get-diagnostic-report',
  REPORTS_EXPORT_PDF: 'reports:export-pdf',
  REPORTS_PRINT: 'reports:print',
  REPORTS_DOCTOR_STATS: 'reports:doctor-stats',

  // Patient Comprehensive History
  PATIENTS_GET_FULL_HISTORY: 'patients:get-full-history',

  // Backup & Restore
  BACKUP_SELECT_DESTINATION: 'backup:select-destination',
  BACKUP_SET_DEFAULT_PATH: 'backup:set-default-path',
  BACKUP_CREATE: 'backup:create',
  BACKUP_PURGE_OLDER: 'backup:purge-older',
  BACKUP_LIST_LOCAL: 'backup:list-local',
  RESTORE_SELECT_FILE: 'restore:select-file',
  RESTORE_INSPECT_FILE: 'restore:inspect-file',
  RESTORE_EXECUTE: 'restore:execute',

  // Developer Portal
  DEV_VALIDATE_PASSWORD: 'dev:validate-password',
  DEV_GET_CURRENT_DYNAMIC_KEY: 'dev:get-current-dynamic-key',
  DEV_DETECT_LEGACY_BACKUP: 'dev:detect-legacy-backup',
  DEV_IMPORT_LEGACY_TESTS: 'dev:import-legacy-tests',
  DEV_SELECT_LEGACY_FILE: 'dev:select-legacy-file',
  DEV_DETECT_SAVED_TEMPLATE: 'dev:detect-saved-template',
  DEV_SEED_SAVED_TEMPLATE: 'dev:seed-saved-template',
  DEV_SELECT_TEMPLATE_FILE: 'dev:select-template-file',
  DEV_CLEAR_ALL_TESTS: 'dev:clear-all-tests',
  DEV_WIPE_ALL_DATA: 'dev:wipe-all-data',
  DEV_RESET_USER_PASSWORD: 'dev:reset-user-password',

  // Audit
  AUDIT_GET_RECENT: 'audit:get-recent',
  AUDIT_QUERY: 'audit:query',

  // Assets & Purchases
  ASSETS_LIST: 'assets:list',
  ASSETS_GET_BY_ID: 'assets:get-by-id',
  ASSETS_CREATE: 'assets:create',
  ASSETS_UPDATE: 'assets:update',
  ASSETS_DELETE: 'assets:delete',
  ASSETS_GET_SUMMARY: 'assets:get-summary',
  ASSETS_EXPORT_PDF: 'assets:export-pdf',

  // Owner Financials & My Percentage
  FINANCE_GET_MY_PERCENTAGE_SUMMARY: 'finance:get-my-percentage-summary',
  FINANCE_RECORD_PAYOUT: 'finance:record-payout',
  FINANCE_DELETE_PAYOUT: 'finance:delete-payout',
  FINANCE_UPDATE_OWNER_PERCENTAGE: 'finance:update-owner-percentage',

  // Partnership & Settlement Dashboard
  PARTNERSHIP_GET_DASHBOARD: 'partnership:get-dashboard',
  PARTNERSHIP_RECORD_COLLECTION: 'partnership:record-collection',
  PARTNERSHIP_RECORD_EXPENSE: 'partnership:record-expense',
  PARTNERSHIP_REVERSE_EXPENSE: 'partnership:reverse-expense',
  PARTNERSHIP_RECORD_PAYMENT: 'partnership:record-payment',
  PARTNERSHIP_REVERSE_TRANSACTION: 'partnership:reverse-transaction',
  PARTNERSHIP_CLOSE_MONTH: 'partnership:close-month',
  PARTNERSHIP_RECORD_DOCTOR_COMMISSION_PAYMENT: 'partnership:record-doctor-commission-payment',
  PARTNERSHIP_RECORD_INVESTOR_CAPITAL: 'partnership:record-investor-capital',
  PARTNERSHIP_EXPORT_STATEMENT: 'partnership:export-statement',
  PARTNERSHIP_UPDATE_SPLIT: 'partnership:update-split',
  PARTNERSHIP_UPDATE_TRANSACTION: 'partnership:update-transaction',
  PARTNERSHIP_DELETE_TRANSACTION: 'partnership:delete-transaction',
  PARTNERSHIP_CLEAR_PAYOUTS: 'partnership:clear-payouts',

  // Report Templates Designer
  TEMPLATES_LIST: 'templates:list',
  TEMPLATES_GET_ACTIVE: 'templates:get-active',
  TEMPLATES_SAVE: 'templates:save',
  TEMPLATES_ACTIVATE: 'templates:activate',
  TEMPLATES_DELETE: 'templates:delete',
  TEMPLATES_PRINT_TEST: 'templates:print-test',
  TEMPLATES_EXPORT_PDF_TEST: 'templates:export-pdf-test',

  // Doctor Commission & Settlements
  DOCTOR_COMMISSION_GET_OVERVIEW: 'doctor-commission:get-overview',
  DOCTOR_COMMISSION_GET_SUMMARY: 'doctor-commission:get-summary',
  DOCTOR_COMMISSION_GET_VISITS: 'doctor-commission:get-visits',
  DOCTOR_PAYOUTS_LIST: 'doctor-commission:list-payouts',
  DOCTOR_PAYOUTS_RECORD: 'doctor-commission:record-payout',
  DOCTOR_PAYOUTS_UPDATE: 'doctor-commission:update-payout',
  DOCTOR_COMMISSION_EXPORT_PDF: 'doctor-commission:export-pdf',
  DOCTOR_COMMISSION_PRINT: 'doctor-commission:print',

  // System & App
  APP_GET_INFO: 'app:get-info',
  APP_CHECK_INTEGRITY: 'app:check-integrity',
  APP_QUIT: 'app:quit',
} as const;

const api: ElectronAPI = {
  auth: {
    checkSetup: () => ipcRenderer.invoke(CHANNELS.AUTH_CHECK_SETUP),
    setup: (input: InitialSetupInput) => ipcRenderer.invoke(CHANNELS.AUTH_SETUP, input),
    login: (input: LoginInput) => ipcRenderer.invoke(CHANNELS.AUTH_LOGIN, input),
    logout: () => ipcRenderer.invoke(CHANNELS.AUTH_LOGOUT),
    getSession: () => ipcRenderer.invoke(CHANNELS.AUTH_GET_SESSION),
    unlock: (input: UnlockInput) => ipcRenderer.invoke(CHANNELS.AUTH_UNLOCK, input),
    getRecoveryKey: () => ipcRenderer.invoke(CHANNELS.AUTH_GET_RECOVERY_KEY),
    restoreWithKey: (input: RestoreKeyInput) => ipcRenderer.invoke(CHANNELS.AUTH_RESTORE_KEY, input),
    restoreFromBackup: (input: RestoreFromBackupInput) => ipcRenderer.invoke(CHANNELS.AUTH_RESTORE_FROM_BACKUP, input),
    verifyResetKey: (input: { key: string }) => ipcRenderer.invoke(CHANNELS.AUTH_VERIFY_RESET_KEY, input),
    resetPasswordWithKey: (input: { key: string; userId: number; newPassword: string }) =>
      ipcRenderer.invoke(CHANNELS.AUTH_RESET_PASSWORD_WITH_KEY, input),
  },
  users: {
    list: () => ipcRenderer.invoke(CHANNELS.USERS_LIST),
    create: (input: any) => ipcRenderer.invoke(CHANNELS.USERS_CREATE, input),
    update: (input: any) => ipcRenderer.invoke(CHANNELS.USERS_UPDATE, input),
    updatePassword: (input: any) => ipcRenderer.invoke(CHANNELS.USERS_UPDATE_PASSWORD, input),
    toggleActive: (id: number, isActive: boolean) => ipcRenderer.invoke(CHANNELS.USERS_TOGGLE_ACTIVE, { id, isActive }),
  },
  settings: {
    getHospital: () => ipcRenderer.invoke(CHANNELS.SETTINGS_GET_HOSPITAL),
    updateHospital: (input: UpdateHospitalSettingsInput) => ipcRenderer.invoke(CHANNELS.SETTINGS_UPDATE_HOSPITAL, input),
    uploadLogo: (base64Image: string) => ipcRenderer.invoke(CHANNELS.SETTINGS_UPLOAD_LOGO, base64Image),
    getLogoUrl: () => ipcRenderer.invoke(CHANNELS.SETTINGS_GET_LOGO_URL),
  },
  patients: {
    search: (params) => ipcRenderer.invoke(CHANNELS.PATIENTS_SEARCH, params),
    getById: (id: number) => ipcRenderer.invoke(CHANNELS.PATIENTS_GET_BY_ID, id),
    create: (input: CreatePatientInput) => ipcRenderer.invoke(CHANNELS.PATIENTS_CREATE, input),
    update: (input: UpdatePatientInput) => ipcRenderer.invoke(CHANNELS.PATIENTS_UPDATE, input),
    checkDuplicates: (fullName: string, phoneNumber?: string | null, excludeId?: number) =>
      ipcRenderer.invoke(CHANNELS.PATIENTS_CHECK_DUPLICATES, { fullName, phoneNumber, excludeId }),
  },
  doctors: {
    list: (params) => ipcRenderer.invoke(CHANNELS.DOCTORS_LIST, params),
    getById: (id: number) => ipcRenderer.invoke(CHANNELS.DOCTORS_GET_BY_ID, id),
    create: (input: CreateDoctorInput) => ipcRenderer.invoke(CHANNELS.DOCTORS_CREATE, input),
    update: (input: UpdateDoctorInput) => ipcRenderer.invoke(CHANNELS.DOCTORS_UPDATE, input),
    setActiveStatus: (id: number, isActive: boolean) => ipcRenderer.invoke(CHANNELS.DOCTORS_SET_ACTIVE, { id, isActive }),
    checkDuplicates: (fullName: string, excludeId?: number) => ipcRenderer.invoke(CHANNELS.DOCTORS_CHECK_DUPLICATES, { fullName, excludeId }),
  },
  tests: {
    list: (params) => ipcRenderer.invoke(CHANNELS.TESTS_LIST, params),
    getById: (id: number) => ipcRenderer.invoke(CHANNELS.TESTS_GET_BY_ID, id),
    create: (input: CreateTestInput) => ipcRenderer.invoke(CHANNELS.TESTS_CREATE, input),
    update: (input: UpdateTestInput) => ipcRenderer.invoke(CHANNELS.TESTS_UPDATE, input),
    setActiveStatus: (id: number, isActive: boolean) => ipcRenderer.invoke(CHANNELS.TESTS_SET_ACTIVE, { id, isActive }),
    getCategories: () => ipcRenderer.invoke(CHANNELS.TESTS_GET_CATEGORIES),
  },
  visits: {
    create: (input) => ipcRenderer.invoke(CHANNELS.VISITS_CREATE, input),
    updateOrderAndInvoice: (input) => ipcRenderer.invoke(CHANNELS.VISITS_UPDATE_ORDER_INVOICE, input),
    getById: (id: number) => ipcRenderer.invoke(CHANNELS.VISITS_GET_BY_ID, id),
    search: (params) => ipcRenderer.invoke(CHANNELS.VISITS_SEARCH, params),
    getPatientHistory: (patientId: number) => ipcRenderer.invoke(CHANNELS.VISITS_GET_PATIENT_HISTORY, patientId),
  },
  billing: {
    recordPayment: (input) => ipcRenderer.invoke(CHANNELS.BILLING_RECORD_PAYMENT, input),
    getInvoice: (id: number) => ipcRenderer.invoke(CHANNELS.BILLING_GET_INVOICE, id),
  },
  results: {
    getWorklist: (params) => ipcRenderer.invoke(CHANNELS.RESULTS_GET_WORKLIST, params),
    getForOrderItem: (orderItemId: number) => ipcRenderer.invoke(CHANNELS.RESULTS_GET_FOR_ORDER_ITEM, orderItemId),
    saveDraft: (input) => ipcRenderer.invoke(CHANNELS.RESULTS_SAVE_DRAFT, input),
    markReviewed: (orderItemId: number) => ipcRenderer.invoke(CHANNELS.RESULTS_MARK_REVIEWED, orderItemId),
    finalizeReport: (input) => ipcRenderer.invoke(CHANNELS.RESULTS_FINALIZE_REPORT, input),
    amendResult: (input) => ipcRenderer.invoke(CHANNELS.RESULTS_AMEND, input),
  },
  reports: {
    getDiagnosticReport: (visitId: number) => ipcRenderer.invoke(CHANNELS.REPORTS_GET_DIAGNOSTIC_REPORT, visitId),
    exportPdf: (input) => ipcRenderer.invoke(CHANNELS.REPORTS_EXPORT_PDF, input),
    print: (visitId: number) => ipcRenderer.invoke(CHANNELS.REPORTS_PRINT, { visitId }),
    getDoctorStats: (query) => ipcRenderer.invoke(CHANNELS.REPORTS_DOCTOR_STATS, query),
  },
  patientHistory: {
    getFullHistory: (patientId: number) => ipcRenderer.invoke(CHANNELS.PATIENTS_GET_FULL_HISTORY, patientId),
  },
  backup: {
    selectDestination: () => ipcRenderer.invoke(CHANNELS.BACKUP_SELECT_DESTINATION),
    setDefaultPath: (destinationPath: string) => ipcRenderer.invoke(CHANNELS.BACKUP_SET_DEFAULT_PATH, destinationPath),
    create: (input) => ipcRenderer.invoke(CHANNELS.BACKUP_CREATE, input),
    purgeOlder: (input) => ipcRenderer.invoke(CHANNELS.BACKUP_PURGE_OLDER, input),
    listLocal: (directoryPath?: string) => ipcRenderer.invoke(CHANNELS.BACKUP_LIST_LOCAL, directoryPath),
  },
  developer: {
    validatePassword: (password: string) => ipcRenderer.invoke(CHANNELS.DEV_VALIDATE_PASSWORD, password),
    getCurrentDynamicKey: () => ipcRenderer.invoke(CHANNELS.DEV_GET_CURRENT_DYNAMIC_KEY),
    detectLegacyBackup: (filePath?: string) => ipcRenderer.invoke(CHANNELS.DEV_DETECT_LEGACY_BACKUP, filePath),
    importLegacyTests: (filePath?: string) => ipcRenderer.invoke(CHANNELS.DEV_IMPORT_LEGACY_TESTS, filePath),
    selectLegacyFile: () => ipcRenderer.invoke(CHANNELS.DEV_SELECT_LEGACY_FILE),
    detectSavedTemplate: (filePath?: string) => ipcRenderer.invoke(CHANNELS.DEV_DETECT_SAVED_TEMPLATE, filePath),
    seedSavedTemplate: (filePath?: string) => ipcRenderer.invoke(CHANNELS.DEV_SEED_SAVED_TEMPLATE, filePath),
    selectTemplateFile: () => ipcRenderer.invoke(CHANNELS.DEV_SELECT_TEMPLATE_FILE),
    clearAllTests: () => ipcRenderer.invoke(CHANNELS.DEV_CLEAR_ALL_TESTS),
    wipeAllData: () => ipcRenderer.invoke(CHANNELS.DEV_WIPE_ALL_DATA),
    resetUserPassword: (input: { userId: number; newPassword: string }) =>
      ipcRenderer.invoke(CHANNELS.DEV_RESET_USER_PASSWORD, input),
  },
  restore: {
    selectFile: () => ipcRenderer.invoke(CHANNELS.RESTORE_SELECT_FILE),
    inspectFile: (filePath: string) => ipcRenderer.invoke(CHANNELS.RESTORE_INSPECT_FILE, filePath),
    execute: (input) => ipcRenderer.invoke(CHANNELS.RESTORE_EXECUTE, input),
  },
  audit: {
    getRecent: (limit?: number) => ipcRenderer.invoke(CHANNELS.AUDIT_GET_RECENT, limit),
    query: (params?: { startDate?: string; endDate?: string; limit?: number; offset?: number }) => ipcRenderer.invoke(CHANNELS.AUDIT_QUERY, params),
  },
  templates: {
    list: () => ipcRenderer.invoke(CHANNELS.TEMPLATES_LIST),
    getActive: () => ipcRenderer.invoke(CHANNELS.TEMPLATES_GET_ACTIVE),
    save: (template: any) => ipcRenderer.invoke(CHANNELS.TEMPLATES_SAVE, template),
    activate: (id: string) => ipcRenderer.invoke(CHANNELS.TEMPLATES_ACTIVATE, id),
    delete: (id: string) => ipcRenderer.invoke(CHANNELS.TEMPLATES_DELETE, id),
    printTest: (template: any) => ipcRenderer.invoke(CHANNELS.TEMPLATES_PRINT_TEST, { template }),
    exportPdfTest: (template: any) => ipcRenderer.invoke(CHANNELS.TEMPLATES_EXPORT_PDF_TEST, { template }),
  },
  assets: {
    list: (query?: any) => ipcRenderer.invoke(CHANNELS.ASSETS_LIST, query),
    getById: (id: number) => ipcRenderer.invoke(CHANNELS.ASSETS_GET_BY_ID, id),
    create: (input: any) => ipcRenderer.invoke(CHANNELS.ASSETS_CREATE, input),
    update: (input: any) => ipcRenderer.invoke(CHANNELS.ASSETS_UPDATE, input),
    delete: (id: number) => ipcRenderer.invoke(CHANNELS.ASSETS_DELETE, id),
    getSummary: (query?: any) => ipcRenderer.invoke(CHANNELS.ASSETS_GET_SUMMARY, query),
    exportPdf: (query?: any) => ipcRenderer.invoke(CHANNELS.ASSETS_EXPORT_PDF, query),
  },
  finance: {
    getMyPercentageSummary: (query?: any) => ipcRenderer.invoke(CHANNELS.FINANCE_GET_MY_PERCENTAGE_SUMMARY, query),
    recordPayout: (input: any) => ipcRenderer.invoke(CHANNELS.FINANCE_RECORD_PAYOUT, input),
    deletePayout: (id: number) => ipcRenderer.invoke(CHANNELS.FINANCE_DELETE_PAYOUT, id),
    updateOwnerPercentage: (percentage: number) => ipcRenderer.invoke(CHANNELS.FINANCE_UPDATE_OWNER_PERCENTAGE, percentage),
    getPartnershipDashboard: (query?: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_GET_DASHBOARD, query),
    recordLabCollection: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_COLLECTION, input),
    recordPartnershipExpense: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_EXPENSE, input),
    recordPartnerPayment: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_PAYMENT, input),
    reversePartnershipTransaction: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_REVERSE_TRANSACTION, input),
    closePartnershipMonth: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_CLOSE_MONTH, input),
    recordDoctorCommissionPayment: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_DOCTOR_COMMISSION_PAYMENT, input),
    recordInvestorCapital: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_INVESTOR_CAPITAL, input),
    exportPartnershipStatement: (query?: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_EXPORT_STATEMENT, query),
  },
  partnership: {
    getDashboard: (query?: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_GET_DASHBOARD, query),
    recordCollection: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_COLLECTION, input),
    recordExpense: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_EXPENSE, input),
    reverseExpense: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_REVERSE_EXPENSE, input),
    recordPayment: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_PAYMENT, input),
    reverseTransaction: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_REVERSE_TRANSACTION, input),
    closeMonth: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_CLOSE_MONTH, input),
    recordDoctorCommissionPayment: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_DOCTOR_COMMISSION_PAYMENT, input),
    recordInvestorCapital: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_RECORD_INVESTOR_CAPITAL, input),
    exportStatement: (query?: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_EXPORT_STATEMENT, query),
    updateSplit: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_UPDATE_SPLIT, input),
    updateTransaction: (input: any) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_UPDATE_TRANSACTION, input),
    deleteTransaction: (id: number) => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_DELETE_TRANSACTION, id),
    clearTechnicianPayouts: () => ipcRenderer.invoke(CHANNELS.PARTNERSHIP_CLEAR_PAYOUTS),
  },
  doctorCommission: {
    getOverview: (query?: any) => ipcRenderer.invoke(CHANNELS.DOCTOR_COMMISSION_GET_OVERVIEW, query),
    getSummary: (doctorId: number, query?: any) => ipcRenderer.invoke(CHANNELS.DOCTOR_COMMISSION_GET_SUMMARY, { doctorId, query }),
    getVisits: (doctorId: number, query?: any) => ipcRenderer.invoke(CHANNELS.DOCTOR_COMMISSION_GET_VISITS, { doctorId, query }),
    listPayouts: (query?: any) => ipcRenderer.invoke(CHANNELS.DOCTOR_PAYOUTS_LIST, query),
    recordPayout: (input: any) => ipcRenderer.invoke(CHANNELS.DOCTOR_PAYOUTS_RECORD, input),
    updatePayout: (input: any) => ipcRenderer.invoke(CHANNELS.DOCTOR_PAYOUTS_UPDATE, input),
    exportPdf: (query?: any) => ipcRenderer.invoke(CHANNELS.DOCTOR_COMMISSION_EXPORT_PDF, query),
    print: (query?: any) => ipcRenderer.invoke(CHANNELS.DOCTOR_COMMISSION_PRINT, query),
  },
  app: {
    getInfo: () => ipcRenderer.invoke(CHANNELS.APP_GET_INFO),
    checkIntegrity: () => ipcRenderer.invoke(CHANNELS.APP_CHECK_INTEGRITY),
    quit: () => ipcRenderer.invoke(CHANNELS.APP_QUIT),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
