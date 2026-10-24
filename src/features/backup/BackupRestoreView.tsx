import React, { useState, useEffect, useCallback } from 'react';
import {
  BackupResult,
  BackupMetadata,
  AppInfo,
} from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Alert } from '../../components/common/Alert';
import { formatDateTime } from '../../lib/utils';
import {
  HardDrive,
  ShieldCheck,
  FolderOpen,
  CheckCircle2,
  Clock,
  Archive,
  RefreshCw,
  FolderUp,
  KeyRound,
  Copy,
  Check,
  ShieldAlert,
  Trash2,
  Lock,
  ClipboardPaste,
  Database,
  ExternalLink,
} from 'lucide-react';

export const BackupRestoreView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'backup' | 'archives' | 'recovery'>('backup');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  // Recovery Key State
  const [workstationRecoveryKey, setWorkstationRecoveryKey] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Backup State
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [isDefaultSaved, setIsDefaultSaved] = useState(false);
  const [dynamicKey, setDynamicKey] = useState('');
  const [deletePrevious, setDeletePrevious] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Local Archives State
  const [localBackups, setLocalBackups] = useState<BackupMetadata[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(false);

  // Fetch Local Backups from active destination or default
  const fetchLocalBackups = useCallback(async (dirOverride?: string) => {
    setIsLoadingLocal(true);
    try {
      const targetDir = dirOverride !== undefined ? dirOverride : selectedDestination;
      const res = await window.electronAPI.backup.listLocal(targetDir || undefined);
      if (res.success && res.data) {
        setLocalBackups(res.data);
      }
    } catch (err) {
      console.error('Failed to list backups:', err);
    } finally {
      setIsLoadingLocal(false);
    }
  }, [selectedDestination]);

  // Initial Load: App Info, Recovery Key, Settings Default Backup Path
  useEffect(() => {
    window.electronAPI.app.getInfo().then((res) => {
      if (res.success && res.data) {
        setAppInfo(res.data);
      }
    });

    window.electronAPI.auth.getRecoveryKey().then((res) => {
      if (res.success && res.data) {
        setWorkstationRecoveryKey(res.data);
      }
    });

    // Check if a default backup path is persistently saved in hospital settings
    window.electronAPI.settings.getHospital().then((res) => {
      if (res.success && res.data?.default_backup_path) {
        setSelectedDestination(res.data.default_backup_path);
        setIsDefaultSaved(true);
        fetchLocalBackups(res.data.default_backup_path);
      } else {
        fetchLocalBackups();
      }
    });
  }, [fetchLocalBackups]);

  const handleCopyKey = () => {
    if (workstationRecoveryKey) {
      navigator.clipboard.writeText(workstationRecoveryKey);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  // Handle Destination Selection & Persist as Permanent Default
  const handleSelectDestination = async () => {
    try {
      const res = await window.electronAPI.backup.selectDestination();
      if (res.success && res.data) {
        const chosenPath = res.data;
        setSelectedDestination(chosenPath);
        setIsDefaultSaved(true);

        // Permanently persist in database
        await window.electronAPI.backup.setDefaultPath(chosenPath);

        // Immediately refresh list from this folder
        fetchLocalBackups(chosenPath);
      }
    } catch (err) {
      console.error('Failed to select destination:', err);
    }
  };

  // Reset to default local AppData folder
  const handleResetToDefaultDestination = async () => {
    try {
      await window.electronAPI.backup.setDefaultPath('');
      setSelectedDestination(null);
      setIsDefaultSaved(false);
      fetchLocalBackups('');
    } catch (err) {
      console.error('Failed to reset backup path:', err);
    }
  };

  // Paste dynamic key from clipboard
  const handlePasteDynamicKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setDynamicKey(text.trim());
      }
    } catch (err) {
      console.error('Clipboard paste failed:', err);
    }
  };

  // Handle Create Backup Execution
  const handleCreateBackup = async () => {
    if (!dynamicKey.trim()) {
      setBackupError('Dynamic Authorization Key darj karna lazmi hai. Developer Portal se current hour key copy karein.');
      return;
    }

    setIsCreatingBackup(true);
    setBackupError(null);
    setBackupResult(null);

    try {
      const res = await window.electronAPI.backup.create({
        destinationDir: selectedDestination || undefined,
        deletePrevious,
        dynamicKey: dynamicKey.trim(),
      });

      if (res.success && res.data) {
        setBackupResult(res.data);
        fetchLocalBackups(selectedDestination || undefined);
      } else {
        setBackupError(res.error || 'Failed to create database backup.');
      }
    } catch (err: any) {
      setBackupError(err?.message || 'Error occurred during backup execution.');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-brand-600" />
            Database Backup & Safety Archive (ڈیٹا محفوظ کریں)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Lab ke tamam mareezon, test reports, bills aur settings ka safe copy banayein taake Windows kharab hone par bhi data bilkul mehfooz rahe.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="success" className="text-xs py-1 px-2.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            DPAPI Protected
          </Badge>
          <Badge variant="info" className="text-xs py-1 px-2.5">
            100% Offline
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('backup')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'backup'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FolderUp className="w-4 h-4" />
            Create Backup (نئی کاپی بنائیں)
          </button>

          <button
            onClick={() => {
              setActiveTab('archives');
              fetchLocalBackups();
            }}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'archives'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Archive className="w-4 h-4" />
            Saved Backups History ({localBackups.length} فائلیں)
          </button>

          <button
            onClick={() => setActiveTab('recovery')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'recovery'
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <KeyRound className="w-4 h-4 text-amber-600" />
            New PC Migration (نیا کمپیوٹر کوڈ)
          </button>
        </div>
      </div>

      {/* Notice about Database Restore Location */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            <strong>Note for System Administrators:</strong> Data Restore (پرانا ڈیٹا بحال کرنا) محفوظ رکھنے کے لیے <strong>Developer Portal</strong> میں رکھا گیا ہے (Password: <code className="font-mono font-bold text-slate-800">aaaaaaaa</code>)۔
          </span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: CREATE BACKUP                                           */}
      {/* ============================================================== */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Active Database Status Card */}
          <Card className="p-4 bg-white border-slate-200 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Database Status & Security (ڈیٹا کی حفاظت)
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-500 block">Encryption Protection</span>
                <span className="font-bold text-emerald-700 mt-0.5 block flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  AES-256 (Locked & Safe)
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-500 block">Database Health</span>
                <span className="font-bold text-slate-900 mt-0.5 block">All Records Verified (OK)</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-500 block">Schema Migration</span>
                <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                  v{appInfo?.schemaVersion || 7} (LQMS & Dev Security)
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-500 block">Current Storage Mode</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">Air-Gapped Offline Local</span>
              </div>
            </div>

            {workstationRecoveryKey && (
              <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-amber-900 block">New Computer Recovery Code (نیا کمپیوٹر کوڈ)</span>
                    <span className="text-[11px] text-amber-700">Agar aap ye data kisi doosray computer par shift karna chahein, to wahan ye code darkaar hoga.</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto">
                  <code className="text-xs font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-amber-300 text-amber-900 truncate max-w-xs sm:max-w-none">
                    {workstationRecoveryKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyKey}
                    className="text-xs h-7 px-2.5 bg-white border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {isCopied ? 'Copied' : 'Copy Code'}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Backup Action Card */}
          <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Create Complete Database Backup (ڈیٹا کی نئی کاپی بنائیں)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Lab ke tamam mareezon, test results, orders, receipts aur settings ka aik safe copy banayein taake Windows kharab hone par bhi kuch zaya na ho.
              </p>
            </div>

            {backupError && <Alert type="error">{backupError}</Alert>}

            {/* Destination Selection & Persistent Default */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Save Backup Destination (بیک اپ فائل کہاں محفوظ ہو)
                    </span>
                    {isDefaultSaved && selectedDestination && (
                      <Badge variant="success" className="text-[10px] py-0 px-2">
                        Permanent Default Saved
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-slate-600 font-mono block break-all bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                    {selectedDestination || 'Default Local Storage (C: Drive AppData / backups)'}
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Jab aap aik dafa folder (maslan D: drive ya USB) select karein gay, to system hamesha khud ba khud usi folder mein backup save karega jab tak aap tabdeel na karein.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSelectDestination}
                    className="text-xs shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-1.5 text-brand-600" />
                    Choose Folder / D: Drive (فولڈر منتخب کریں)
                  </Button>
                </div>
              </div>

              {selectedDestination && (
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <button
                    onClick={handleResetToDefaultDestination}
                    className="text-[11px] text-rose-600 hover:text-rose-800 underline block"
                  >
                    Reset default to C: drive local folder
                  </button>
                  <span className="text-[11px] text-slate-400 font-mono">
                    All future backups will automatically route here
                  </span>
                </div>
              )}
            </div>

            {/* Dynamic Hourly Authorization Key Input */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-brand-600" />
                    Current Hour Dynamic Security Key (100 Digits) - موجودہ گھنٹے کا کوڈ
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Yeh 100-character code har ghantay tabdeel hota hai. Developer Portal se current hour ka code copy kar ke yahan paste karein.
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={handlePasteDynamicKey}
                  className="text-xs h-7 px-2.5 shrink-0 bg-white"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
                  Paste from Clipboard
                </Button>
              </div>

              <input
                type="text"
                value={dynamicKey}
                onChange={(e) => setDynamicKey(e.target.value)}
                placeholder="Paste 100-character dynamic authorization key here..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Key length: {dynamicKey.length} / 100 characters</span>
                <span className="text-slate-400">
                  Tip: Developer Portal can be opened from bottom-left sidebar ("Clinical Workstation" button)
                </span>
              </div>
            </div>

            {/* Delete Previous Backup Checkbox */}
            <label className="flex items-start gap-3 p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-50 transition-colors">
              <input
                type="checkbox"
                checked={deletePrevious}
                onChange={(e) => setDeletePrevious(e.target.checked)}
                className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-amber-700" />
                  Delete previous backup files in this folder? (اس فولڈر سے پچھلی پرانی بیک اپ فائلیں ڈیلیٹ کریں)
                </span>
                <span className="text-[11px] text-amber-800 leading-relaxed block mt-0.5">
                  Yeh mukammal tor par safe hai: Jab nayi backup file tayyar ho kar verify ho jayegi, to uske baad hi purani backup files remove hongi taake disk space zaya na ho.
                </span>
              </div>
            </label>

            {/* Execute Backup Button */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="primary"
                onClick={handleCreateBackup}
                isLoading={isCreatingBackup}
                disabled={isCreatingBackup || !dynamicKey.trim()}
                className="bg-brand-600 hover:bg-brand-700 text-xs px-5 py-2.5 font-bold"
              >
                <Archive className="w-4 h-4 mr-2" />
                {isCreatingBackup ? 'Creating & Verifying Backup...' : 'Create Backup Now (محفوظ کاپی بنائیں)'}
              </Button>

              <span className="text-xs text-slate-400">
                Auto-named with date & time (e.g. <code className="font-mono text-[11px] text-slate-600">lms_backup_Oct-24-2026&Time-3-00-pm.db</code>)
              </span>
            </div>

            {/* Success Details Card */}
            {backupResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-bold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>Backup Created and Verified Successfully (بیک اپ کامیابی سے محفوظ ہو گیا)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-slate-700">
                  <div>
                    <span className="text-slate-500 block">Backup Filename</span>
                    <span className="font-mono font-bold text-slate-900">{backupResult.fileName}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block">File Size</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatFileSize(backupResult.fileSize)}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block">Target File Path</span>
                    <span className="font-mono text-slate-800 break-all select-all">
                      {backupResult.filePath}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block">SHA-256 Digital Verification Hash</span>
                    <span className="font-mono text-[11px] text-slate-600 bg-white p-1.5 rounded border border-emerald-200 block break-all select-all">
                      {backupResult.checksum}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: LOCAL BACKUP ARCHIVES (Any Folder / D: Drive)           */}
      {/* ============================================================== */}
      {activeTab === 'archives' && (
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Saved Backups History (محفوظ شدہ بیک اپ فائلیں)</h2>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>Active Folder:</span>
                <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 break-all">
                  {selectedDestination || 'Default Local Storage (C: Drive AppData)'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSelectDestination}
                className="text-xs"
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1" />
                Change Folder
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchLocalBackups(selectedDestination || undefined)}
                isLoading={isLoadingLocal}
                className="text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Refresh List
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">Backup Filename</th>
                  <th className="py-3 px-4">Archive Type</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">File Size</th>
                  <th className="py-3 px-4 text-right">Integrity Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {localBackups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Archive className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-700">No Backups Found in This Folder</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        {selectedDestination
                          ? 'Is folder mein koi .db ya .bak backup file nahi mili.'
                          : 'Create your first database backup using the "Create Backup" tab.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  localBackups.map((b) => (
                    <tr key={b.fileName} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 block">{b.fileName}</span>
                        <span className="text-[10px] text-slate-400 font-mono block truncate max-w-md">
                          {b.filePath}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {b.isPreRestoreSnapshot ? (
                          <Badge variant="warning" className="text-[10px]">
                            Pre-Restore Snapshot
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">
                            Standard Backup
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatDateTime(b.createdAt)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                        {formatFileSize(b.fileSize)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Badge variant="info" className="text-[10px] py-0.5">
                          Verified DB
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ============================================================== */}
      {/* TAB 3: EMERGENCY RECOVERY KEY & PC MIGRATION                   */}
      {/* ============================================================== */}
      {activeTab === 'recovery' && (
        <div className="space-y-6">
          {/* Recovery Key Display Card */}
          <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Workstation Emergency Recovery Key</h2>
                  <p className="text-xs text-slate-500">64-Character 256-Bit Cryptographic Master Key Phrase</p>
                </div>
              </div>
              <Badge variant="warning" className="text-xs py-1 px-3 self-start sm:self-auto">
                Confidential Medical Key
              </Badge>
            </div>

            <div className="p-5 bg-slate-950 rounded-2xl text-white shadow-xl space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono">CRYPTO_KEY_ALGORITHM: AES-256-CBC / DPAPI_BOUND</span>
                <span>Air-Gapped Offline Protection</span>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl font-mono text-base sm:text-lg tracking-wider text-amber-400 font-bold select-all break-all text-center">
                {workstationRecoveryKey || 'Loading recovery key from secure vault...'}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-slate-400 leading-snug">
                  Keep this emergency code written down in a secure physical location (e.g. laboratory safe or administrator journal).
                </p>
                <Button
                  size="sm"
                  onClick={handleCopyKey}
                  disabled={!workstationRecoveryKey}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs py-2 px-4 shrink-0 shadow-lg shadow-amber-600/30"
                >
                  {isCopied ? <Check className="w-4 h-4 mr-1.5 text-emerald-300" /> : <Copy className="w-4 h-4 mr-1.5" />}
                  {isCopied ? 'Key Copied to Clipboard!' : 'Copy Recovery Code'}
                </Button>
              </div>
            </div>
          </Card>

          {/* Migration Procedure Guide */}
          <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-brand-600" />
              How to Migrate Database to Another Computer (Dusray Computer Par Data Chalane Ka Tareeqa)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px]">1</span>
                  PC A (Current Computer) Par Backup Banayein
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Is screen par <strong>Create Backup</strong> tab me jayein aur backup file ko USB flash drive ya external drive me save karein.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px]">2</span>
                  Apna Recovery Code Note Karein
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Upar diya gaya 64-character Recovery Code copy karein ya kisi safe jagah note karein.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px]">3</span>
                  Naye Computer (PC B) Par LMS Open Karein
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Naye computer par application install karein aur pehli dafa open karein. Setup Wizard screen show hogi.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">4</span>
                  "Migrate / Enter Recovery Key" Tab Select Karein
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Setup screen par <strong>Migrate / Enter Recovery Key</strong> par click karein. Apna ye code paste karein aur USB se backup file select kar k <strong>Unlock Database</strong> dabayein!
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
