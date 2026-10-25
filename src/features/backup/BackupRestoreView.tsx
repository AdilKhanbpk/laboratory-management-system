import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BackupResult, BackupMetadata, AppInfo } from '../../types';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatDateTime } from '../../lib/utils';
import { FolderOpen, RefreshCw, Archive } from 'lucide-react';

/*
 * Same tokens as the rest of the app: primary #0F766E / #115E59, page #F5F7FA,
 * text #1F2937, muted #64748B, border #E2E8F0, warning #D97706, error #DC2626,
 * success #15803D. Radius 8px, no shadows.
 */

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const daysSince = (iso: string): number => {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
};

const agoText = (days: number): string =>
  days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;

/** Label above a value, used in the result and status lists. */
const Detail: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({
  label,
  children,
  mono,
}) => (
  <div>
    <dt className="text-xs text-[#64748B]">{label}</dt>
    <dd className={`text-[13px] mt-0.5 break-all ${mono ? 'font-mono text-xs' : ''}`}>{children}</dd>
  </div>
);

export const BackupRestoreView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'backup' | 'archives'>('backup');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(
    null
  );

  const [localBackups, setLocalBackups] = useState<BackupMetadata[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const fetchLocalBackups = useCallback(
    async (dirOverride?: string) => {
      setIsLoadingLocal(true);
      setListError(null);
      try {
        const targetDir = dirOverride !== undefined ? dirOverride : selectedDestination;
        const res = await window.electronAPI.backup.listLocal(targetDir || undefined);
        if (res.success && res.data) {
          setLocalBackups(res.data);
        } else if (!res.success) {
          setListError(res.error || 'Could not read the backup folder.');
        }
      } catch (err: any) {
        console.error('Failed to list backups:', err);
        setListError(err?.message || 'Could not read the backup folder.');
      } finally {
        setIsLoadingLocal(false);
      }
    },
    [selectedDestination]
  );

  useEffect(() => {
    window.electronAPI.app.getInfo().then((res) => {
      if (res.success && res.data) setAppInfo(res.data);
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

  useEffect(() => {
    if (!showPurgeModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPurging) setShowPurgeModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPurgeModal, isPurging]);

  const handleSelectDestination = async () => {
    try {
      const res = await window.electronAPI.backup.selectDestination();
      if (res.success && res.data) {
        const chosenPath = res.data;
        setSelectedDestination(chosenPath);
        await window.electronAPI.backup.setDefaultPath(chosenPath);
        fetchLocalBackups(chosenPath);
      }
    } catch (err) {
      console.error('Failed to select destination:', err);
    }
  };

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setBackupError(null);
    setBackupResult(null);
    setPurgeMessage(null);

    try {
      const res = await window.electronAPI.backup.create({
        destinationDir: selectedDestination || undefined,
      });

      if (res.success && res.data) {
        setBackupResult(res.data);
        await fetchLocalBackups(selectedDestination || undefined);
        setShowPurgeModal(true);
      } else {
        setBackupError(res.error || 'The backup could not be created.');
      }
    } catch (err: any) {
      setBackupError(err?.message || 'Something went wrong while creating the backup.');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleConfirmPurge = async () => {
    setIsPurging(true);
    try {
      const res = await window.electronAPI.backup.purgeOlder({
        destinationDir: selectedDestination || undefined,
        keepFileName: backupResult?.fileName,
      });

      if (res.success && res.data) {
        setPurgeMessage({
          type: 'info',
          text:
            res.data.deletedCount > 0
              ? `Deleted ${res.data.deletedCount} older backup${
                  res.data.deletedCount > 1 ? 's' : ''
                }. Only the newest backup is kept.`
              : 'There were no older backups to delete.',
        });
        fetchLocalBackups(selectedDestination || undefined);
      } else {
        setPurgeMessage({ type: 'error', text: res.error || 'Could not delete the older backups.' });
      }
    } catch (err: any) {
      console.error('Failed to purge older backups:', err);
      setPurgeMessage({
        type: 'error',
        text: err?.message || 'Could not delete the older backups.',
      });
    } finally {
      setIsPurging(false);
      setShowPurgeModal(false);
    }
  };

  // Newest standard backup, for the status panel
  const latest = useMemo(() => {
    const sorted = [...localBackups].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.find((b) => !b.isPreRestoreSnapshot) || null;
  }, [localBackups]);

  const latestAge = latest ? daysSince(latest.createdAt) : null;
  const isStale = latestAge === null || latestAge > 7;
  const totalSize = localBackups.reduce((sum, b) => sum + b.fileSize, 0);
  const folderLabel = selectedDestination || 'Default folder in the app data directory';

  const tabCls = (active: boolean) =>
    `pb-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded-sm ${
      active
        ? 'border-[#0F766E] text-[#0F766E]'
        : 'border-transparent text-[#64748B] hover:text-[#1F2937]'
    }`;

  const th = 'px-3 py-2.5 text-left font-semibold border-r border-[#E2E8F0] last:border-r-0';
  const td = 'px-3 py-2.5 border-r border-[#E2E8F0] last:border-r-0';

  return (
    <div className="max-w-[1200px] text-[#1F2937]">
      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold leading-6">Backup and recovery</h1>
        <p className="text-[13px] text-[#64748B] mt-0.5">
          Save a copy of all patient records, results, invoices and settings.
        </p>
      </div>

      <div className="flex items-center gap-6 border-b border-[#E2E8F0] mb-5" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'backup'}
          onClick={() => setActiveTab('backup')}
          className={tabCls(activeTab === 'backup')}
        >
          Create backup
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'archives'}
          onClick={() => {
            setActiveTab('archives');
            fetchLocalBackups();
          }}
          className={tabCls(activeTab === 'archives')}
        >
          History ({localBackups.length})
        </button>
      </div>

      {/* =========================== CREATE =========================== */}
      {activeTab === 'backup' && (
        <>
          {(backupError || purgeMessage) && (
            <div className="mb-4 space-y-2">
              {backupError && <Alert type="error">{backupError}</Alert>}
              {purgeMessage && <Alert type={purgeMessage.type}>{purgeMessage.text}</Alert>}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
            <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
              {/* Folder */}
              <section className="px-6 py-5 border-b border-[#E2E8F0]">
                <h2 className="text-sm font-semibold">Backup folder</h2>
                <p className="text-[13px] text-[#64748B] mt-0.5">
                  New backups are saved here. Your choice is remembered.
                </p>

                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <div
                    className="flex-1 min-w-0 h-9 px-3 flex items-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-mono text-[#1F2937]"
                    title={folderLabel}
                  >
                    <span className="truncate">{folderLabel}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSelectDestination}
                    className="shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                    Change folder
                  </Button>
                </div>
              </section>

              {/* Create */}
              <section className="px-6 py-5">
                <h2 className="text-sm font-semibold">New backup</h2>
                <p className="text-[13px] text-[#64748B] mt-0.5">
                  The file name includes the date and time, so no backup overwrites another. Each
                  backup is checked after it is written.
                </p>

                <div className="mt-4">
                  <Button
                    variant="primary"
                    onClick={handleCreateBackup}
                    isLoading={isCreatingBackup}
                    disabled={isCreatingBackup}
                    className="bg-[#0F766E] hover:bg-[#115E59]"
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    {isCreatingBackup ? 'Creating backup…' : 'Create backup now'}
                  </Button>
                </div>

                {backupResult && (
                  <div className="mt-5 border border-[#E2E8F0] rounded-lg">
                    <div className="px-4 py-2.5 border-b border-[#E2E8F0] text-[13px] font-semibold text-[#15803D]">
                      Backup created and verified
                    </div>
                    <dl className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      <Detail label="File name" mono>
                        {backupResult.fileName}
                      </Detail>
                      <Detail label="Size">{formatFileSize(backupResult.fileSize)}</Detail>
                      <div className="sm:col-span-2">
                        <Detail label="Saved to" mono>
                          {backupResult.filePath}
                        </Detail>
                      </div>
                      <div className="sm:col-span-2">
                        <Detail label="Checksum (SHA-256)" mono>
                          {backupResult.checksum}
                        </Detail>
                      </div>
                    </dl>
                  </div>
                )}
              </section>
            </div>

            {/* Status */}
            <aside className="bg-white border border-[#E2E8F0] rounded-lg xl:sticky xl:top-4">
              <div className="px-5 py-3 border-b border-[#E2E8F0]">
                <h2 className="text-sm font-semibold">Backup status</h2>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <p className="text-xs text-[#64748B]">Last backup</p>
                  {latest ? (
                    <>
                      <p className="text-[13px] font-medium mt-0.5">
                        {formatDateTime(latest.createdAt)}
                      </p>
                      <p
                        className={`text-xs mt-0.5 ${
                          isStale ? 'text-[#D97706] font-medium' : 'text-[#64748B]'
                        }`}
                      >
                        {agoText(latestAge!)}
                        {isStale && '. Time for a new backup.'}
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] font-medium text-[#D97706] mt-0.5">
                      {isLoadingLocal ? 'Checking…' : 'No backup in this folder yet'}
                    </p>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-4 pt-4 border-t border-[#E2E8F0]">
                  <Detail label="Files in folder">{localBackups.length}</Detail>
                  <Detail label="Space used">{formatFileSize(totalSize)}</Detail>
                </dl>

                <p className="pt-4 border-t border-[#E2E8F0] text-xs text-[#64748B] leading-4">
                  Keep a second copy on a USB drive or another computer. A backup stored only on
                  this computer is lost if the computer fails.
                </p>

                {appInfo && (appInfo as any).version && (
                  <p className="text-xs text-[#64748B]">App version {(appInfo as any).version}</p>
                )}
              </div>
            </aside>
          </div>
        </>
      )}

      {/* =========================== HISTORY =========================== */}
      {activeTab === 'archives' && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-[#64748B]">Folder</p>
              <p className="text-xs font-mono truncate max-w-xl" title={folderLabel}>
                {folderLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleSelectDestination}>
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                Change folder
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchLocalBackups(selectedDestination || undefined)}
                isLoading={isLoadingLocal}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </Button>
            </div>
          </div>

          {listError && (
            <div className="p-3 border-b border-[#E2E8F0]">
              <Alert type="error">{listError}</Alert>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th scope="col" className={th}>File name</th>
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={th}>Created</th>
                  <th scope="col" className={`${th} text-right`}>Size</th>
                </tr>
              </thead>
              <tbody>
                {localBackups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-14 text-center">
                      <p className="font-medium">
                        {isLoadingLocal ? 'Loading…' : 'No backups in this folder'}
                      </p>
                      {!isLoadingLocal && (
                        <p className="text-[#64748B] mt-0.5">
                          Go to Create backup to save the first one.
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  localBackups.map((b) => (
                    <tr
                      key={b.fileName}
                      className="border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC]"
                    >
                      <td className={`${td} font-mono text-xs`} title={b.filePath}>
                        {b.fileName}
                      </td>
                      <td className={td}>
                        {b.isPreRestoreSnapshot ? (
                          <span title="Saved automatically just before a restore">
                            Before restore
                          </span>
                        ) : (
                          'Backup'
                        )}
                      </td>
                      <td className={`${td} text-[#64748B]`}>{formatDateTime(b.createdAt)}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {formatFileSize(b.fileSize)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================== PURGE DIALOG =========================== */}
      {showPurgeModal && backupResult && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Delete older backups"
        >
          <div className="bg-white rounded-lg border border-[#E2E8F0] w-full max-w-md overflow-hidden">
            <div className="px-5 py-4">
              <h3 className="text-base font-semibold">Delete older backups?</h3>
              <p className="text-[13px] text-[#64748B] mt-1">
                Your new backup is saved. You can delete the older ones in this folder to free up
                space. The new backup is kept. This can’t be undone.
              </p>

              <div className="mt-3 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                <p className="text-xs font-mono truncate" title={backupResult.fileName}>
                  {backupResult.fileName}
                </p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {formatFileSize(backupResult.fileSize)}
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPurgeModal(false)}
                disabled={isPurging}
                autoFocus
              >
                Keep all
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmPurge}
                isLoading={isPurging}
                className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              >
                Delete older backups
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};