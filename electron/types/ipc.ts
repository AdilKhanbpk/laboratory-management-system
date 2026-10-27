import { z } from 'zod';
import type { SafeUser } from '../database/repositories/user-repository';
import type { HospitalSettings } from '../database/repositories/hospital-repository';
import type { AuditLogEntry } from '../database/repositories/audit-repository';
import type { Patient, PatientSearchResult, DuplicatePatientWarning } from '../database/repositories/patient-repository';
import type { Doctor, DuplicateDoctorWarning } from '../database/repositories/doctor-repository';
import type { LabTest } from '../database/repositories/catalog-repository';
import type { LabAsset, AssetFilterQuery } from '../database/repositories/asset-repository';
import type { OwnerPayout, MyPercentageSummary, DoctorCommissionBreakdown, FinancialMetrics } from '../database/repositories/finance-repository';

export type {
  SafeUser,
  HospitalSettings,
  AuditLogEntry,
  Patient,
  PatientSearchResult,
  DuplicatePatientWarning,
  Doctor,
  DuplicateDoctorWarning,
  LabTest,
  LabAsset,
  AssetFilterQuery,
  OwnerPayout,
  MyPercentageSummary,
  DoctorCommissionBreakdown,
  FinancialMetrics,
};
export type {
  ParameterReferenceRange,
  CreateParameterInput,
  TestParameterWithRanges,
} from '../database/repositories/catalog-repository';

