export const IPC_CHANNELS = {
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

  // Users Management & RBAC
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

  // Diagnostic Reports & Printing
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
  DEV_CLEAR_ALL_TESTS: 'dev:clear-all-tests',
  DEV_WIPE_ALL_DATA: 'dev:wipe-all-data',

  // Audit
  AUDIT_GET_RECENT: 'audit:get-recent',
  AUDIT_QUERY: 'audit:query',

  // Report Templates Designer
  TEMPLATES_LIST: 'templates:list',
  TEMPLATES_GET_ACTIVE: 'templates:get-active',
  TEMPLATES_SAVE: 'templates:save',
  TEMPLATES_ACTIVATE: 'templates:activate',
  TEMPLATES_DELETE: 'templates:delete',
  TEMPLATES_PRINT_TEST: 'templates:print-test',
  TEMPLATES_EXPORT_PDF_TEST: 'templates:export-pdf-test',

  // System & App
  APP_GET_INFO: 'app:get-info',
  APP_CHECK_INTEGRITY: 'app:check-integrity',
  APP_QUIT: 'app:quit',
} as const;

export type IpcChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
