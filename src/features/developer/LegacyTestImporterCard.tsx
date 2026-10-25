import React, { useState, useEffect, useCallback } from 'react';
import { LegacyTestDetectionResult, LegacyTestImportStats } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import {
  FlaskConical,
  Database,
  FolderOpen,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Trash2,
} from 'lucide-react';

interface LegacyTestImporterCardProps {
  onNavigate?: (tab: any) => void;
}

export const LegacyTestImporterCard: React.FC<LegacyTestImporterCardProps> = ({ onNavigate }) => {
  const [detection, setDetection] = useState<LegacyTestDetectionResult | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [importStats, setImportStats] = useState<LegacyTestImportStats | null>(null);
  const [clearSuccessMsg, setClearSuccessMsg] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkBackupFile = useCallback(async (customPath?: string) => {
    setIsDetecting(true);
    setErrorMsg(null);
    try {
      const res = await window.electronAPI.developer.detectLegacyBackup(customPath);
      if (res.success && res.data) {
        setDetection(res.data);
        if (res.data.filePath) {
          setSelectedFilePath(res.data.filePath);
        }
      } else {
        setErrorMsg(res.error || 'Failed to detect legacy database.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error checking for legacy database file.');
    } finally {
      setIsDetecting(false);
    }
  }, []);

  useEffect(() => {
    checkBackupFile();
  }, [checkBackupFile]);

  // Browse another backup file
  const handleBrowseFile = async () => {
    try {
      const res = await window.electronAPI.developer.selectLegacyFile();
      if (res.success && res.data) {
        setSelectedFilePath(res.data);
        checkBackupFile(res.data);
      }
    } catch (err) {
      console.error('Failed to select file:', err);
    }
  };

  // 1-Click "Add Tests"
  const handleAddTests = async () => {
    setIsImporting(true);
    setErrorMsg(null);
    setImportStats(null);
    setClearSuccessMsg(null);

    try {
      const res = await window.electronAPI.developer.importLegacyTests(selectedFilePath || undefined);
      if (res.success && res.data) {
        setImportStats(res.data);
      } else {
        setErrorMsg(res.error || 'Failed to import tests into database.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error during test catalog import.');
    } finally {
      setIsImporting(false);
    }
  };

  // Clear existing tests and data for fresh start
  const handleClearAllTests = async () => {
    setIsClearing(true);
    setErrorMsg(null);
    setImportStats(null);
    setClearSuccessMsg(null);

    try {
      const res = await window.electronAPI.developer.wipeAllData();
      if (res.success && res.data) {
        setClearSuccessMsg(`Successfully cleared all database data (${res.data.deletedTests} tests, ${res.data.deletedParams} parameters, ${res.data.deletedVisits} visits). Database is 100% fresh from the start.`);
        setShowClearConfirm(false);
      } else {
        setErrorMsg(res.error || 'Failed to clear data.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error while clearing data.');
    } finally {
      setIsClearing(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center font-bold">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              Legacy Test Catalog Importer
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                1-Click Migration
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Read all test definitions, fees, categories, parameters, and normal ranges from the available database and save them directly to the active system.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => checkBackupFile(selectedFilePath || undefined)}
          isLoading={isDetecting}
          className="text-xs shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Re-scan File
        </Button>
      </div>

      {/* Error alert */}
      {errorMsg && <Alert type="error">{errorMsg}</Alert>}

      {/* Clear success alert */}
      {clearSuccessMsg && (
        <div className="p-3 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-800 flex items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-slate-600 shrink-0" />
            <span>{clearSuccessMsg}</span>
          </div>
          <button
            onClick={() => setClearSuccessMsg(null)}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Success banner */}
      {importStats && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-emerald-900">
                Tests Successfully Saved to Current Database!
              </h3>
              <p className="text-xs text-emerald-700">
                All test definitions from the available database have been cleanly imported into your active catalog with full parameter ranges.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-emerald-100 text-xs">
            <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
              <span className="text-slate-500 block text-[11px]">Total Tests</span>
              <span className="font-bold text-emerald-800 text-base">{importStats.totalTests}</span>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
              <span className="text-slate-500 block text-[11px]">Parameters</span>
              <span className="font-bold text-emerald-800 text-base">{importStats.parametersInserted}</span>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
              <span className="text-slate-500 block text-[11px]">Departments</span>
              <span className="font-bold text-emerald-800 text-base">{importStats.departmentsFound}</span>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
              <span className="text-slate-500 block text-[11px]">Newly Created</span>
              <span className="font-bold text-emerald-800 text-base">{importStats.testsInserted}</span>
            </div>
          </div>

          {onNavigate && (
            <div className="pt-1 flex items-center justify-end">
              <Button
                size="sm"
                onClick={() => onNavigate('catalog')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                Go to Test Catalog
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Detection status box */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-800 block">Available Source Database</span>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-xs font-mono text-slate-600 break-all select-all">
                {detection?.filePath || 'Scanning workspace for legacy backup...'}
              </span>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleBrowseFile}
            className="text-xs shrink-0 self-start sm:self-auto"
          >
            <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
            Browse Other File
          </Button>
        </div>

        {/* Stats strip if file detected */}
        {detection?.detected && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-200 text-xs">
            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 block text-[11px]">Database Size</span>
              <span className="font-bold text-slate-900 mt-0.5 block">
                {formatFileSize(detection.fileSize)}
              </span>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 block text-[11px]">Available Tests</span>
              <span className="font-bold text-brand-600 mt-0.5 block text-sm">
                {detection.testsCount} Tests
              </span>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 block text-[11px]">Sub-Parameters</span>
              <span className="font-bold text-brand-600 mt-0.5 block text-sm">
                {detection.parametersCount} Params
              </span>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 block text-[11px]">Departments</span>
              <span className="font-bold text-slate-900 mt-0.5 block text-sm">
                {detection.departmentsCount} Departments
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer with "Clear Existing Tests" and "Add Tests" buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="text-xs text-slate-500 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            {detection?.detected
              ? `Ready to import all ${detection.testsCount} tests with reference ranges in one click.`
              : 'Please ensure a legacy .bak database is present to enable import.'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showClearConfirm ? (
            <div className="flex items-center gap-2 p-1.5 bg-rose-50 border border-rose-200 rounded-lg">
              <span className="text-[11px] text-rose-800 font-semibold px-1">Clear all tests?</span>
              <Button
                size="sm"
                variant="danger"
                isLoading={isClearing}
                onClick={handleClearAllTests}
                className="text-xs py-1 px-2.5 h-7"
              >
                Yes, Delete
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowClearConfirm(false)}
                className="text-xs py-1 px-2 h-7"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={isImporting || isClearing}
              onClick={() => setShowClearConfirm(true)}
              className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5 text-rose-500" />
              Clear Existing Tests
            </Button>
          )}

          <Button
            size="md"
            disabled={!detection?.detected || isImporting || isClearing}
            isLoading={isImporting}
            onClick={handleAddTests}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs px-6 py-2.5 shadow-md shadow-brand-600/20"
          >
            <FlaskConical className="w-4 h-4 mr-2" />
            Add Tests
          </Button>
        </div>
      </div>
    </Card>
  );
};