// Input Schemas
export const InitialSetupSchema = z.object({
  hospitalName: z.string().min(2, 'Hospital name must be at least 2 characters'),
  tagline: z.string().optional(),
  address: z.string().min(3, 'Address must be at least 3 characters'),
  phonePrimary: z.string().min(5, 'Primary phone must be at least 5 digits'),
  phoneSecondary: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  currencyCode: z.string().default('PKR'),
  timezone: z.string().default('Asia/Karachi'),
  inactivityTimeoutMinutes: z.number().int().min(1).max(120).default(15),
  adminUsername: z.string().min(3, 'Username must be at least 3 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  adminFullName: z.string().min(2, 'Full name must be at least 2 characters'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export type InitialSetupInput = z.infer<typeof InitialSetupSchema>;

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const UnlockSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export type UnlockInput = z.infer<typeof UnlockSchema>;

export const RestoreKeySchema = z.object({
  recoveryKey: z.string().min(32, 'Recovery code is required'),
  dbBackupPath: z.string().optional(),
});

export type RestoreKeyInput = z.infer<typeof RestoreKeySchema>;

export const RestoreFromBackupSchema = z.object({
  dbBackupPath: z.string().min(1, 'Database backup file path is required'),
  dynamicKey: z.string().min(1, 'Dynamic authorization key is required'),
});

export type RestoreFromBackupInput = z.infer<typeof RestoreFromBackupSchema>;

// User Management Schemas
export const CreateUserSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(150),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'operator']).default('operator'),
  permissions: z.string().default('all'),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  id: z.number().int().positive(),
  fullName: z.string().trim().min(2).max(150).optional(),
  role: z.enum(['admin', 'operator']).optional(),
  permissions: z.string().optional(),
  isActive: z.number().int().min(0).max(1).optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const UpdateUserPasswordSchema = z.object({
  id: z.number().int().positive(),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});
export type UpdateUserPasswordInput = z.infer<typeof UpdateUserPasswordSchema>;

export const UpdateHospitalSettingsSchema = z.object({
  hospital_name: z.string().min(2).optional(),
  tagline: z.string().nullable().optional(),
  address: z.string().min(3).optional(),
  phone_primary: z.string().min(5).optional(),
  phone_secondary: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  currency_code: z.string().optional(),
  timezone: z.string().optional(),
  inactivity_timeout_minutes: z.number().int().min(1).max(120).optional(),
});

export type UpdateHospitalSettingsInput = z.infer<typeof UpdateHospitalSettingsSchema>;

// Patient Schemas
export const CreatePatientSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(150, 'Full name is too long'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD').nullable().optional().refine((val) => {
    if (!val) return true;
    const dob = new Date(val);
    const now = new Date();
    if (isNaN(dob.getTime())) return false;
    if (dob > now) return false;
    const diffYears = (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return diffYears <= 130;
  }, 'Date of birth must be a valid past date (maximum 130 years ago)'),
  gender: z.enum(['male', 'female', 'other']),
  phoneNumber: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(250).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;

export const UpdatePatientSchema = CreatePatientSchema.extend({
  id: z.number().int().positive(),
});

export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;

// Doctor Schemas
export const CreateDoctorSchema = z.object({
  fullName: z.string().trim().min(2, 'Doctor name must be at least 2 characters').max(150),
  specialization: z.string().trim().max(100).nullable().optional(),
  phoneNumber: z.string().trim().max(30).nullable().optional(),
  clinicHospitalName: z.string().trim().max(150).nullable().optional(),
  address: z.string().trim().max(250).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  commissionPercentage: z.number().min(0).max(100).optional().default(0),
});

export type CreateDoctorInput = z.infer<typeof CreateDoctorSchema>;

export const UpdateDoctorSchema = CreateDoctorSchema.extend({
  id: z.number().int().positive(),
  isActive: z.number().int().min(0).max(1).optional(),
});

export type UpdateDoctorInput = z.infer<typeof UpdateDoctorSchema>;

// Test Catalog Schemas
export const ParameterReferenceRangeSchema = z.object({
  gender: z.enum(['all', 'male', 'female']).default('all'),
  min_age_days: z.number().int().min(0).default(0),
  max_age_days: z.number().int().min(0).default(47450),
  normal_low: z.number().nullable().optional(),
  normal_high: z.number().nullable().optional(),
  panic_low: z.number().nullable().optional(),
  panic_high: z.number().nullable().optional(),
  display_text: z.string().trim().min(1, 'Display reference text is required'),
});

export const TestParameterInputSchema = z.object({
  parameter_name: z.string().trim().min(1, 'Parameter name is required').max(100),
  display_order: z.number().int().min(1).default(1),
  unit: z.string().trim().max(30).nullable().optional(),
  parameter_type: z.enum(['numeric', 'text', 'options']).default('numeric'),
  notes: z.string().trim().max(500).nullable().optional(),
  ranges: z.array(ParameterReferenceRangeSchema).optional().default([]),
});

export const CreateTestSchema = z.object({
  testCode: z.string().trim().min(1, 'Test code is required').max(30).regex(/^[a-zA-Z0-9_\-\.]+$/, 'Test code can only contain letters, numbers, and hyphens'),
  testName: z.string().trim().min(2, 'Test name must be at least 2 characters').max(150),
  category: z.string().trim().min(2, 'Category is required').max(80),
  description: z.string().trim().max(1000).nullable().optional(),
  pricePaisa: z.number().int().min(0, 'Price must be 0 or positive integer paisa'),
  sampleType: z.string().trim().max(100).nullable().optional(),
  collectionContainer: z.string().trim().max(100).nullable().optional(),
  patientPreparation: z.string().trim().max(500).nullable().optional(),
  turnaroundTime: z.string().trim().max(100).nullable().optional(),
  testMethod: z.string().trim().max(150).nullable().optional(),
  parameters: z.array(TestParameterInputSchema).min(1, 'Test must include at least one parameter'),
});

export type CreateTestInput = z.infer<typeof CreateTestSchema>;

export const UpdateTestSchema = CreateTestSchema.extend({
  id: z.number().int().positive(),
  isActive: z.number().int().min(0).max(1).optional(),
});

export type UpdateTestInput = z.infer<typeof UpdateTestSchema>;

// --- Visits, Orders & Billing Types ---

export interface Visit {
  id: number;
  visit_number: string;
  patient_id: number;
  referring_doctor_id: number | null;
  order_date: string;
  status: 'registered' | 'in_progress' | 'completed' | 'cancelled';
  operator_id: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  patient_name?: string;
  patient_mrn?: string;
  patient_gender?: string;
  patient_dob?: string | null;
  patient_phone?: string | null;
  doctor_name?: string | null;
  doctor_specialization?: string | null;
  operator_name?: string;
  // Invoice summary join
  invoice_number?: string;
  final_total?: number;
  paid_amount?: number;
  balance_amount?: number;
  payment_status?: 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'void';
}

export interface OrderItem {
  id: number;
  visit_id: number;
  test_id: number;
  test_code_snapshot: string;
  test_name_snapshot: string;
  price_snapshot: number; // in paisa
  quantity: number;
  subtotal_amount: number; // in paisa
  status: 'ordered' | 'sample_collected' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  visit_id: number;
  subtotal_amount: number; // in paisa
  discount_type: 'none' | 'fixed' | 'percentage';
  discount_value: number;
  discount_amount: number; // in paisa
  final_total: number; // in paisa
  paid_amount: number; // in paisa
  balance_amount: number; // in paisa
  payment_status: 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'void';
  created_at: string;
  finalized_at?: string | null;
}

export interface Payment {
  id: number;
  receipt_number: string;
  invoice_id: number;
  amount: number; // in paisa
  payment_method: 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'cheque' | 'other';
  transaction_reference?: string | null;
  operator_id: number;
  status: 'cleared' | 'reversed';
  reversal_reason?: string | null;
  reversed_at?: string | null;
  created_at: string;
  operator_name?: string;
}

export interface VisitDetail {
  visit: Visit;
  patient: Patient;
  doctor: Doctor | null;
  orderItems: OrderItem[];
  invoice: Invoice;
  payments: Payment[];
}

export interface VisitSearchResult {
  visits: Visit[];
  total: number;
  page: number;
  totalPages: number;
  totalBilledPaisa?: number;
  totalPaidPaisa?: number;
  totalBalancePaisa?: number;
}

export interface AuditQueryResult {
  logs: AuditLogEntry[];
  total: number;
  hasMore: boolean;
}

export interface ReportTemplateColumn {
  key: string;
  label: string;
  visible: boolean;
}

export interface ReportTemplateHeader {
  logoDataUrl: string;
  hospitalName: string;
  reportTitle: string;
  supervisor: string;
  address: string;
  phone: string;
  mobile: string;
  whatsapp: string;
  badgeText?: string;
  showBadge?: boolean;
  showLogo: boolean;
  color: string;
  accentColor: string;
  align: 'left' | 'center';
}

export interface ReportTemplateObservations {
  visible: boolean;
  title: string;
  defaultText: string;
}

export interface ReportTemplateFooter {
  visible: boolean;
  text: string;
  rightText: string;
  color: string;
}

export interface ReportTemplateStyle {
  fontFamily: string;
  fontSize: number;
  showPatientBox: boolean;
}

export interface ReportTemplate {
  id: string;
  name: string;
  active: boolean;
  header: ReportTemplateHeader;
  patientFields: string[];
  columns: ReportTemplateColumn[];
  observations: ReportTemplateObservations;
  footer: ReportTemplateFooter;
  style: ReportTemplateStyle;
  created_at?: string;
  updated_at?: string;
}

export interface DoctorReferralStats {
  doctorId: number;
  doctorName: string;
  specialization: string | null;
  commissionPercentage?: number;
  commissionPaisa?: number;
  totalVisits: number;
  uniquePatients: number;
  totalTestsOrdered: number;
  grossRevenuePaisa: number;
  netRevenuePaisa: number;
  totalDiscountPaisa: number;
  totalPaidPaisa: number;
  totalBalancePaisa: number;
}

export const CreateVisitOrderSchema = z
  .object({
    patientId: z.number().int().positive().optional(),
    newPatient: CreatePatientSchema.optional(),
    referringDoctorId: z.number().int().positive().nullable().optional(),
    testIds: z.array(z.number().int().positive()).min(1, 'At least one laboratory test must be selected'),
    discountType: z.enum(['none', 'fixed', 'percentage']).optional().default('none'),
    discountValue: z.number().nonnegative().optional().default(0), // Paisa if fixed, % if percentage
    paidAmountPaisa: z.number().int().nonnegative().optional().default(0),
    paymentMethod: z
      .enum(['cash', 'credit_card', 'debit_card', 'bank_transfer', 'cheque', 'other'])
      .optional()
      .default('cash'),
    transactionReference: z.string().max(100).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((data) => data.patientId !== undefined || data.newPatient !== undefined, {
    message: 'Either an existing patient must be selected or new patient details provided',
    path: ['patientId'],
  });

export type CreateVisitOrderInput = z.input<typeof CreateVisitOrderSchema>;

export const UpdateVisitOrderAndInvoiceSchema = z.object({
  visitId: z.number().int().positive(),
  patientName: z.string().trim().min(1, 'Patient name cannot be empty').optional(),
  patientDob: z.string().nullable().optional(),
  patientGender: z.enum(['male', 'female', 'other']).optional(),
  patientPhone: z.string().trim().max(50).nullable().optional(),
  referringDoctorId: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  testIds: z.array(z.number().int().positive()).min(1, 'At least one laboratory test must be selected in the order'),
  discountType: z.enum(['none', 'fixed', 'percentage']).default('none'),
  discountValue: z.number().nonnegative().default(0),
  additionalPaymentPaisa: z.number().int().nonnegative().optional().default(0),
  paymentMethod: z
    .enum(['cash', 'credit_card', 'debit_card', 'bank_transfer', 'cheque', 'other'])
    .optional()
    .default('cash'),
  transactionReference: z.string().max(100).optional(),
});

export type UpdateVisitOrderAndInvoiceInput = z.input<typeof UpdateVisitOrderAndInvoiceSchema>;

export const RecordPaymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  amountPaisa: z.number().int().positive('Payment amount must be greater than zero'),
  paymentMethod: z
    .enum(['cash', 'credit_card', 'debit_card', 'bank_transfer', 'cheque', 'other'])
    .optional()
    .default('cash'),
  transactionReference: z.string().max(100).optional(),
});

export type RecordPaymentInput = z.input<typeof RecordPaymentSchema>;

export const DoctorStatsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  doctorId: z.number().int().min(0).optional(),
});

