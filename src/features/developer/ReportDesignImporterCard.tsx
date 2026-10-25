import React, { useState, useEffect, useCallback } from 'react';
import type { SavedTemplateDetectionResult, SavedTemplateSeedResult } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import {
  Palette,
  AlertCircle,
  FolderOpen,
  Sparkles,
  FileCheck2,
  RefreshCw,
  Check,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';

interface ReportDesignImporterCardProps {
  onNavigate?: (tab: any) => void;
}

export const ReportDesignImporterCard: React.FC<ReportDesignImporterCardProps> = ({ onNavigate }) => {
  const [detection, setDetection] = useState<SavedTemplateDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<SavedTemplateSeedResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runDetection = useCallback(async (filePath?: string) => {
    setIsDetecting(true);
    setErrorMsg(null);
    try {
      if (window.electronAPI?.developer?.detectSavedTemplate) {
        const res = await window.electronAPI.developer.detectSavedTemplate(filePath);
        if (res.success && res.data) {
          setDetection(res.data);
          if (!res.data.detected && res.data.error) {
            setErrorMsg(res.data.error);
          }
        } else {
          setErrorMsg(res.error || 'Failed to detect saved report design.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error occurred while detecting saved report design.');
    } finally {
      setIsDetecting(false);
    }
  }, []);

  useEffect(() => {
    runDetection();
  }, [runDetection]);

  const handleSelectFile = async () => {
    try {
      if (window.electronAPI?.developer?.selectTemplateFile) {
        const res = await window.electronAPI.developer.selectTemplateFile();
        if (res.success && res.data) {
          setSelectedFilePath(res.data);
          runDetection(res.data);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to select template file.');
    }
  };

  const handleApplySeed = async () => {
    setIsSeeding(true);
    setErrorMsg(null);
    setSeedResult(null);

    try {
      if (window.electronAPI?.developer?.seedSavedTemplate) {
        const res = await window.electronAPI.developer.seedSavedTemplate(selectedFilePath || undefined);
        if (res.success && res.data) {
          setSeedResult(res.data);
        } else {
          setErrorMsg(res.error || 'Failed to apply saved report design into active database.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error while applying report design.');
    } finally {
      setIsSeeding(false);
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
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              Report Design & Hospital Branding Seeder
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-50 text-teal-700 font-medium border border-teal-200">
                1-Click Apply
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Apply the saved hospital report design (with embedded high-res logo image, header, footer, colors, and layout) to the active Electron database.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={handleSelectFile}
          disabled={isSeeding || isDetecting}
          className="text-xs shrink-0"
        >
          <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
          Browse Seed File (.json / .db)
        </Button>
      </div>

      {/* Errors */}
      {errorMsg && (
        <Alert type="error" className="text-xs">
          {errorMsg}
        </Alert>
      )}

      {/* Success Notification */}
      {seedResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-900">
                Report Design Successfully Applied to Active Database!
              </h3>
              <p className="text-xs text-emerald-700 mt-0.5">
                The report design <strong>"{seedResult.templateName}"</strong> is now saved and activated as the primary report template in the encrypted database. Hospital settings and branding have also been synchronized.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-emerald-200/60 text-xs">
            <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
              <span className="text-slate-500 block text-[11px]">Template</span>
              <span className="font-bold text-emerald-900">{seedResult.templateName}</span>
            </div>
            <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
              <span className="text-slate-500 block text-[11px]">Hospital Name</span>
              <span className="font-bold text-emerald-900">{seedResult.hospitalName}</span>
            </div>
            <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
              <span className="text-slate-500 block text-[11px]">Logo Status</span>
              <span className="font-bold text-emerald-900">
                {seedResult.hasLogo ? 'Embedded (Active)' : 'None'}
              </span>
            </div>
            <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
              <span className="text-slate-500 block text-[11px]">Database Status</span>
              <span className="font-bold text-emerald-900">Active (Live)</span>
            </div>
          </div>

          {onNavigate && (
            <div className="pt-2 flex justify-end">
              <Button
                size="sm"
                variant="primary"
                onClick={() => onNavigate('report-designer')}
                className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                Open Report Designer
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Detected Template Details */}
      {detection && detection.detected ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-bold text-slate-800">
                Saved Report Template Ready ({detection.fileName})
              </span>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                {formatFileSize(detection.fileSize)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => runDetection(selectedFilePath || undefined)}
              disabled={isDetecting}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isDetecting ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
            <div className="space-y-1">
              <p className="text-slate-500">
                Hospital: <strong className="text-slate-900">{detection.hospitalName}</strong>
              </p>
              <p className="text-slate-500">
                Supervisor: <strong className="text-slate-900">{detection.supervisor}</strong>
              </p>
              <p className="text-slate-500">
                Address: <span className="text-slate-800">{detection.address || '—'}</span>
              </p>
              <p className="text-slate-500">
                Badge: <span className="text-teal-700 font-semibold">{detection.badgeText || '—'}</span>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-slate-500 flex items-center gap-1.5">
                Hospital Logo:{' '}
                {detection.hasLogo ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px]">
                    <ImageIcon className="w-3 h-3" />
                    Embedded Logo Image (~{formatFileSize(detection.logoLength)})
                  </span>
                ) : (
                  <span className="text-slate-400">None</span>
                )}
              </p>
              <p className="text-slate-500">
                Footer Left: <span className="text-slate-800 italic">{detection.footerText || '—'}</span>
              </p>
              <p className="text-slate-500">
                Footer Right: <span className="text-slate-800 italic">{detection.footerRightText || '—'}</span>
              </p>
              <p className="text-slate-500">
                Report Columns: <strong className="text-slate-900">{detection.columnsCount} visible columns</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <p className="text-[11px] text-slate-500 font-mono truncate max-w-md" title={detection.filePath || ''}>
              Path: {detection.filePath}
            </p>

            <Button
              size="sm"
              variant="primary"
              onClick={handleApplySeed}
              disabled={isSeeding || isDetecting}
              isLoading={isSeeding}
              className="bg-teal-700 hover:bg-teal-800 text-white shrink-0"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              Apply Report Design to Active Database
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-800">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-900">
              No saved report template seed detected in standard locations.
            </p>
            <p>
              Click <strong>"Browse Seed File"</strong> above to select <code>saved_report_template.json</code> or <code>report_template_seed.db</code> from disk.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
};
