import React, { useState, useEffect, useCallback } from 'react';
import { Patient, PatientHistoryItem, VisitDetail, HospitalSettings } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Alert } from '../../components/common/Alert';
import { formatCurrency, formatDateTime, calculateAge } from '../../lib/utils';
import { LabReportPreviewModal } from '../reports/LabReportPreviewModal';
import { ReceiptPrintModal } from '../visits/ReceiptPrintModal';
import {
  History,
  Search,
  User,
  FileText,
  Clock,
  ChevronRight,
  RotateCw,
  AlertCircle,
  Receipt,
} from 'lucide-react';

interface PatientHistoryViewProps {
  hospitalSettings?: HospitalSettings | null;
  initialPatientId?: number | null;
}

export const PatientHistoryView: React.FC<PatientHistoryViewProps> = ({
  hospitalSettings,
  initialPatientId,
}) => {
  // Search & Patient Selection
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // History Data
  const [historyItems, setHistoryItems] = useState<PatientHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter within history
  const [filterQuery, setFilterQuery] = useState('');

  // Active Modals
  const [previewVisitId, setPreviewVisitId] = useState<number | null>(null);
  const [receiptVisitDetail, setReceiptVisitDetail] = useState<VisitDetail | null>(null);

  // Auto-search patients as query changes
  useEffect(() => {
    if (!patientSearchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await window.electronAPI.patients.search({
          query: patientSearchTerm.trim(),
          limit: 10,
        });
        if (res.success && res.data) {
          setSearchResults(res.data.patients);
        }
      } catch (err) {
        console.error('Patient search error:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [patientSearchTerm]);

  // Load history when a patient is selected
  const loadPatientHistory = useCallback(async (patientId: number) => {
    setIsLoadingHistory(true);
    setErrorMessage(null);
    try {
      const res = await window.electronAPI.patientHistory.getFullHistory(patientId);
      if (res.success && res.data) {
        setHistoryItems(res.data);
      } else {
        setErrorMessage(res.error || 'Failed to retrieve patient clinical history.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error communicating with history repository.');
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchResults([]);
    setPatientSearchTerm('');
    loadPatientHistory(patient.id);
  };

  // If initialPatientId is provided, load on mount
  useEffect(() => {
    if (initialPatientId) {
      window.electronAPI.patients.getById(initialPatientId).then((res) => {
        if (res.success && res.data) {
          handleSelectPatient(res.data);
        }
      });
    }
  }, [initialPatientId]);

  // Load receipt details for modal
  const handleOpenReceipt = async (visitId: number) => {
    try {
      const res = await window.electronAPI.visits.getById(visitId);
      if (res.success && res.data) {
        setReceiptVisitDetail(res.data);
      }
    } catch (err) {
      console.error('Failed to load visit details for receipt:', err);
    }
  };

  // Filter history items by search query
  const filteredHistory = historyItems.filter((item) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    const matchVisit = item.visit.visit_number.toLowerCase().includes(q);
    const matchDoctor = (item.visit as any).doctor_name?.toLowerCase().includes(q);
    const matchTests = item.orderItems.some(
      (oi) =>
        oi.test_name_snapshot.toLowerCase().includes(q) ||
        oi.test_code_snapshot.toLowerCase().includes(q)
    );
    return matchVisit || matchDoctor || matchTests;
  });

  const age = selectedPatient ? calculateAge(selectedPatient.date_of_birth) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-brand-600" />
            Longitudinal Patient History Desk
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review past laboratory encounters, chronological test records, invoices, and diagnostic pathology reports.
          </p>
        </div>

        {selectedPatient && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPatientHistory(selectedPatient.id)}
            isLoading={isLoadingHistory}
          >
            <RotateCw className="w-3.5 h-3.5 mr-1.5" />
            Reload History
          </Button>
        )}
      </div>

      {/* Patient Search & Picker */}
      <Card className="p-4 bg-white border-slate-200 shadow-sm relative">
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Select or Search Patient by Name, MRN, or Phone
        </label>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={patientSearchTerm}
            onChange={(e) => setPatientSearchTerm(e.target.value)}
            placeholder="Type patient name, MRN (e.g. PAT-2026-0001), or phone number..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
            {searchResults.map((p) => {
              const pAge = calculateAge(p.date_of_birth);
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPatient(p)}
                  className="w-full px-4 py-2.5 text-left text-xs hover:bg-brand-50 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <span className="font-bold text-slate-900 group-hover:text-brand-700 block">
                      {p.full_name}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
                      MRN: {p.patient_mrn} • {pAge ? pAge.formatted : 'Age unrecorded'} •{' '}
                      <span className="capitalize">{p.gender}</span>
                      {p.phone_number && ` • Phone: ${p.phone_number}`}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 transition-colors" />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Selected Patient Banner */}
      {selectedPatient && (
        <Card className="p-4 bg-slate-900 text-white border-slate-800 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center border border-brand-500/30">
                <User className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">{selectedPatient.full_name}</h2>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-brand-400 border border-slate-700">
                    {selectedPatient.patient_mrn}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                  <span>
                    Age: <strong className="text-slate-300">{age ? age.formatted : 'Unrecorded'}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Gender: <strong className="text-slate-300 capitalize">{selectedPatient.gender}</strong>
                  </span>
                  {selectedPatient.phone_number && (
                    <>
                      <span>•</span>
                      <span>
                        Phone: <strong className="text-slate-300">{selectedPatient.phone_number}</strong>
                      </span>
                    </>
                  )}
                  {selectedPatient.address && (
                    <>
                      <span>•</span>
                      <span className="truncate max-w-xs text-slate-400">{selectedPatient.address}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                  Total Encounters
                </span>
                <span className="text-lg font-bold text-white mt-0.5 block">{historyItems.length}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                  Finalized Reports
                </span>
                <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
                  {historyItems.filter((i) => i.hasSnapshot).length}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* History Items Section */}
      {selectedPatient ? (
        <div className="space-y-4">
          {errorMessage && <Alert type="error">{errorMessage}</Alert>}

          {/* Sub-filter Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-sm flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter by visit number, test name, or doctor..."
                className="w-full pl-8 pr-4 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="text-xs text-slate-500">
              Showing {filteredHistory.length} of {historyItems.length} visit record(s)
            </div>
          </div>

          {isLoadingHistory ? (
            <Card className="p-12 text-center text-slate-500 bg-white">
              <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-500" />
              <p className="text-xs font-semibold">Retrieving patient visit history...</p>
            </Card>
          ) : filteredHistory.length === 0 ? (
            <Card className="p-12 text-center text-slate-500 bg-white">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p className="text-sm font-semibold text-slate-800">No Visit Records Found</p>
              <p className="text-xs text-slate-500 mt-1">
                {filterQuery
                  ? 'No encounters matched your search filter.'
                  : 'This patient does not have any recorded laboratory visits yet.'}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((item) => {
                return (
                  <Card
                    key={item.visit.id}
                    className="p-5 bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Visit Info & Tests */}
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-sm text-slate-900">
                            {item.visit.visit_number}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDateTime(item.visit.order_date)}
                          </span>
                          <span className="text-xs text-slate-600">
                            Doctor:{' '}
                            <strong className="text-slate-800">
                              {(item.visit as any).doctor_name || 'Self-referred'}
                            </strong>
                          </span>
                        </div>

                        {/* Ordered Tests List */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {item.orderItems.map((oi) => (
                            <span
                              key={oi.id}
                              className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-800 px-2 py-1 rounded-md border border-slate-200"
                            >
                              <span className="font-semibold">{oi.test_name_snapshot}</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                ({oi.test_code_snapshot})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Middle: Billing & Status Summary */}
                      <div className="flex items-center gap-6 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0">
                        {item.invoice ? (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Total / Balance
                            </span>
                            <span className="font-bold text-slate-900 block mt-0.5">
                              {formatCurrency(item.invoice.final_total)}
                            </span>
                            <span
                              className={`text-[11px] font-semibold mt-0.5 block ${
                                item.invoice.balance_amount > 0 ? 'text-amber-600' : 'text-emerald-600'
                              }`}
                            >
                              {item.invoice.balance_amount > 0
                                ? `Due: ${formatCurrency(item.invoice.balance_amount)}`
                                : 'Fully Paid'}
                            </span>
                          </div>
                        ) : (
                          <div className="text-slate-400 italic">No invoice</div>
                        )}

                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Report Status
                          </span>
                          <div className="mt-1">
                            {item.reportStatus === 'finalized' ? (
                              <Badge variant="success">Finalized</Badge>
                            ) : item.reportStatus === 'corrected' ? (
                              <Badge variant="warning">Amended</Badge>
                            ) : item.reportStatus === 'draft' ? (
                              <Badge variant="info">Draft</Badge>
                            ) : (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenReceipt(item.visit.id)}
                          className="text-xs"
                        >
                          <Receipt className="w-3.5 h-3.5 mr-1 text-slate-500" />
                          Receipt
                        </Button>

                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setPreviewVisitId(item.visit.id)}
                          className={`text-xs ${
                            item.hasSnapshot
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-brand-600 hover:bg-brand-700'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5 mr-1.5" />
                          {item.hasSnapshot ? 'Diagnostic Report' : 'Preview Report'}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <Card className="p-16 text-center text-slate-500 bg-white border-dashed border-2 border-slate-300">
          <History className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <h3 className="text-base font-bold text-slate-800">Select a Patient to Inspect Clinical History</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Search for an existing patient above using their name, medical record number (MRN), or phone number to view their complete encounter records.
          </p>
        </Card>
      )}

      {/* Diagnostic Report Preview Modal */}
      <LabReportPreviewModal
        visitId={previewVisitId}
        isOpen={!!previewVisitId}
        onClose={() => setPreviewVisitId(null)}
      />

      {/* Receipt Print Modal */}
      <ReceiptPrintModal
        visitDetail={receiptVisitDetail}
        hospital={hospitalSettings || null}
        isOpen={!!receiptVisitDetail}
        onClose={() => setReceiptVisitDetail(null)}
      />
    </div>
  );
};