export type DoctorStatsQuery = z.infer<typeof DoctorStatsQuerySchema>;

// --- Prompt 4: Results, Reports, Amendments, and History Types ---

export type ResultFlag = 'normal' | 'low' | 'high' | 'critical' | 'unconfigured';
export type ResultStatus = 'pending' | 'draft' | 'reviewed' | 'finalized' | 'corrected';

export interface TestResult {
  id: number;
  order_item_id: number;
  parameter_id: number;
  numeric_value: number | null;
  result_value: string;
  unit_snapshot: string | null;
  reference_range_display: string;
  flag: ResultFlag;
  status: ResultStatus;
  result_notes?: string | null;
  entered_by: number;
  entered_at: string;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  finalized_by?: number | null;
  finalized_at?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  // Joins
  parameter_name?: string;
  parameter_type?: 'numeric' | 'text' | 'options';
  display_order?: number;
  entered_by_name?: string;
  reviewed_by_name?: string;
  finalized_by_name?: string;
}

export interface ReportSnapshot {
  id: number;
  visit_id: number;
  version: number;
  report_number: string;
  status: 'finalized' | 'amended';
  snapshot_json: string;
  integrity_hash: string;
  finalized_by: number;
  finalized_at: string;
  created_at: string;
  finalized_by_name?: string;
}

