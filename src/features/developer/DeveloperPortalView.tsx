import React, { useState, useEffect, useCallback } from 'react';
import {
  BackupInspectionResult,
  RestoreExecutionResult,
  AppInfo,
  DevCurrentDynamicKeyResult,
} from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Alert } from '../../components/common/Alert';
import { formatDateTime } from '../../lib/utils';
import {
  Terminal,
  KeyRound,
  RotateCcw,
  ShieldAlert,
  Copy,
  Check,
  RefreshCw,
  FolderOpen,
  FileCheck2,
  FileWarning,
  Lock,
  ArrowLeft,
  Activity,
  HardDrive,
  Database,
} from 'lucide-react';

import { LegacyTestImporterCard } from './LegacyTestImporterCard';

interface DeveloperPortalViewProps {
  onNavigate?: (tab: any) => void;
}

export const DeveloperPortalView: React.FC<DeveloperPortalViewProps> = ({ onNavigate }) => {
  // Developer Authentication Gate
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Dynamic Key State
  const [dynamicKeyData, setDynamicKeyData] = useState<DevCurrentDynamicKeyResult | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isLoadingKey, setIsLoadingKey] = useState(false);

  // Restore State
  const [restoreFilePath, setRestoreFilePath] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<BackupInspectionResult | null>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<RestoreExecutionResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Diagnostics State
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  const fetchDynamicKey = useCallback(async () => {
    setIsLoadingKey(true);
    try {
      const res = await window.electronAPI.developer.getCurrentDynamicKey();
      if (res.success && res.data) {
        setDynamicKeyData(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch dynamic key:', err);
    } finally {
      setIsLoadingKey(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDynamicKey();
      window.electronAPI.app.getInfo().then((res) => {
        if (res.success && res.data) {
          setAppInfo(res.data);
        }
      });
    }
  }, [isAuthenticated, fetchDynamicKey]);

  // Auth Submit
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await window.electronAPI.developer.validatePassword(inputPassword);
      if (res.success && res.data === true) {
        setIsAuthenticated(true);
      } else {
        setAuthError('Incorrect Developer Master Password. Access Denied.');
      }
    } catch {
      setAuthError('Authentication verification failed.');
    }
  };

  // 1-Click Copy Key
  const handleCopyDynamicKey = () => {
    if (dynamicKeyData?.key) {
      navigator.clipboard.writeText(dynamicKeyData.key);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    }
  };

  // Restore Handlers
  const handleSelectRestoreFile = async () => {
    try {
      const res = await window.electronAPI.restore.selectFile();
      if (res.success && res.data) {
        handleInspectFile(res.data);
      }
    } catch (err) {
      console.error('Failed to select file:', err);
    }
  };

  const handleInspectFile = async (filePath: string) => {
    setRestoreFilePath(filePath);
    setIsInspecting(true);
    setInspectionResult(null);
    setRestoreError(null);
    setRestoreSuccess(null);
    setConfirmationText('');

    try {
      const res = await window.electronAPI.restore.inspectFile(filePath);
      if (res.success && res.data) {
        setInspectionResult(res.data);
      } else {
        setRestoreError(res.error || 'Failed to inspect candidate backup file.');
      }
    } catch (err: any) {
      setRestoreError(err?.message || 'Inspection error.');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreFilePath || confirmationText.trim().toUpperCase() !== 'RESTORE') {
      return;
    }

    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(null);

    try {
      const res = await window.electronAPI.restore.execute({
        filePath: restoreFilePath,
      });

      if (res.success && res.data) {
        setRestoreSuccess(res.data);
      } else {
        setRestoreError(res.error || 'Database restoration failed.');
      }
    } catch (err: any) {
      setRestoreError(err?.message || 'Critical restoration error occurred.');
    } finally {
      setIsRestoring(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Gate Modal if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-white shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Developer Portal Authentication</h2>
              <p className="text-xs text-slate-400 mt-0.5">Enter developer master password to continue</p>
            </div>
          </div>

          {authError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Developer Master Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  autoFocus
                  required
                  placeholder="Enter password..."
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard')}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Return to Dashboard
                </button>
              )}
              <Button
                type="submit"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs ml-auto"
              >
                Unlock Developer Portal
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Terminal className="w-6 h-6 text-amber-600" />
              Developer & Database Recovery Portal
            </h1>
            <Badge variant="warning" className="text-[10px]">Privileged Access</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Restricted developer console for dynamic hourly key generation, disaster database restorations, and core schema verification.
          </p>
        </div>

        {onNavigate && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate('dashboard')}
            className="text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to Application
          </Button>
        )}
      </div>

      {/* ============================================================== */}
      {/* SECTION 1: DYNAMIC HOURLY AUTHORIZATION KEY GENERATOR           */}
      {/* ============================================================== */}
      <Card className="p-6 bg-slate-950 text-white border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Current Hour Dynamic Backup Key
                {dynamicKeyData && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-mono">
                    Hour: {dynamicKeyData.currentHourStr}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                100-character time-bound authorization key required by the operator to create a database backup.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={fetchDynamicKey}
            isLoading={isLoadingKey}
            className="text-xs bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh Key
          </Button>
        </div>

        {/* 100-Digit Key Display Box */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs sm:text-sm tracking-wider text-amber-400 font-bold select-all break-all text-center">
          {dynamicKeyData?.key || 'Generating dynamic authorization key...'}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span>Key Validity:</span>
            <span className="font-bold text-amber-400 font-mono">
              {dynamicKeyData ? `${dynamicKeyData.minutesRemaining} minutes remaining in current hour` : '—'}
            </span>
            <span className="text-slate-500">(Expires automatically at next hour)</span>
          </div>

          <Button
            size="sm"
            onClick={handleCopyDynamicKey}
            disabled={!dynamicKeyData}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs py-2 px-4 shadow-lg shadow-amber-600/20"
          >
            {isCopied ? <Check className="w-4 h-4 mr-1.5 text-emerald-300" /> : <Copy className="w-4 h-4 mr-1.5" />}
            {isCopied ? '100-Digit Key Copied!' : 'Copy 100-Digit Key'}
          </Button>
        </div>
      </Card>

      {/* ============================================================== */}
      {/* SECTION 2: LEGACY TEST CATALOG 1-CLICK IMPORTER                 */}
      {/* ============================================================== */}
      <LegacyTestImporterCard onNavigate={onNavigate} />

      {/* ============================================================== */}
      {/* SECTION 3: CONTROLLED DATABASE RESTORATION ENGINE               */}
      {/* ============================================================== */}
      <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-rose-600" />
            Disaster Database Restoration Desk
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Safely inspect and replace active database records from a verified `.db` backup snapshot with automatic pre-restore safety rollbacks.
          </p>
        </div>

        {restoreSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs">
            <span className="font-bold text-emerald-900 block text-sm">Database Restored Successfully!</span>
            <p className="text-emerald-700">
              The active clinical database has been cleanly replaced. An emergency safety rollback snapshot was preserved at:
            </p>
            <code className="block p-2 bg-white rounded border border-emerald-200 font-mono text-[11px] text-emerald-800 break-all select-all">
              {restoreSuccess.preRestoreSnapshotPath}
            </code>
            <Button
              size="sm"
              onClick={() => window.location.reload()}
              className="mt-2 text-xs"
            >
              Reload Application Workspace
            </Button>
          </div>
        )}

        {restoreError && <Alert type="error">{restoreError}</Alert>}

        {/* Step 1: Browse File */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">Step 1: Select Candidate Backup File (.db)</span>
              <span className="text-xs text-slate-500 font-mono mt-0.5 block break-all">
                {restoreFilePath || 'No backup file selected yet'}
              </span>
            </div>

            <Button size="sm" variant="outline" onClick={handleSelectRestoreFile} className="text-xs shrink-0">
              <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
              Browse File (.db)
            </Button>
          </div>

          {isInspecting && (
            <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t border-slate-200">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600" />
              <span>Decrypting and validating candidate backup file...</span>
            </div>
          )}
        </div>

        {/* Step 2: Inspection Results */}
        {inspectionResult && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-brand-600" />
              Step 2: Pre-Flight Integrity & Record Counts
            </h3>

            {!inspectionResult.isValid ? (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{inspectionResult.error || 'The selected backup file is corrupted or invalid.'}</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Facility Name</span>
                    <span className="font-bold text-slate-900 mt-0.5 block truncate">
                      {inspectionResult.metadata?.hospitalName}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Schema Version</span>
                    <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                      v{inspectionResult.metadata?.schemaVersion}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Patient Records</span>
                    <span className="font-bold text-brand-600 mt-0.5 block">
                      {inspectionResult.metadata?.totalPatients}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Invoices Billed</span>
                    <span className="font-bold text-brand-600 mt-0.5 block">
                      {inspectionResult.metadata?.totalInvoices}
                    </span>
                  </div>
                </div>

                {/* Step 3: Confirmation */}
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-rose-900">Step 3: Double-Lock Restore Confirmation</h4>
                    <p className="text-[11px] text-rose-700 mt-0.5">
                      Type the word <strong className="font-mono text-rose-900">RESTORE</strong> below to replace the active database.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <input
                      type="text"
                      value={confirmationText}
                      onChange={(e) => setConfirmationText(e.target.value)}
                      placeholder="Type RESTORE to confirm..."
                      className="px-3 py-1.5 rounded-lg border border-rose-300 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-rose-400"
                    />

                    <Button
                      variant="danger"
                      size="sm"
                      disabled={confirmationText.trim().toUpperCase() !== 'RESTORE' || isRestoring}
                      isLoading={isRestoring}
                      onClick={handleExecuteRestore}
                      className="text-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Execute Safe Restoration
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ============================================================== */}
      {/* SECTION 3: SYSTEM DIAGNOSTICS & CORE SCHEMA                    */}
      {/* ============================================================== */}
      <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600" />
          Workstation & Database Engine Diagnostics
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block">Schema Version</span>
            <span className="font-mono font-bold text-slate-900 mt-0.5 block">
              v{appInfo?.schemaVersion || 7}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block">Database Encryption</span>
            <span className="font-bold text-emerald-700 mt-0.5 block">
              AES-256 (Active)
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block">Application Version</span>
            <span className="font-mono font-semibold text-slate-800 mt-0.5 block">
              v{appInfo?.version || '1.0.0'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-500 block">Environment</span>
            <span className="font-semibold text-slate-800 mt-0.5 block">
              {appInfo?.isOffline ? '100% Offline Air-Gapped' : 'Production'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};

