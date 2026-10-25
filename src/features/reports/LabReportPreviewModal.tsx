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

/** One label/value line in the patient block. */
const InfoRow: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({
  label,
  children,
  mono,
}) => (
  <div className="grid grid-cols-[104px_1fr] gap-2 py-[3px]">
    <dt className="text-slate-600">{label}</dt>
    <dd className={`font-medium text-black ${mono ? 'tabular-nums' : ''}`}>{children}</dd>
  </div>
);

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
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (!isOpen || !visitId) {
      setReportData(null);
      setExportStatus(null);
      setLoadError(null);
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

  const handlePrint = () => window.print();

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
          {isLoading ? (
            <div className="text-center py-20 text-[13px] text-[#64748B]">Loading report…</div>
          ) : reportData ? (
            <div className="max-w-[210mm] mx-auto bg-white border border-[#E2E8F0] px-8 py-7 text-[12px] leading-5 text-black print:border-0 print:p-0 print:max-w-none">
              {/* Letterhead */}
              <header className="flex items-center gap-4 pb-3 border-b-2 border-[#0F766E] print:border-black">
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

              {/* Patient and visit details */}
              <section className="mt-3 border border-slate-400 rounded">
                <dl className="grid grid-cols-2 divide-x divide-slate-300 px-3 py-1.5">
                  <div className="pr-4">
                    <InfoRow label="MR no." mono>
                      {reportData.patient.patient_mrn}
                    </InfoRow>
                    <InfoRow label="Patient name">
                      <span className="font-semibold">{reportData.patient.full_name}</span>
                    </InfoRow>
                    <InfoRow label="Age / sex">
                      <span className="capitalize">
                        {ageInfo ? ageInfo.formatted : 'Age not recorded'} / {reportData.patient.gender}
                      </span>
                    </InfoRow>
                    <InfoRow label="Phone">{reportData.patient.phone_number || '—'}</InfoRow>
                  </div>

                  <div className="pl-4">
                    <InfoRow label="Report no." mono>
                      {snapshot?.report_number || `VISIT-${reportData.visit.visit_number}`}
                    </InfoRow>
                    <InfoRow label="Visit no." mono>
                      {reportData.visit.visit_number}
                    </InfoRow>
                    <InfoRow label="Visit date">{formatDateTime(reportData.visit.order_date)}</InfoRow>
                    <InfoRow label="Printed on">{formatDateTime(new Date().toISOString())}</InfoRow>
                  </div>
                </dl>
              </section>

              {/* Results, one block per test (skips un-entered parameters) */}
              <div className="mt-4 space-y-5">
                {reportData.tests.map((testEntry) => {
                  const filledResults = testEntry.results.filter(
                    (pr) => pr.result && pr.result.result_value != null && pr.result.result_value.trim() !== ''
                  );

                  if (filledResults.length === 0) return null;

                  return (
                    <section key={testEntry.orderItem.id}>
                      <div className="flex items-baseline justify-between border-b border-black pb-1">
                        <h2 className="text-[14px] font-bold">
                          {testEntry.orderItem.test_name_snapshot}
                        </h2>
                        <span className="text-[11px] text-slate-600">
                          {testEntry.orderItem.test_code_snapshot}
                        </span>
                      </div>

                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="text-[11px] font-semibold text-slate-700 border-b border-slate-400">
                            <th scope="col" className="py-1.5 pr-3 w-[34%]">
                              Test
                            </th>
                            <th scope="col" className="py-1.5 pr-3 w-[18%]">
                              Result
                            </th>
                            <th scope="col" className="py-1.5 pr-3">
                              Reference range
                            </th>
                            <th scope="col" className="py-1.5 w-[14%]">
                              Unit
                            </th>
                            {showAmendColumn && (
                              <th scope="col" className="py-1.5 w-14 text-center print:hidden">
                                <span className="sr-only">Amend</span>
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filledResults.map((pr) => {
                            const flag = pr.flag;
                            const isCritical = flag === 'critical';
                            const isHigh = flag === 'high';
                            const isLow = flag === 'low';
                            const abnormal = isCritical || isHigh || isLow;

                            return (
                              <tr
                                key={pr.parameter.id}
                                className="border-b border-slate-200 print:break-inside-avoid"
                              >
                                <td className="py-1.5 pr-3 font-medium">{pr.parameter.name}</td>

                                <td
                                  className={`py-1.5 pr-3 tabular-nums ${
                                    abnormal ? 'font-bold' : 'font-medium'
                                  }`}
                                >
                                  {pr.result ? (
                                    <>
                                      {pr.result.result_value}
                                      {isCritical && (
                                        <span className="ml-2 border border-black px-1 text-[10px] font-bold uppercase">
                                          Critical
                                        </span>
                                      )}
                                      {isHigh && <span className="ml-2 text-[11px]">H</span>}
                                      {isLow && <span className="ml-2 text-[11px]">L</span>}
                                    </>
                                  ) : (
                                    <span className="font-normal italic text-slate-500">Pending</span>
                                  )}
                                </td>

                                <td className="py-1.5 pr-3 text-slate-700">
                                  {pr.referenceRangeDisplay || '—'}
                                </td>
                                <td className="py-1.5 text-slate-700">{pr.parameter.unit || ''}</td>

                                {showAmendColumn && (
                                  <td className="py-1.5 text-center print:hidden">
                                    {pr.result && (
                                      <button
                                        type="button"
                                        onClick={() => onOpenAmendment!(pr.result!.id)}
                                        className="text-[12px] font-medium text-[#0F766E] hover:text-[#115E59] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded-sm"
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
                    </section>
                  );
                })}
              </div>

              {/* Computer generated disclaimer footer */}
              <footer className="mt-8 pt-4 border-t border-slate-300 text-center print:break-inside-avoid">
                <p className="text-[12px] font-medium text-slate-800">
                  This is a computer-generated report, therefore it does not require any signature.
                </p>
              </footer>
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