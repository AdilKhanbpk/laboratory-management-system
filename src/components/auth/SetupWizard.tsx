import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { InitialSetupSchema, InitialSetupInput } from '../../types';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Alert } from '../common/Alert';
import {
  Building2,
  UserCheck,
  Sparkles,
  WifiOff,
  Database,
  Lock,
  CheckCircle2,
  Coins,
  Activity,
  KeyRound,
  FolderOpen,
  ShieldAlert,
} from 'lucide-react';

interface SetupWizardProps {
  onSetupComplete: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onSetupComplete }) => {
  const [setupMode, setSetupMode] = useState<'fresh' | 'migrate'>('fresh');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Migration / Recovery State
  const [recoveryCode, setRecoveryCode] = useState('');
  const [migrationBackupPath, setMigrationBackupPath] = useState<string | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationSuccess, setMigrationSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InitialSetupInput>({
    resolver: zodResolver(InitialSetupSchema),
    defaultValues: {
      hospitalName: 'Capital Diagnostic & Clinical Laboratory',
      tagline: 'Pathology & Diagnostic Center',
      address: 'Plot 14-B, Medical Enclave, Sector G-8, Islamabad',
      phonePrimary: '+92-51-2856401',
      phoneSecondary: '+92-300-5550192',
      email: 'lab.director@capitaldiagnostic.pk',
      currencyCode: 'PKR',
      timezone: 'Asia/Karachi',
      inactivityTimeoutMinutes: 15,
      adminUsername: 'admin',
      adminFullName: 'Chief Medical Technologist',
      adminPassword: '',
    },
  });

  const onSubmit = async (data: InitialSetupInput) => {
    setIsSubmitting(true);
    setServerError(null);

    try {
      const response = await window.electronAPI.auth.setup(data);
      if (!response.success) {
        setServerError(response.error || 'Setup failed. Please check your inputs.');
        setIsSubmitting(false);
        return;
      }
      onSetupComplete();
    } catch (err: any) {
      setServerError(err?.message || 'An unexpected error occurred during initial configuration.');
      setIsSubmitting(false);
    }
  };

  const handleSelectMigrationFile = async () => {
    try {
      const res = await window.electronAPI.restore.selectFile();
      if (res.success && res.data) {
        setMigrationBackupPath(res.data);
      }
    } catch (err: any) {
      setMigrationError('Failed to select database file: ' + (err?.message || String(err)));
    }
  };

  const handleExecuteMigration = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitized = recoveryCode.replace(/[^a-fA-F0-9]/g, '');
    if (sanitized.length !== 64) {
      setMigrationError('Emergency Recovery Key must be 64 hexadecimal characters (e.g. 7461-618A-6415-...).');
      return;
    }

    setIsMigrating(true);
    setMigrationError(null);

    try {
      const res = await window.electronAPI.auth.restoreWithKey({
        recoveryKey: recoveryCode.trim(),
        dbBackupPath: migrationBackupPath || undefined,
      });

      if (!res.success) {
        setMigrationError(res.error || 'Failed to decrypt database with this key.');
        setIsMigrating(false);
        return;
      }

      setMigrationSuccess(true);
      setTimeout(() => {
        onSetupComplete();
      }, 1200);
    } catch (err: any) {
      setMigrationError(err?.message || 'Database recovery failed.');
      setIsMigrating(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row bg-slate-900 overflow-hidden select-text">
      {/* LEFT PANEL: Professional Clinical Branding & Architecture Highlights (Fixed) */}
      <div className="md:w-5/12 lg:w-4/12 bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 text-white p-8 md:p-10 flex flex-col justify-between border-r border-slate-800 shadow-2xl shrink-0 overflow-y-auto">
        <div>
          {/* App Header Logo */}
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-brand-500 text-white flex items-center justify-center font-bold shadow-lg shadow-brand-500/30 shrink-0">
              <Activity className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">
                Clinical Laboratory
              </h1>
              <p className="text-xs text-brand-300 font-medium">Management & Recordkeeping System</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/20 border border-brand-500/30 text-brand-300 text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            First-Run Workstation Setup
          </div>

          <p className="text-xs text-slate-300 leading-relaxed mb-8">
            Welcome to the laboratory desktop system. Configure your facility identity and initial administrator account to initialize your encrypted local database.
          </p>

          {/* Architectural Feature Cards */}
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                <WifiOff className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">100% Offline Air-Gapped</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Zero cloud databases, remote dependencies, or internet telemetry. Operates completely offline.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Encrypted SQLite Engine</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Database encrypted with 256-bit AES cipher. Protected locally by Windows DPAPI key vault.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Minor Currency Units</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Configured for Pakistan Rupee (PKR paisa) to prevent floating-point calculation errors.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">scrypt Password Protection</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Constant-time verification with brute-force lockout after 5 failed attempts.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom System Signature */}
        <div className="pt-6 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span>System Version 1.0.0</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Engine Verified
          </span>
        </div>
      </div>

      {/* RIGHT PANEL: Scrollable Form with Clean Desktop Styling */}
      <div className="flex-1 h-screen overflow-y-auto bg-slate-50 p-6 md:p-10 lg:p-12">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Form Header & Mode Switcher */}
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {setupMode === 'fresh' ? 'Facility & Operator Setup' : 'Restore from Backup / Migrate PC'}
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                {setupMode === 'fresh'
                  ? 'Configure your laboratory identity and master administrator login credentials to initialize a new local database.'
                  : 'Restore your existing encrypted laboratory database and bind it to this Windows PC using your Emergency Recovery Key.'}
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex p-1 bg-slate-200/80 rounded-xl max-w-md border border-slate-300/60 shadow-inner">
              <button
                type="button"
                onClick={() => setSetupMode('fresh')}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  setupMode === 'fresh'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-4 h-4 text-brand-600" />
                New Laboratory Setup
              </button>
              <button
                type="button"
                onClick={() => setSetupMode('migrate')}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  setupMode === 'migrate'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-4 h-4 text-amber-600" />
                Migrate / Enter Recovery Key
              </button>
            </div>
          </div>

          {setupMode === 'fresh' ? (
            <>
              {serverError && (
                <Alert type="error" title="Setup Initialization Error">
                  {serverError}
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                {/* Section 1: Laboratory Profile */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-6 md:p-8 shadow-sm space-y-6">
                  <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 text-slate-900 font-bold text-sm">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Laboratory & Facility Profile</h3>
                      <p className="text-xs font-normal text-slate-500">Official lab details printed on diagnostic reports & invoices</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      <Input
                        label="Laboratory / Hospital Name"
                        required
                        placeholder="e.g. Capital Diagnostic & Clinical Laboratory"
                        error={errors.hospitalName?.message}
                        {...register('hospitalName')}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Input
                        label="Tagline / Department Subtitle"
                        placeholder="e.g. Pathology & Diagnostic Center"
                        error={errors.tagline?.message}
                        {...register('tagline')}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Input
                        label="Laboratory Physical Address"
                        required
                        placeholder="Street address, sector, city"
                        error={errors.address?.message}
                        {...register('address')}
                      />
                    </div>

                    <div>
                      <Input
                        label="Primary Contact Phone"
                        required
                        placeholder="+92-51-XXXXXXX"
                        error={errors.phonePrimary?.message}
                        {...register('phonePrimary')}
                      />
                    </div>

                    <div>
                      <Input
                        label="Secondary Contact Phone"
                        placeholder="+92-300-XXXXXXX (Optional)"
                        error={errors.phoneSecondary?.message}
                        {...register('phoneSecondary')}
                      />
                    </div>

                    <div>
                      <Input
                        label="Official Laboratory Email"
                        placeholder="lab@facility.pk (Optional)"
                        error={errors.email?.message}
                        {...register('email')}
                      />
                    </div>

                    <div>
                      <Input
                        label="Billing Currency"
                        disabled
                        helperText="Configured as PKR (stored in minor unit paisa)"
                        error={errors.currencyCode?.message}
                        {...register('currencyCode')}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Master Operator Account */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-6 md:p-8 shadow-sm space-y-6">
                  <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 text-slate-900 font-bold text-sm">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Master Operator Account (Initial Administrator)</h3>
                      <p className="text-xs font-normal text-slate-500">The primary operator account for this offline computer</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <Input
                        label="Operator Full Name"
                        required
                        placeholder="e.g. Dr. Muhammad Tariq"
                        error={errors.adminFullName?.message}
                        {...register('adminFullName')}
                      />
                    </div>

                    <div>
                      <Input
                        label="Login Username"
                        required
                        placeholder="e.g. admin or technologist"
                        helperText="Case-insensitive login name"
                        error={errors.adminUsername?.message}
                        {...register('adminUsername')}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Input
                        type="password"
                        label="Account Password"
                        required
                        placeholder="Enter at least 8 characters"
                        helperText="Hashed with scrypt & random cryptographic salt (never stored in plaintext)"
                        error={errors.adminPassword?.message}
                        {...register('adminPassword')}
                      />
                    </div>

                    <div>
                      <Input
                        type="number"
                        label="Screen Auto-Lock Timeout (Minutes)"
                        helperText="Automatically locks workstation on inactivity"
                        error={errors.inactivityTimeoutMinutes?.message}
                        {...register('inactivityTimeoutMinutes', { valueAsNumber: true })}
                      />
                    </div>

                    <div>
                      <Input
                        label="Local Timezone"
                        disabled
                        helperText="Configured as Asia/Karachi (Pakistan Standard Time)"
                        error={errors.timezone?.message}
                        {...register('timezone')}
                      />
                    </div>
                  </div>
                </div>

                {/* Security Notice */}
                <Alert type="warning" title="Windows DPAPI Operational Notice">
                  The database master key is securely bound to this Windows user account via Windows DPAPI. Ensure regular Windows system backups per medical regulatory standards.
                </Alert>

                {/* Prominent Action Button (Always scrollable and visible) */}
                <div className="pt-2 pb-12">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full py-4 text-base shadow-lg shadow-brand-500/25 bg-brand-500 hover:bg-brand-600"
                    isLoading={isSubmitting}
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Initialize Laboratory System & Open Workspace
                  </Button>
                </div>
              </form>
            </>
          ) : (
            /* ============================================================== */
            /* MIGRATION & EMERGENCY KEY RESTORE MODE                         */
            /* ============================================================== */
            <div className="space-y-6">
              {migrationError && (
                <Alert type="error" title="Database Restoration Failed">
                  {migrationError}
                </Alert>
              )}

              {migrationSuccess && (
                <Alert type="success" title="Workstation Unlocked & Bound Successfully!">
                  The encrypted database has been verified and bound to this computer's Windows DPAPI vault. Opening laboratory workspace...
                </Alert>
              )}

              <form onSubmit={handleExecuteMigration} className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200/90 p-6 md:p-8 shadow-sm space-y-6">
                  <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 text-slate-900 font-bold text-sm">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Emergency Recovery Key (64-Character Hex)</h3>
                      <p className="text-xs font-normal text-slate-500">
                        Paste the Emergency Recovery Code from your previous computer
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Emergency Recovery Key Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                      className="w-full px-3.5 py-3 rounded-xl border border-slate-300 font-mono text-sm tracking-wider uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-amber-50/30"
                    />
                    <p className="text-[11px] text-slate-500">
                      Format: 16 groups of 4 hex characters separated by hyphens (e.g.{' '}
                      <code className="text-amber-700 font-mono">7461-618A-6415-1EFC-...</code>)
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/90 p-6 md:p-8 shadow-sm space-y-6">
                  <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 text-slate-900 font-bold text-sm">
                    <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Database File Source</h3>
                      <p className="text-xs font-normal text-slate-500">
                        Select a backup file (.bak / .db) from USB drive or local disk
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        readOnly
                        value={migrationBackupPath || ''}
                        placeholder="No external file chosen (default AppData database will be used if present)"
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-mono text-slate-700 truncate"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSelectMigrationFile}
                        className="shrink-0 flex items-center gap-1.5 text-xs py-2.5"
                      >
                        <FolderOpen className="w-4 h-4 text-slate-600" />
                        Browse File (.bak / .db)
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      If you have a <code className="text-slate-700 font-mono">.bak</code> backup file on a USB flash drive or external drive, click <strong>Browse File</strong> to select it.
                      If you already manually placed <code className="text-slate-700 font-mono">lms_secure.db</code> in the AppData directory, leave this blank.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-800">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-amber-900 mb-0.5">How Computer Migration Works:</h5>
                    <p className="leading-relaxed">
                      When you click <strong>Unlock Database & Bind to this PC</strong>, this application uses your 64-character master key to decrypt the database, and immediately creates a brand-new <code className="font-mono">vault.enc</code> file sealed with this Windows computer's DPAPI credentials.
                    </p>
                  </div>
                </div>

                <div className="pt-2 pb-12">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full py-4 text-base shadow-lg shadow-amber-500/25 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                    isLoading={isMigrating}
                    disabled={migrationSuccess}
                  >
                    <KeyRound className="w-5 h-5 mr-2" />
                    Unlock Database & Bind to this PC
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
