import React, { useState, useEffect } from 'react';
import { FullDiagnosticReport } from '../../types';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatDateTime, calculateAge } from '../../lib/utils';
import { Printer, Download, X, History } from 'lucide-react';

/*
 * Screen chrome uses the app tokens (teal #0F766E, border #E2E8F0, text #1F2937).
 * The report sheet itself is black on white with thin rules, so it prints cleanly
 * on any A4 printer, colour or not.
 */

interface LabReportPreviewModalProps {
  visitId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenAmendment?: (resultId: number) => void;
}

export const LabReportPreviewModal: React.FC<LabReportPreviewModalProps> = ({
  visitId,
  isOpen,
  onClose,
  onOpenAmendment,
}) => {
  const [reportData, setReportData] = useState<FullDiagnosticReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (!isOpen || !visitId) {
      setReportData(null);
      setExportStatus(null);
      setLoadError(null);
      setIsPrinting(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    window.electronAPI.reports
      .getDiagnosticReport(visitId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setReportData(res.data);
        } else {
          setLoadError(res.error || 'The report could not be loaded.');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load report:', err);
        setLoadError(err?.message || 'The report could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, visitId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrint = async () => {
    if (!visitId || !reportData) return;
    setIsPrinting(true);
    try {
      if (window.electronAPI?.reports?.print) {
        const res = await window.electronAPI.reports.print(visitId);
        if (!res.success && res.error) {
          setExportStatus({ type: 'error', text: res.error });
        }
      } else {
        window.print();
      }
    } catch (err: any) {
      setExportStatus({ type: 'error', text: err?.message || 'Print failed.' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!visitId || !reportData) return;
    setIsExportingPdf(true);
    setExportStatus(null);
    try {
      const fileName = `Report_${reportData.patient.patient_mrn}_${reportData.visit.visit_number}.pdf`;
      const res = await window.electronAPI.reports.exportPdf({
        visitId,
        defaultFileName: fileName,
      });

      if (res.success && res.data?.filePath) {
        setExportStatus({ type: 'success', text: `PDF saved to ${res.data.filePath}` });
      } else if (!res.success) {
        setExportStatus({ type: 'error', text: res.error || 'The PDF could not be saved.' });
      }
      // success without a path means the person cancelled the save dialog: say nothing
    } catch (err: any) {
      setExportStatus({ type: 'error', text: err?.message || 'The PDF could not be saved.' });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const hospital = reportData?.hospital;
  const phones = [hospital?.phone_primary, hospital?.phone_secondary].filter(Boolean).join(' / ');
  const ageInfo = reportData?.patient.date_of_birth
    ? calculateAge(reportData.patient.date_of_birth)
    : null;
  const snapshot = reportData?.snapshot;
  const showAmendColumn = !!onOpenAmendment && !!snapshot;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 print:p-0 print:bg-white print:static print:block"
      role="dialog"
      aria-modal="true"
      aria-label="Laboratory report"
    >
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>

      <div className="bg-white rounded-lg border border-[#E2E8F0] w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden text-[#1F2937] print:max-h-none print:border-0 print:rounded-none print:max-w-none print:overflow-visible">
        {/* Controls (not printed) */}
        <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center justify-between gap-4 shrink-0 print:hidden">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6">Laboratory report</h2>
            {snapshot && (
              <p className="text-[13px] text-[#64748B]">
                {snapshot.report_number} · Revision {snapshot.version}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowHistoryModal(true)}
              disabled={!reportData}
              title="View report creation and edit history"
            >
              <History className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
              Edit History
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPdf}
              isLoading={isExportingPdf}
              disabled={!reportData}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Save as PDF
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handlePrint}
              isLoading={isPrinting}
              disabled={!reportData}
              className="bg-[#0F766E] hover:bg-[#115E59]"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 hover:text-[#1F2937] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {exportStatus && (
          <div className="px-5 py-2 border-b border-[#E2E8F0] print:hidden">
            <Alert type={exportStatus.type}>{exportStatus.text}</Alert>
          </div>
        )}

        {/* Paper */}
        <div className="flex-1 overflow-y-auto bg-[#F5F7FA] p-5 print:p-0 print:bg-white print:overflow-visible">
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 8mm 10mm;
              }
            }
          `}</style>
          {isLoading ? (
            <div className="text-center py-20 text-[13px] text-[#64748B]">Loading report…</div>
          ) : reportData ? (
            <div
              className="w-full max-w-[210mm] min-h-[297mm] mx-auto bg-white border border-[#E2E8F0] shadow-md text-[12px] leading-5 text-[#1e293b] flex flex-col justify-between print:border-0 print:p-0 print:max-w-none print:shadow-none print:min-h-[280mm]"
              style={{
                fontFamily: reportData.template?.style?.fontFamily || 'Arial, sans-serif',
                fontSize: reportData.template?.style?.fontSize ? `${reportData.template.style.fontSize}pt` : undefined,
              }}
            >
              <div className="flex-1 flex flex-col">
                {/* Report Header: Template Design Banner */}
                {reportData.template ? (
                <>
                  <header
                    className="p-4 flex items-center gap-4 text-white print:[-webkit-print-color-adjust:exact]"
                    style={{ background: reportData.template.header.color || '#124779' }}
                  >
                    {reportData.template.header.showLogo && (reportData.template.header.logoDataUrl || hospital?.logo_url) && (
                      <img
                        src={reportData.template.header.logoDataUrl || hospital?.logo_url || ''}
                        alt="Logo"
                        className="w-16 h-16 object-contain bg-white p-1 rounded shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h1 className="text-xl font-extrabold leading-tight tracking-wide text-white">
                        {reportData.template.header.hospitalName || hospital?.hospital_name || 'AL-SHIFA MEDICAL CENTER'}
                      </h1>
                      <div className="text-xs font-bold tracking-wider text-[#a5f3fc] mt-0.5">
                        {reportData.template.header.reportTitle || 'LAB TEST REPORT'}
                      </div>
                      <div className="text-xs font-semibold text-[#fde047] mt-0.5">
                        Under Supervision of: {reportData.template.header.supervisor || 'Dr. Saad Khan'}
                      </div>
                    </div>
                    {reportData.template.header.showBadge !== false && (
                      <div className="bg-[#05a9a7] text-white px-3 py-2 rounded-lg font-bold text-xs text-center min-w-[100px] shrink-0 print:[-webkit-print-color-adjust:exact]">
                        {reportData.template.header.badgeText || '24 Ghantay Service'}
                      </div>
                    )}
                  </header>

                  {/* Accent Stripe */}
                  <div
                    className="h-1.5 print:[-webkit-print-color-adjust:exact]"
                    style={{ background: reportData.template.header.accentColor || '#079b98' }}
                  />

                  {/* Contact line */}
                  <div className="px-5 py-2 border-b border-slate-300 text-[11px] text-slate-700 leading-normal">
                    <div className="font-semibold">{reportData.template.header.address || hospital?.address}</div>
                    <div>
                      Phone: {reportData.template.header.phone || hospital?.phone_primary} &nbsp;|&nbsp; Mob: {reportData.template.header.mobile} &nbsp;|&nbsp; WhatsApp: {reportData.template.header.whatsapp}
                    </div>
                  </div>
                </>
              ) : (
                <header className="flex items-center gap-4 p-5 pb-3 border-b-2 border-[#0F766E] print:border-black">
                  {hospital?.logo_url && (
                    <img
                      src={hospital.logo_url}
                      alt=""
                      className="h-16 w-auto object-contain shrink-0"
                    />
                  )}
                  <div className="flex-1 text-center">
                    <h1 className="text-2xl font-bold leading-7">
                      {hospital?.hospital_name || 'Diagnostic Laboratory'}
                    </h1>
                    {hospital?.address && <p className="text-[12px] mt-0.5">{hospital.address}</p>}
                    {(phones || hospital?.email) && (
                      <p className="text-[12px]">
                        {phones && `Phone: ${phones}`}
                        {phones && hospital?.email && '   |   '}
                        {hospital?.email}
                      </p>
                    )}
                  </div>
                  {hospital?.logo_url && <div className="w-16 shrink-0" aria-hidden="true" />}
                </header>
              )}

              {/* Main Report Body Padding */}
              <div className="p-5 pt-3 space-y-4">
                {/* Patient and visit details box */}
                <section className="border border-slate-400 rounded-xs overflow-hidden">
                  <div className="bg-[#d6edf3] px-3 py-1 text-[11px] font-bold text-[#0f3e74] uppercase tracking-wider print:[-webkit-print-color-adjust:exact]">
                    Patient Details
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 p-2 text-[11px] leading-relaxed">
                    <span className="p-1 border-b border-slate-100">
                      Patient Name: <strong className="font-bold text-black">{reportData.patient.full_name}</strong>
                    </span>
                    <span className="p-1 border-b border-slate-100">
                      Age / Gender: <strong>{ageInfo ? ageInfo.formatted : 'Age not recorded'} / {reportData.patient.gender}</strong>
                    </span>
                    <span className="p-1 border-b border-slate-100">
                      Date: <strong>{formatDateTime(reportData.visit.order_date)}</strong>
                    </span>
                    <span className="p-1 border-b border-slate-100">
                      Report No.: <strong>{snapshot?.report_number || `REP-${reportData.visit.visit_number}`}</strong>
                    </span>
                    <span className="p-1 border-b border-slate-100">
                      MR No.: <strong>{reportData.patient.patient_mrn}</strong>
                    </span>
                    <span className="p-1 border-b border-slate-100">
                      Phone: <strong>{reportData.patient.phone_number || '—'}</strong>
                    </span>
                    <span className="p-1 border-b border-slate-100 sm:border-b-0 col-span-2">
                      Referring Physician: <strong>{reportData.doctor?.full_name || reportData.template?.header.supervisor || 'Dr. Saad Khan'}</strong>
                    </span>
                    {/* <span className="p-1">
                      Sample Collected: <strong>Whole Blood / Specimen</strong>
                    </span> */}
                  </div>
                </section>

                {/* Lab Test Results */}
                <section className="border border-slate-400 rounded-xs overflow-hidden">
                  <div className="bg-[#d6edf3] px-3 py-1 text-[11px] font-bold text-[#0f3e74] uppercase tracking-wider print:[-webkit-print-color-adjust:exact]">
                    Lab Test Results
                  </div>
                  <div className="p-2 space-y-4">
                    {reportData.tests.map((testEntry) => {
                      const filledResults = testEntry.results.filter(
                        (pr) => pr.result && pr.result.result_value != null && pr.result.result_value.trim() !== ''
                      );

                      if (filledResults.length === 0) return null;

                      const visibleCols = reportData.template?.columns?.filter((c) => c.visible) || [
                        { key: 'testName', label: 'Test Name', visible: true },
                        { key: 'result', label: 'Result', visible: true },
                        { key: 'normalRange', label: 'Normal Range', visible: true },
                        { key: 'unit', label: 'Unit', visible: true },
                      ];

                      return (
                        <div key={testEntry.orderItem.id} className="space-y-1">
                          <div className="flex items-baseline justify-between border-b border-[#0f766e] pb-0.5">
                            <h2 className="text-[13px] font-bold text-slate-900">
                              {testEntry.orderItem.test_name_snapshot}
                            </h2>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {testEntry.orderItem.test_code_snapshot}
                            </span>
                          </div>

                          <table className="w-full border-collapse text-left text-[11px]">
                            <thead>
                              <tr
                                className="text-white print:[-webkit-print-color-adjust:exact]"
                                style={{ background: reportData.template?.header.accentColor || '#079b98' }}
                              >
                                {visibleCols.map((col) => (
                                  <th key={col.key} scope="col" className="py-1 px-2.5 font-bold uppercase text-[10px]">
                                    {col.label}
                                  </th>
                                ))}
                                {showAmendColumn && (
                                  <th scope="col" className="py-1 px-2 w-14 text-center print:hidden">
                                    <span className="sr-only">Amend</span>
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {filledResults.map((pr) => {
                                const flag = pr.flag;
                                const isCritical = flag === 'critical';
                                const isHigh = flag === 'high';
                                const isLow = flag === 'low';
                                const abnormal = isCritical || isHigh || isLow;

                                let statusText = 'Normal';
                                if (isCritical) statusText = 'Critical';
                                else if (isHigh) statusText = 'High';
                                else if (isLow) statusText = 'Low';

                                return (
                                  <tr key={pr.parameter.id} className="hover:bg-slate-50/50 print:break-inside-avoid">
                                    {visibleCols.map((col) => {
                                      if (col.key === 'testName') {
                                        return (
                                          <td key={col.key} className="py-1.5 px-2.5 font-medium text-slate-900">
                                            {pr.parameter.name}
                                          </td>
                                        );
                                      }
                                      if (col.key === 'result') {
                                        return (
                                          <td key={col.key} className={`py-1.5 px-2.5 tabular-nums ${abnormal ? 'font-bold text-black' : 'font-medium'}`}>
                                            {pr.result?.result_value}
                                          </td>
                                        );
                                      }
                                      if (col.key === 'unit') {
                                        return (
                                          <td key={col.key} className="py-1.5 px-2.5 text-slate-600">
                                            {pr.parameter.unit || '—'}
                                          </td>
                                        );
                                      }
                                      if (col.key === 'normalRange') {
                                        return (
                                          <td key={col.key} className="py-1.5 px-2.5 text-slate-700">
                                            {pr.referenceRangeDisplay || '—'}
                                          </td>
                                        );
                                      }
                                      if (col.key === 'status') {
                                        return (
                                          <td
                                            key={col.key}
                                            className={`py-1.5 px-2.5 font-bold ${
                                              abnormal ? 'text-red-700' : 'text-emerald-700'
                                            }`}
                                          >
                                            {statusText}
                                          </td>
                                        );
                                      }
                                      return <td key={col.key} className="py-1.5 px-2.5">—</td>;
                                    })}

                                    {showAmendColumn && (
                                      <td className="py-1 px-2 text-center print:hidden">
                                        {pr.result && (
                                          <button
                                            type="button"
                                            onClick={() => onOpenAmendment!(pr.result!.id)}
                                            className="text-[11px] font-medium text-[#0F766E] hover:underline"
                                          >
                                            Amend
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Observations Section */}
                {reportData.template?.observations?.visible !== false && (
                  <section className="border border-slate-400 rounded-xs overflow-hidden print:break-inside-avoid">
                    <div className="bg-[#d6edf3] px-3 py-1 text-[11px] font-bold text-[#0f3e74] uppercase tracking-wider print:[-webkit-print-color-adjust:exact]">
                      {reportData.template?.observations?.title || 'COMPUTER TEST RESULTS / OBSERVATIONS'}
                    </div>
                    <div className="p-3 text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[50px]">
                      {reportData.template?.observations?.defaultText ||
                        'Specimen processed on automated clinical pathology analyzers. All calibration and internal quality control values within acceptable limits. Test results to be clinically correlated with patient symptoms.'}
                    </div>
                  </section>
                )}
              </div>
            </div>

            {/* Footer Banner - Anchored at the true page footer */}
            {reportData.template?.footer?.visible !== false ? (
              <footer
                className="mt-auto px-5 py-3 text-white flex justify-between items-center text-[11px] font-medium shrink-0 print:break-inside-avoid print:[-webkit-print-color-adjust:exact]"
                style={{ background: reportData.template?.footer?.color || '#124779' }}
              >
                <span className="max-w-[70%]">
                  {reportData.template?.footer?.text || 'Thank you for trusting AL-SHIFA MEDICAL CENTER | Dr. Saad Khan'}
                </span>
                <span>
                  {reportData.template?.footer?.rightText || 'AL-SHIFA | Dr. Saad Khan'}
                </span>
              </footer>
            ) : (
              <div className="mt-auto py-4 text-center text-xs text-slate-500 border-t border-slate-200 shrink-0">
                This is a computer-generated report.
              </div>
            )}
          </div>
          ) : (
            <div className="text-center py-20 text-[13px]">
              <p className="font-medium">The report is not available</p>
              {loadError && <p className="text-[#64748B] mt-0.5">{loadError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Report Edit & Audit History Modal */}
      {showHistoryModal && (
        <div
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-2xl w-full max-w-lg overflow-hidden text-[#1F2937]">
            <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#0F766E]" />
                <h3 className="text-sm font-semibold">Report Audit & Edit History</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-1 rounded-md text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1F2937]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {reportData?.editHistory && reportData.editHistory.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {reportData.editHistory.map((entry, idx) => (
                    <div key={idx} className="relative">
                      <div
                        className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          entry.isInitial ? 'bg-[#0F766E]' : 'bg-amber-600'
                        }`}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-slate-900">
                            {entry.isInitial
                              ? `Report created by ${entry.operatorName}`
                              : `Edited by ${entry.operatorName}`}
                          </span>
                          {!entry.isInitial && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              Revision {entry.version}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDateTime(entry.date)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No edit history recorded yet.</p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end bg-[#F8FAFC]">
              <Button size="sm" variant="outline" onClick={() => setShowHistoryModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};