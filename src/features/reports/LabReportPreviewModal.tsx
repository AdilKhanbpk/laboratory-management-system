import React, { useState, useEffect } from 'react';
import { FullDiagnosticReport } from '../../types';
import { Button } from '../../components/common/Button';
import { formatDateTime } from '../../lib/utils';
import { Printer, Download, X, FileText, AlertTriangle, ShieldCheck } from 'lucide-react';

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
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !visitId) {
      setReportData(null);
      setExportMessage(null);
      return;
    }

    setIsLoading(true);
    window.electronAPI.reports
      .getDiagnosticReport(visitId)
      .then((res) => {
        if (res.success && res.data) {
          setReportData(res.data);
        }
      })
      .catch((err) => console.error('Failed to load report:', err))
      .finally(() => setIsLoading(false));
  }, [isOpen, visitId]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    if (!visitId || !reportData) return;
    setIsExportingPdf(true);
    setExportMessage(null);
    try {
      const fileName = `Report_${reportData.patient.patient_mrn}_${reportData.visit.visit_number}.pdf`;
      const res = await window.electronAPI.reports.exportPdf({
        visitId,
        defaultFileName: fileName,
      });

      if (res.success && res.data?.filePath) {
        setExportMessage(`Report PDF saved successfully to:\n${res.data.filePath}`);
      }
    } catch (err: any) {
      setExportMessage(`PDF export error: ${err?.message || 'Failed to save PDF'}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full overflow-hidden flex flex-col my-auto max-h-[94vh] print:max-h-none print:shadow-none print:border-none print:w-full print:max-w-none">
        {/* Modal Top Bar - Hidden in Print */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-400" />
            <div>
              <h2 className="text-sm font-bold">Diagnostic Pathology Report Preview</h2>
              {reportData?.snapshot && (
                <p className="text-[11px] text-slate-400 font-mono">
                  Report #{reportData.snapshot.report_number} • Rev {reportData.snapshot.version}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-slate-200 border-slate-700 hover:bg-slate-800 text-xs"
              onClick={handleExportPdf}
              isLoading={isExportingPdf}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Local PDF
            </Button>
            <Button size="sm" variant="primary" onClick={handlePrint} className="text-xs">
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print Report (A4)
            </Button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {exportMessage && (
          <div className="px-6 py-2 bg-emerald-50 text-emerald-900 border-b border-emerald-200 text-xs font-medium flex items-center justify-between print:hidden">
            <span className="whitespace-pre-line">{exportMessage}</span>
            <button onClick={() => setExportMessage(null)} className="text-emerald-700 font-bold hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Printable A4 Report Body */}
        <div className="p-8 overflow-y-auto bg-white text-slate-900 text-xs print:p-0 print:overflow-visible">
          {isLoading ? (
            <div className="text-center py-20 text-slate-400">Loading diagnostic report...</div>
          ) : reportData ? (
            <div className="max-w-[210mm] mx-auto space-y-6 print:max-w-none">
              {/* Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {reportData.hospital?.logo_url && (
                    <img
                      src={reportData.hospital.logo_url}
                      alt={reportData.hospital.hospital_name}
                      className="h-16 w-auto object-contain"
                    />
                  )}
                  <div>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                      {reportData.hospital?.hospital_name}
                    </h1>
                    {reportData.hospital?.tagline && (
                      <p className="text-xs text-slate-500 font-medium italic">{reportData.hospital.tagline}</p>
                    )}
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {reportData.hospital?.address}
                      {reportData.hospital?.phone_primary && ` • Tel: ${reportData.hospital.phone_primary}`}
                      {reportData.hospital?.email && ` • ${reportData.hospital.email}`}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded">
                    Official Laboratory Report
                  </span>
                  <p className="font-mono text-xs font-bold text-slate-800 mt-1">
                    {reportData.snapshot?.report_number || `VISIT-${reportData.visit.visit_number}`}
                  </p>
                  {reportData.snapshot?.status === 'amended' && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded font-bold text-[10px] uppercase">
                      Amended Report (Rev {reportData.snapshot.version})
                    </span>
                  )}
                </div>
              </div>

              {/* Patient & Encounter Demographics Box */}
              <div className="p-3.5 rounded-lg border border-slate-300 bg-slate-50/70 print:bg-white text-[11px] grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-slate-500 block">Patient Name:</span>
                  <span className="font-bold text-slate-900 text-sm">{reportData.patient.full_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Patient MRN:</span>
                  <span className="font-mono font-bold text-slate-800">{reportData.patient.patient_mrn}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Age & Biological Sex:</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {reportData.patient.date_of_birth || 'Age Unspecified'} • {reportData.patient.gender}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Order Date & Time:</span>
                  <span className="font-medium text-slate-800">{formatDateTime(reportData.visit.order_date)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Referring Doctor:</span>
                  <span className="font-semibold text-slate-800">
                    {reportData.doctor ? `Dr. ${reportData.doctor.full_name}` : 'Self / Direct Patient'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Visit Accession #:</span>
                  <span className="font-mono font-semibold text-slate-800">{reportData.visit.visit_number}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Contact:</span>
                  <span className="text-slate-700">{reportData.patient.phone_number || 'None'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Report Status:</span>
                  <span className="font-bold uppercase text-slate-900">
                    {reportData.snapshot ? 'Finalized' : reportData.visit.status}
                  </span>
                </div>
              </div>

              {/* Test Results Table */}
              <div className="space-y-6">
                {reportData.tests.map((testEntry) => (
                  <div key={testEntry.orderItem.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    {/* Test Header */}
                    <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">
                        {testEntry.orderItem.test_name_snapshot}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        Code: {testEntry.orderItem.test_code_snapshot}
                      </span>
                    </div>

                    {/* Parameters Table */}
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[10px] uppercase">
                        <tr>
                          <th className="py-2 px-4">Test Parameter</th>
                          <th className="py-2 px-3 text-right">Observed Result</th>
                          <th className="py-2 px-3 text-center">Flag</th>
                          <th className="py-2 px-3">Units</th>
                          <th className="py-2 px-4">Configured Reference Range</th>
                          {onOpenAmendment && reportData.snapshot && (
                            <th className="py-2 px-2 text-center w-12 print:hidden">Amend</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {testEntry.results.map((pr) => {
                          const flag = pr.flag;
                          const isCritical = flag === 'critical';
                          const isHigh = flag === 'high';
                          const isLow = flag === 'low';

                          return (
                            <tr key={pr.parameter.id} className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-4 font-semibold text-slate-900">
                                {pr.parameter.name}
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-mono text-sm ${
                                  isCritical
                                    ? 'font-black text-red-700 bg-red-50/80'
                                    : isHigh
                                    ? 'font-bold text-amber-700'
                                    : isLow
                                    ? 'font-bold text-sky-700'
                                    : 'font-bold text-slate-900'
                                }`}
                              >
                                {pr.result ? pr.result.result_value : <span className="text-slate-400 italic">Pending</span>}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {isCritical ? (
                                  <span className="px-1.5 py-0.5 rounded bg-red-600 text-white font-black text-[10px] uppercase">
                                    CRITICAL
                                  </span>
                                ) : isHigh ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                                    HIGH
                                  </span>
                                ) : isLow ? (
                                  <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 font-bold text-[10px]">
                                    LOW
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-medium text-[10px]">Normal</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                                {pr.parameter.unit || '—'}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600 font-medium text-[11px]">
                                {pr.referenceRangeDisplay}
                              </td>
                              {onOpenAmendment && reportData.snapshot && pr.result && (
                                <td className="py-2.5 px-2 text-center print:hidden">
                                  <button
                                    type="button"
                                    onClick={() => onOpenAmendment(pr.result!.id)}
                                    className="text-[10px] text-brand-600 font-bold hover:underline"
                                  >
                                    Amend
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Amendment History (If Corrected) */}
              {reportData.amendments && reportData.amendments.length > 0 && (
                <div className="p-3.5 rounded-lg border border-amber-300 bg-amber-50/60 text-xs space-y-2">
                  <h4 className="font-bold text-amber-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                    Formal Clinical Amendment History
                  </h4>
                  <div className="divide-y divide-amber-200">
                    {reportData.amendments.map((am) => (
                      <div key={am.id} className="py-1.5 text-[11px] text-amber-900">
                        <span className="font-bold">{am.parameter_name}:</span> Changed from{' '}
                        <span className="font-mono line-through text-slate-500">{am.previous_value}</span> to{' '}
                        <strong className="font-mono text-emerald-800">{am.new_value}</strong> on{' '}
                        {formatDateTime(am.created_at)} by {am.amended_by_name || 'Staff'}.
                        <p className="italic text-slate-600 mt-0.5">Reason: "{am.amendment_reason}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer Signatures and Disclaimer */}
              <div className="pt-8 border-t border-slate-300 space-y-6">
                <div className="grid grid-cols-2 gap-8 text-center text-xs">
                  <div>
                    <div className="border-b border-slate-400 w-48 mx-auto mb-1"></div>
                    <p className="font-semibold text-slate-800">Medical Technologist</p>
                    <p className="text-[10px] text-slate-400">Specimen Processing & Analysis</p>
                  </div>
                  <div>
                    <div className="border-b border-slate-400 w-48 mx-auto mb-1"></div>
                    <p className="font-semibold text-slate-800">Pathologist / Lab In-Charge</p>
                    <p className="text-[10px] text-slate-400">Verification & Report Finalization</p>
                  </div>
                </div>

                {/* Verification Digest */}
                <div className="p-2.5 rounded bg-slate-100 text-[10px] text-slate-500 flex items-center justify-between font-mono">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Digitally Verified Local Diagnostic Record</span>
                  </div>
                  {reportData.snapshot && (
                    <span title="SHA-256 Tamper-Evident Hash">
                      Hash: {reportData.snapshot.integrity_hash.substring(0, 16)}...
                    </span>
                  )}
                </div>

                <div className="text-[9px] text-slate-400 text-center leading-relaxed">
                  <p>
                    This diagnostic report was produced by an offline medical laboratory system. Results must be interpreted in clinical correlation with the patient's symptoms and history.
                  </p>
                  <p className="mt-0.5">
                    Printed: {new Date().toISOString()} • End of Diagnostic Report
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-400">Report details not available.</div>
          )}
        </div>

        {/* Modal Footer - Hidden in Print */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 print:hidden">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" variant="primary" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1.5" />
            Print Report
          </Button>
        </div>
      </div>
    </div>
  );
};
