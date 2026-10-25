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
  FolderOpen,
  CheckCircle2,
  Clock,
  Archive,
  RefreshCw,
  FolderUp,
  Trash2,
} from 'lucide-react';

export const BackupRestoreView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'backup' | 'archives'>('backup');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  // Backup State
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Purge Older Backups Confirmation Modal State
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeSuccessMessage, setPurgeSuccessMessage] = useState<string | null>(null);

  // Local Archives State
  const [localBackups, setLocalBackups] = useState<BackupMetadata[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(false);

  // Fetch Backups List
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

  // Initial Load: App Info & Persistent Default Backup Path
  useEffect(() => {
    window.electronAPI.app.getInfo().then((res) => {
      if (res.success && res.data) {
        setAppInfo(res.data);
      }
    });

    window.electronAPI.settings.getHospital().then((res) => {
      if (res.success && res.data?.default_backup_path) {
        setSelectedDestination(res.data.default_backup_path);
        fetchLocalBackups(res.data.default_backup_path);
      } else {
        fetchLocalBackups();
      }
    });
  }, [fetchLocalBackups]);

  // Handle Destination Selection & Automatically Save as Persistent Default
  const handleSelectDestination = async () => {
    try {
      const res = await window.electronAPI.backup.selectDestination();
      if (res.success && res.data) {
        const chosenPath = res.data;
        setSelectedDestination(chosenPath);

        // Permanently persist in hospital settings database
        await window.electronAPI.backup.setDefaultPath(chosenPath);

        // Immediately refresh list from this folder
        fetchLocalBackups(chosenPath);
      }
    } catch (err) {
      console.error('Failed to select destination:', err);
    }
  };

  // Handle Create Backup
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setBackupError(null);
    setBackupResult(null);
    setPurgeSuccessMessage(null);

    try {
      const res = await window.electronAPI.backup.create({
        destinationDir: selectedDestination || undefined,
      });

      if (res.success && res.data) {
        setBackupResult(res.data);
        await fetchLocalBackups(selectedDestination || undefined);
        // Directly open confirmation modal asking if older backups should be removed
        setShowPurgeModal(true);
      } else {
        setBackupError(res.error || 'Failed to create database backup.');
      }
    } catch (err: any) {
      setBackupError(err?.message || 'Error occurred during backup execution.');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Handle Confirming Purge of Older Backups
  const handleConfirmPurge = async () => {
    setIsPurging(true);
    try {
      const res = await window.electronAPI.backup.purgeOlder({
        destinationDir: selectedDestination || undefined,
        keepFileName: backupResult?.fileName,
      });

      if (res.success && res.data) {
        setPurgeSuccessMessage(
          res.data.deletedCount > 0
            ? `Successfully removed ${res.data.deletedCount} older backup file(s). Only your newest backup is kept.`
            : 'No older backup files found to delete.'
        );
        fetchLocalBackups(selectedDestination || undefined);
      }
    } catch (err) {
      console.error('Failed to purge older backups:', err);
    } finally {
      setIsPurging(false);
      setShowPurgeModal(false);
    }
  };

  const handleDismissPurgeModal = () => {
    setShowPurgeModal(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-brand-600" />
          Database Backup
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Create and manage verified database backups to safeguard clinical records.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('backup')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'backup'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FolderUp className="w-4 h-4" />
            Create Backup
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
            Backup History ({localBackups.length})
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: CREATE BACKUP                                           */}
      {/* ============================================================== */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {backupError && <Alert type="error">{backupError}</Alert>}
          {purgeSuccessMessage && <Alert type="info">{purgeSuccessMessage}</Alert>}

          <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Create Complete Database Backup</h2>
              <p className="text-xs text-slate-500 mt-1">
                Generates a verified backup of all patient records, test results, invoices, and system settings.
              </p>
            </div>

            {/* Destination Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                Backup Destination Folder
              </label>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700 truncate select-all">
                  {selectedDestination || 'Default Local Storage (Computer AppData Backups Folder)'}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectDestination}
                  className="text-xs shrink-0 py-2.5"
                >
                  <FolderOpen className="w-4 h-4 mr-1.5 text-brand-600" />
                  Choose Folder
                </Button>
              </div>

              <p className="text-[11px] text-slate-400">
                Selected folder is automatically remembered for all future backups.
              </p>
            </div>

            {/* Action Row */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3">
              <Button
                variant="primary"
                onClick={handleCreateBackup}
                isLoading={isCreatingBackup}
                disabled={isCreatingBackup}
                className="bg-brand-600 hover:bg-brand-700 text-xs px-6 py-2.5 font-bold shadow-sm"
              >
                <Archive className="w-4 h-4 mr-2" />
                {isCreatingBackup ? 'Creating Backup...' : 'Create Backup Now'}
              </Button>

              <span className="text-xs text-slate-400">
                Timestamped with exact second for unique tracking.
              </span>
            </div>

            {/* Success Details Card */}
            {backupResult && (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Backup Created and Verified Successfully</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-slate-700">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Filename</span>
                    <span className="font-mono font-bold text-slate-900">{backupResult.fileName}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">Size</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatFileSize(backupResult.fileSize)}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block text-[11px]">Full Path</span>
                    <span className="font-mono text-slate-800 break-all select-all">
                      {backupResult.filePath}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block text-[11px]">Digital Verification Hash (SHA-256)</span>
                    <span className="font-mono text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-emerald-200 block break-all select-all">
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
      {/* TAB 2: BACKUP HISTORY                                          */}
      {/* ============================================================== */}
      {activeTab === 'archives' && (
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Saved Backup History</h2>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>Active Folder:</span>
                <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 break-all">
                  {selectedDestination || 'Default Local Storage (AppData)'}
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
                Refresh
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">Backup Filename</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">File Size</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {localBackups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Archive className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-700">No Backups Found in This Folder</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Click "Create Backup" tab to create your first database archive.
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
                            Safety Snapshot
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
                          Verified
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
      {/* CONFIRMATION MODAL: PURGE OLDER BACKUPS                        */}
      {/* ============================================================== */}
      {showPurgeModal && backupResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delete Older Backups?</h3>
                  <p className="text-xs text-slate-500">Save disk space and keep your folder organized</p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1 text-xs">
                <span className="text-slate-500 block text-[11px]">Latest Fresh Backup:</span>
                <span className="font-mono font-bold text-slate-900 block truncate">
                  {backupResult.fileName}
                </span>
                <span className="text-slate-500 text-[11px] block">
                  Size: {formatFileSize(backupResult.fileSize)}
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Since you now have an up-to-date, verified backup, would you like to delete older backup files in this folder?
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismissPurgeModal}
                disabled={isPurging}
                className="text-xs"
              >
                Keep All Backups
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmPurge}
                isLoading={isPurging}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Yes, Delete Older Backups
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