export interface ResultAmendment {
  id: number;
  result_id: number;
  previous_value: string;
  new_value: string;
  previous_flag: string;
  new_flag: string;
  amendment_reason: string;
  amended_by: number;
  created_at: string;
  amended_by_name?: string;
  parameter_name?: string;
}

export interface WorklistOrderItem {
  orderItemId: number;
  visitId: number;
  visitNumber: string;
  patientId: number;
  patientName: string;
  patientMrn: string;
  patientGender: string;
  patientDob?: string | null;
  doctorName?: string | null;
  testId: number;
  testCode: string;
  testName: string;
  orderDate: string;
  orderItemStatus: string;
  resultStatus: ResultStatus;
  parametersTotal: number;
  parametersEntered: number;
}

export interface ReportEditorInfo {
  isEdited: boolean;
  editedByName: string;
  editedAt: string;
  originalByName?: string;
  originalAt?: string;
  version: number;
}

export interface ReportHistoryEntry {
  version: number;
  reportNumber: string;
  status: string;
  operatorName: string;
  date: string;
  isInitial: boolean;
}

export interface FullDiagnosticReport {
  visit: Visit;
  patient: Patient;
  doctor: Doctor | null;
  hospital: HospitalSettings;
  tests: Array<{
    orderItem: OrderItem;
    results: Array<{
      parameter: {
        id: number;
        name: string;
        unit: string | null;
        type: 'numeric' | 'text' | 'options';
        displayOrder: number;
      };
      result: TestResult | null;
      flag: ResultFlag;
      referenceRangeDisplay: string;
    }>;
  }>;
  snapshot?: (ReportSnapshot & { finalized_by_name?: string }) | null;
  amendments?: ResultAmendment[];
  editorInfo?: ReportEditorInfo | null;
  editHistory?: ReportHistoryEntry[];
  template?: ReportTemplate | null;
}

export interface PatientHistoryItem {
  visit: Visit;
  invoice?: Invoice | null;
  orderItems: OrderItem[];
  reportStatus: ResultStatus;
  hasSnapshot: boolean;
  finalizedAt?: string | null;
}

export const SaveDraftResultsSchema = z.object({
  orderItemId: z.number().int().positive(),
  results: z
    .array(
      z.object({
        parameterId: z.number().int().positive(),
        resultValue: z.string().min(1, 'Result value cannot be empty'),
        resultNotes: z.string().max(500).optional(),
      })
    )
    .min(1, 'At least one parameter result must be submitted'),
});

export type SaveDraftResultsInput = z.infer<typeof SaveDraftResultsSchema>;

export const FinalizeReportSchema = z.object({
  visitId: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
});

export type FinalizeReportInput = z.infer<typeof FinalizeReportSchema>;

export const AmendResultSchema = z.object({
  resultId: z.number().int().positive(),
  newValue: z.string().min(1, 'New result value cannot be empty'),
  amendmentReason: z
    .string()
    .min(10, 'A clinical amendment explanation of at least 10 characters is required'),
});

export type AmendResultInput = z.infer<typeof AmendResultSchema>;

export const ExportPdfSchema = z.object({
  visitId: z.number().int().positive(),
  defaultFileName: z.string().optional(),
});

export type ExportPdfInput = z.infer<typeof ExportPdfSchema>;

// ==========================================
// Prompt 5: Backup & Disaster Recovery Schemas
// ==========================================

export const CreateBackupSchema = z.object({
  destinationDir: z.string().optional(),
  deletePrevious: z.boolean().optional(),
  dynamicKey: z.string().optional(),
});
export type CreateBackupInput = z.infer<typeof CreateBackupSchema>;

export const PurgeOlderBackupsSchema = z.object({
  destinationDir: z.string().optional(),
  keepFileName: z.string().optional(),
});
export type PurgeOlderBackupsInput = z.infer<typeof PurgeOlderBackupsSchema>;

export const DevValidatePasswordSchema = z.object({
  password: z.string().min(1),
});
export type DevValidatePasswordInput = z.infer<typeof DevValidatePasswordSchema>;

export interface DevCurrentDynamicKeyResult {
  key: string;
  minutesRemaining: number;
  currentHourStr: string;
}

export interface LegacyTestDetectionResult {
  detected: boolean;
  filePath: string | null;
  fileName: string | null;
  fileSize: number;
  testsCount: number;
  parametersCount: number;
  departmentsCount: number;
  error?: string;
}

export interface LegacyTestImportStats {
  filePath: string;
  testsInserted: number;
  testsUpdated: number;
  totalTests: number;
  parametersInserted: number;
  departmentsFound: number;
}

export interface SavedTemplateDetectionResult {
  detected: boolean;
  filePath: string | null;
  fileName: string | null;
  fileSize: number;
  templateName: string;
  hospitalName: string;
  supervisor: string;
  address: string;
  badgeText: string;
  hasLogo: boolean;
  logoLength: number;
  footerText: string;
  footerRightText: string;
  columnsCount: number;
  error?: string;
}

export interface SavedTemplateSeedResult {
  templateId: string;
  templateName: string;
  hospitalName: string;
  hasLogo: boolean;
  activated: boolean;
  updatedAt: string;
}

export const InspectBackupSchema = z.object({
  filePath: z.string().min(1, 'Backup file path is required'),
});
export type InspectBackupInput = z.infer<typeof InspectBackupSchema>;

export const ExecuteRestoreSchema = z.object({
  filePath: z.string().min(1, 'Backup file path is required'),
});
export type ExecuteRestoreInput = z.infer<typeof ExecuteRestoreSchema>;

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

// Assets & Purchases Schemas
export const CreateAssetSchema = z.object({
  title: z.string().trim().min(2, 'Asset/Purchase title must be at least 2 characters').max(200),
  category: z.string().trim().max(100).optional().default('general'),
  amountPaisa: z.number().int().min(0, 'Amount must be positive'),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  purchasedBy: z.enum(['technician', 'doctor']).optional().default('technician'),
  purchaserName: z.string().trim().max(150).nullable().optional(),
  invoiceReceiptNo: z.string().trim().max(100).nullable().optional(),
  vendorName: z.string().trim().max(150).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;

export const UpdateAssetSchema = CreateAssetSchema.partial().extend({
  id: z.number().int().positive(),
});
export type UpdateAssetInput = z.infer<typeof UpdateAssetSchema>;

// Owner Payout Schema
export const RecordPayoutSchema = z.object({
  amountPaisa: z.number().int().positive('Received amount must be greater than zero'),
  payoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type RecordPayoutInput = z.infer<typeof RecordPayoutSchema>;

// ==========================================
// Partnership Accounting & Settlement Schemas
// ==========================================

export const RecordLabCollectionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  amountPaisa: z.number().int().positive('Collection amount must be greater than zero'),
  type: z.enum(['payment_received', 'patient_bill', 'credit_adjustment']),
  collectedBy: z.enum(['investor', 'technician']),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type RecordLabCollectionInput = z.infer<typeof RecordLabCollectionSchema>;

export const RecordPartnershipExpenseSchema = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  category: z.string().trim().min(1, 'Category is required'),
  description: z.string().trim().min(2, 'Description must be at least 2 characters').max(500),
  amountPaisa: z.number().int().positive('Expense amount must be greater than zero'),
  paidBy: z.enum(['lab', 'investor', 'technician']).default('lab'),
  receiptNo: z.string().trim().max(100).nullable().optional(),
});
export type RecordPartnershipExpenseInput = z.infer<typeof RecordPartnershipExpenseSchema>;

export const RecordPartnerPaymentSchema = z.object({
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  amountPaisa: z.number().int().positive('Payment amount must be greater than zero'),
  partner: z.enum(['technician', 'investor']),
  type: z.enum(['profit_distribution', 'advance', 'expense_reimbursement', 'adjustment']),
  method: z.enum(['cash', 'bank_transfer', 'cheque', 'other']).default('cash'),
  reference: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type RecordPartnerPaymentInput = z.infer<typeof RecordPartnerPaymentSchema>;

export const ReversePartnershipTransactionSchema = z.object({
  transactionId: z.number().int().positive(),
  reason: z.string().trim().min(3, 'Reversal reason must be at least 3 characters'),
});
export type ReversePartnershipTransactionInput = z.infer<typeof ReversePartnershipTransactionSchema>;

export const ClosePartnershipMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type ClosePartnershipMonthInput = z.infer<typeof ClosePartnershipMonthSchema>;

export const RecordDoctorCommissionPaymentSchema = z.object({
  doctorId: z.number().int().positive(),
  amountPaisa: z.number().int().positive('Commission payment amount must be greater than zero'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'cheque', 'other']).default('cash'),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type RecordDoctorCommissionPaymentInput = z.infer<typeof RecordDoctorCommissionPaymentSchema>;

export const RecordInvestorCapitalSchema = z.object({
  amountPaisa: z.number().int().positive('Capital amount must be greater than zero'),
  type: z.enum(['capital_contribution', 'capital_return']),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type RecordInvestorCapitalInput = z.infer<typeof RecordInvestorCapitalSchema>;

export const UpdatePartnershipSplitSchema = z.object({
  technicianPercentage: z.number().min(0).max(100),
  investorPercentage: z.number().min(0).max(100).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type UpdatePartnershipSplitInput = z.infer<typeof UpdatePartnershipSplitSchema>;

export interface PartnershipDashboardData {
  period: {
    startDate?: string | null;
    endDate?: string | null;
    totalSalesPaisa: number;
    totalCollectedPaisa: number;
    unpaidPatientBillsPaisa: number;
    totalDoctorsCommissionPaisa: number;
    totalAssetsPaisa: number;
    netProfitPaisa: number;
    technicianPct: number;
    investorPct: number;
    mySharePaisa: number;
    investorSharePaisa: number;
    techOutOfPocketPaisa?: number;
    investorOutOfPocketPaisa?: number;
    totalReceivedPaisa: number;
    investorPaidPaisa: number;
    remainingBalancePaisa: number;
    investorRemainingBalancePaisa: number;
  };
  lifetime: {
    totalSalesPaisa: number;
    totalCollectedPaisa: number;
    totalDoctorsCommissionPaisa: number;
    totalAssetsPaisa: number;
    netProfitPaisa: number;
    mySharePaisa: number;
    investorSharePaisa: number;
    techOutOfPocketPaisa?: number;
    investorOutOfPocketPaisa?: number;
    totalReceivedPaisa: number;
    remainingBalancePaisa: number;
    investorRemainingBalancePaisa?: number;
  };
  collection: {
    billedPaisa: number;
    collectedPaisa: number;
    outstandingPaisa: number;
    collectionDifferencePaisa: number;
    investorCollectedPaisa: number;
    technicianCollectedPaisa: number;
    transferToTechnicianPaisa: number;
  };
  doctorCommissions: Array<{
    doctorId: number;
    doctorName: string;
    commissionPercentage: number;
    referredVisits: number;
    netSalesPaisa: number;
    commissionPaisa: number;
    paidPaisa: number;
    unpaidPaisa: number;
  }>;
  transactions: Array<{
    id: number;
    date: string;
    amountPaisa: number;
    partner: 'technician' | 'investor';
    type: 'profit_distribution' | 'advance' | 'expense_reimbursement' | 'adjustment';
    method: 'cash' | 'bank_transfer' | 'cheque' | 'other';
    reference?: string | null;
    notes?: string | null;
    status: 'active' | 'reversed';
    reversalReason?: string | null;
    reversedAt?: string | null;
    recordedByName?: string | null;
    createdAt: string;
  }>;
  expenses: Array<{
    id: number;
    expenseDate: string;
    category: string;
    description: string;
    amountPaisa: number;
    paidBy: 'lab' | 'investor' | 'technician';
    receiptNo?: string | null;
    status?: 'active' | 'reversed';
    reversalReason?: string | null;
    recordedByName?: string | null;
  }>;
  closedMonths: Array<{
    id: number;
    month: string;
    closedAt: string;
    netProfitPaisa: number;
    technicianSharePaisa: number;
    investorSharePaisa: number;
    closedByName?: string | null;
  }>;
  capital: {
    investorCapitalPaisa: number;
    capitalReturnedPaisa: number;
    capitalRemainingPaisa: number;
  };
  payouts: OwnerPayout[];
  assets?: Array<{
    id: number;
    title: string;
    category: string;
    amountPaisa: number;
    purchaseDate: string;
    purchasedBy: 'technician' | 'doctor';
    purchaserName?: string | null;
    invoiceReceiptNo?: string | null;
    vendorName?: string | null;
    notes?: string | null;
    recordedByName?: string | null;
    createdAt?: string;
  }>;
}

// Generic IPC Response envelope
export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  cancelled?: boolean;
}

export interface AppInfo {
  version: string;
  isPackaged: boolean;
  isOffline: boolean;
  databaseEncrypted: boolean;
  schemaVersion: number;
  environment: string;
}

export interface SessionInfo {
  user: SafeUser;
  hospital: HospitalSettings;
  sessionStartedAt: string;
}

// Preload Window Interface
export interface ElectronAPI {
  auth: {
    checkSetup: () => Promise<IpcResponse<{ isConfigured: boolean }>>;
    setup: (input: InitialSetupInput) => Promise<IpcResponse<{ user: SafeUser; hospital: HospitalSettings }>>;
    login: (input: LoginInput) => Promise<IpcResponse<SessionInfo>>;
    logout: () => Promise<IpcResponse<boolean>>;
    getSession: () => Promise<IpcResponse<SessionInfo | null>>;
    unlock: (input: UnlockInput) => Promise<IpcResponse<boolean>>;
    getRecoveryKey: () => Promise<IpcResponse<string>>;
    restoreWithKey: (input: RestoreKeyInput) => Promise<IpcResponse<boolean>>;
    restoreFromBackup: (input: RestoreFromBackupInput) => Promise<IpcResponse<boolean>>;
  };
  users: {
    list: () => Promise<IpcResponse<SafeUser[]>>;
    create: (input: CreateUserInput) => Promise<IpcResponse<SafeUser>>;
    update: (input: UpdateUserInput) => Promise<IpcResponse<SafeUser>>;
    updatePassword: (input: UpdateUserPasswordInput) => Promise<IpcResponse<boolean>>;
    toggleActive: (id: number, isActive: boolean) => Promise<IpcResponse<SafeUser>>;
  };
  settings: {
    getHospital: () => Promise<IpcResponse<HospitalSettings>>;
    updateHospital: (input: UpdateHospitalSettingsInput) => Promise<IpcResponse<HospitalSettings>>;
    uploadLogo: (base64Image: string) => Promise<IpcResponse<{ logoPath: string; logoUrl: string }>>;
    getLogoUrl: () => Promise<IpcResponse<string | null>>;
  };
  patients: {
    search: (params?: { query?: string; gender?: string; page?: number; limit?: number; sortBy?: string; sortOrder?: string }) => Promise<IpcResponse<PatientSearchResult>>;
    getById: (id: number) => Promise<IpcResponse<Patient | null>>;
    create: (input: CreatePatientInput) => Promise<IpcResponse<Patient>>;
    update: (input: UpdatePatientInput) => Promise<IpcResponse<Patient>>;
    checkDuplicates: (fullName: string, phoneNumber?: string | null, excludeId?: number) => Promise<IpcResponse<DuplicatePatientWarning>>;
  };
  doctors: {
    list: (params?: { search?: string; includeInactive?: boolean; specialization?: string }) => Promise<IpcResponse<Doctor[]>>;
    getById: (id: number) => Promise<IpcResponse<Doctor | null>>;
    create: (input: CreateDoctorInput) => Promise<IpcResponse<Doctor>>;
    update: (input: UpdateDoctorInput) => Promise<IpcResponse<Doctor>>;
    setActiveStatus: (id: number, isActive: boolean) => Promise<IpcResponse<Doctor>>;
    checkDuplicates: (fullName: string, excludeId?: number) => Promise<IpcResponse<DuplicateDoctorWarning>>;
  };
  tests: {
    list: (params?: { category?: string; search?: string; includeInactive?: boolean }) => Promise<IpcResponse<LabTest[]>>;
    getById: (id: number) => Promise<IpcResponse<LabTest | null>>;
    create: (input: CreateTestInput) => Promise<IpcResponse<LabTest>>;
    update: (input: UpdateTestInput) => Promise<IpcResponse<LabTest>>;
    setActiveStatus: (id: number, isActive: boolean) => Promise<IpcResponse<LabTest>>;
    getCategories: () => Promise<IpcResponse<string[]>>;
  };
  visits: {
    create: (input: CreateVisitOrderInput) => Promise<IpcResponse<VisitDetail>>;
    updateOrderAndInvoice: (input: UpdateVisitOrderAndInvoiceInput) => Promise<IpcResponse<VisitDetail>>;
    getById: (id: number) => Promise<IpcResponse<VisitDetail | null>>;
    search: (params?: { query?: string; status?: string; paymentStatus?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) => Promise<IpcResponse<VisitSearchResult>>;
    getPatientHistory: (patientId: number) => Promise<IpcResponse<Visit[]>>;
  };
  billing: {
    recordPayment: (input: RecordPaymentInput) => Promise<IpcResponse<Payment>>;
    getInvoice: (id: number) => Promise<IpcResponse<Invoice | null>>;
  };
  results: {
    getWorklist: (params?: { query?: string; status?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) => Promise<IpcResponse<WorklistOrderItem[]>>;
    getForOrderItem: (orderItemId: number) => Promise<IpcResponse<{
      orderItem: OrderItem;
      patient: Patient;
      parameters: Array<{
        parameter: { id: number; name: string; unit: string | null; type: 'numeric' | 'text' | 'options'; displayOrder: number };
        currentResult: TestResult | null;
        ranges: any[];
      }>;
    }>>;
    saveDraft: (input: SaveDraftResultsInput) => Promise<IpcResponse<TestResult[]>>;
    markReviewed: (orderItemId: number) => Promise<IpcResponse<boolean>>;
    finalizeReport: (input: FinalizeReportInput) => Promise<IpcResponse<ReportSnapshot>>;
    amendResult: (input: AmendResultInput) => Promise<IpcResponse<TestResult>>;
  };
  reports: {
    getDiagnosticReport: (visitId: number) => Promise<IpcResponse<FullDiagnosticReport>>;
    exportPdf: (input: ExportPdfInput) => Promise<IpcResponse<{ success: boolean; filePath?: string }>>;
    print: (visitId: number) => Promise<IpcResponse<any>>;
    getDoctorStats: (query?: DoctorStatsQuery) => Promise<IpcResponse<DoctorReferralStats[]>>;
  };
  patientHistory: {
    getFullHistory: (patientId: number) => Promise<IpcResponse<PatientHistoryItem[]>>;
  };
  backup: {
    selectDestination: () => Promise<IpcResponse<string | null>>;
    setDefaultPath: (destinationPath: string) => Promise<IpcResponse<boolean>>;
    create: (input?: CreateBackupInput) => Promise<IpcResponse<BackupResult>>;
    purgeOlder: (input?: PurgeOlderBackupsInput) => Promise<IpcResponse<{ deletedCount: number }>>;
    listLocal: (directoryPath?: string) => Promise<IpcResponse<BackupMetadata[]>>;
  };
  developer: {
    validatePassword: (password: string) => Promise<IpcResponse<boolean>>;
    getCurrentDynamicKey: () => Promise<IpcResponse<DevCurrentDynamicKeyResult>>;
    detectLegacyBackup: (filePath?: string) => Promise<IpcResponse<LegacyTestDetectionResult>>;
    importLegacyTests: (filePath?: string) => Promise<IpcResponse<LegacyTestImportStats>>;
    selectLegacyFile: () => Promise<IpcResponse<string | null>>;
    detectSavedTemplate: (filePath?: string) => Promise<IpcResponse<SavedTemplateDetectionResult>>;
    seedSavedTemplate: (filePath?: string) => Promise<IpcResponse<SavedTemplateSeedResult>>;
    selectTemplateFile: () => Promise<IpcResponse<string | null>>;
    clearAllTests: () => Promise<IpcResponse<{ deletedTests: number; deletedParams: number }>>;
    wipeAllData: () => Promise<IpcResponse<{ deletedTests: number; deletedParams: number; deletedVisits: number }>>;
  };
  restore: {
    selectFile: () => Promise<IpcResponse<string | null>>;
    inspectFile: (filePath: string) => Promise<IpcResponse<BackupInspectionResult>>;
    execute: (input: ExecuteRestoreInput) => Promise<IpcResponse<RestoreExecutionResult>>;
  };
  audit: {
    getRecent: (limit?: number) => Promise<IpcResponse<AuditLogEntry[]>>;
    query: (params?: { startDate?: string; endDate?: string; limit?: number; offset?: number }) => Promise<IpcResponse<AuditQueryResult>>;
  };
  templates: {
    list: () => Promise<IpcResponse<ReportTemplate[]>>;
    getActive: () => Promise<IpcResponse<ReportTemplate>>;
    save: (template: ReportTemplate) => Promise<IpcResponse<ReportTemplate>>;
    activate: (id: string) => Promise<IpcResponse<boolean>>;
    delete: (id: string) => Promise<IpcResponse<boolean>>;
    printTest: (template: ReportTemplate) => Promise<IpcResponse<any>>;
    exportPdfTest: (template: ReportTemplate) => Promise<IpcResponse<{ success: boolean; filePath?: string }>>;
  };
  assets: {
    list: (query?: AssetFilterQuery) => Promise<IpcResponse<LabAsset[]>>;
    getById: (id: number) => Promise<IpcResponse<LabAsset | null>>;
    create: (input: CreateAssetInput) => Promise<IpcResponse<LabAsset>>;
    update: (input: UpdateAssetInput) => Promise<IpcResponse<LabAsset>>;
    delete: (id: number) => Promise<IpcResponse<boolean>>;
    getSummary: (query?: { startDate?: string; endDate?: string }) => Promise<IpcResponse<{ totalCount: number; totalAmountPaisa: number }>>;
    exportPdf: (query?: AssetFilterQuery) => Promise<IpcResponse<{ success: boolean; filePath?: string }>>;
  };
  finance: {
    getMyPercentageSummary: (query?: { startDate?: string; endDate?: string }) => Promise<IpcResponse<MyPercentageSummary>>;
    recordPayout: (input: RecordPayoutInput) => Promise<IpcResponse<OwnerPayout>>;
    deletePayout: (id: number) => Promise<IpcResponse<boolean>>;
    updateOwnerPercentage: (percentage: number) => Promise<IpcResponse<number>>;
    getPartnershipDashboard: (query?: { startDate?: string; endDate?: string }) => Promise<IpcResponse<PartnershipDashboardData>>;
    recordLabCollection: (input: RecordLabCollectionInput) => Promise<IpcResponse<any>>;
    recordPartnershipExpense: (input: RecordPartnershipExpenseInput) => Promise<IpcResponse<any>>;
    recordPartnerPayment: (input: RecordPartnerPaymentInput) => Promise<IpcResponse<any>>;
    reversePartnershipTransaction: (input: ReversePartnershipTransactionInput) => Promise<IpcResponse<boolean>>;
    closePartnershipMonth: (input: ClosePartnershipMonthInput) => Promise<IpcResponse<any>>;
    recordDoctorCommissionPayment: (input: RecordDoctorCommissionPaymentInput) => Promise<IpcResponse<any>>;
    recordInvestorCapital: (input: RecordInvestorCapitalInput) => Promise<IpcResponse<any>>;
    exportPartnershipStatement: (query?: { startDate?: string; endDate?: string }) => Promise<IpcResponse<{ success: boolean; filePath?: string; cancelled?: boolean }>>;
  };
  partnership: {
    getDashboard: (query?: { startDate?: string; endDate?: string }) => Promise<IpcResponse<PartnershipDashboardData>>;
    recordCollection: (input: RecordLabCollectionInput) => Promise<IpcResponse<any>>;
    recordExpense: (input: RecordPartnershipExpenseInput) => Promise<IpcResponse<any>>;
    reverseExpense: (input: { expenseId: number; reason: string }) => Promise<IpcResponse<boolean>>;
    recordPayment: (input: RecordPartnerPaymentInput) => Promise<IpcResponse<any>>;
    reverseTransaction: (input: ReversePartnershipTransactionInput) => Promise<IpcResponse<boolean>>;
    closeMonth: (input: ClosePartnershipMonthInput) => Promise<IpcResponse<any>>;
    recordDoctorCommissionPayment: (input: RecordDoctorCommissionPaymentInput) => Promise<IpcResponse<any>>;
    recordInvestorCapital: (input: RecordInvestorCapitalInput) => Promise<IpcResponse<any>>;
    exportStatement: (query?: { startDate?: string; endDate?: string }) => Promise<IpcResponse<{ success: boolean; filePath?: string; cancelled?: boolean }>>;
    updateSplit: (input: UpdatePartnershipSplitInput) => Promise<IpcResponse<number>>;
    updateTransaction: (input: { id: number; paymentDate: string; amountPaisa: number; partner?: 'technician' | 'investor'; type?: string; method?: string; reference?: string; notes?: string; editReason?: string }) => Promise<IpcResponse<boolean>>;
    deleteTransaction: (id: number) => Promise<IpcResponse<boolean>>;
    clearTechnicianPayouts: () => Promise<IpcResponse<{ deletedCount: number }>>;
  };
  app: {
    getInfo: () => Promise<IpcResponse<AppInfo>>;
    checkIntegrity: () => Promise<IpcResponse<{ ok: boolean; details: string[] }>>;
    quit: () => Promise<void>;
  };
}
