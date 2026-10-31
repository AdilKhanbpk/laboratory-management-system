import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  Doctor,
  DoctorCommissionSummary,
  DoctorCommissionOverview,
  DoctorReferredVisitItem,
  DoctorPayoutItem,
} from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatCurrency } from '../../lib/utils';
import { RecordDoctorPayoutModal } from './RecordDoctorPayoutModal';
import { EditDoctorPayoutModal } from './EditDoctorPayoutModal';
import {
  DollarSign,
  Download,
  Printer,
  RotateCw,
  Plus,
  Pencil,
  FileText,
  User,
  ExternalLink,
  X,
} from 'lucide-react';

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7days', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

const toInputDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const DoctorPercentageSettlementView: React.FC = () => {
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unsettled' | 'settled'>('all');

  // Dates
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activePreset, setActivePreset] = useState<PresetId | null>('all');

  // Data states
  const [overview, setOverview] = useState<DoctorCommissionOverview | null>(null);
  const [singleSummary, setSingleSummary] = useState<DoctorCommissionSummary | null>(null);
  const [visits, setVisits] = useState<DoctorReferredVisitItem[]>([]);
  const [payouts, setPayouts] = useState<DoctorPayoutItem[]>([]);

  // Sub-tab when single doctor is selected: 'orders' or 'settlements'
  const [subTab, setSubTab] = useState<'orders' | 'settlements'>('orders');

  // Modals & Busy states
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [editingPayout, setEditingPayout] = useState<DoctorPayoutItem | null>(null);
  const [expandedPayoutAudits, setExpandedPayoutAudits] = useState<Record<number, boolean>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const requestId = useRef(0);

  // Load doctors list on mount
  useEffect(() => {
    window.electronAPI.doctors
      .list()
      .then((res) => {
        if (res.success && res.data) {
          setDoctorsList(res.data);
        }
      })
      .catch((err) => console.error('Failed to load doctors list:', err));
  }, []);

  const buildQuery = useCallback(() => {
    const query: any = {};
    if (startDate) query.startDate = new Date(startDate).toISOString();
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.endDate = end.toISOString();
    }
    return query;
  }, [startDate, endDate]);

  const fetchData = useCallback(async () => {
    const thisRequest = ++requestId.current;
    setIsLoading(true);
    setErrorMessage(null);

    const query = buildQuery();

    try {
      if (selectedDoctorId === 'all') {
        const [res, payoutsRes] = await Promise.all([
          window.electronAPI.doctorCommission.getOverview(query),
          window.electronAPI.doctorCommission.listPayouts(query),
        ]);

        if (thisRequest !== requestId.current) return;

        if (res.success && res.data) {
          setOverview(res.data);
          setSingleSummary(null);
          setVisits([]);
        } else {
          setErrorMessage(res.error || 'Failed to load doctor commission overview.');
        }

        if (payoutsRes.success && payoutsRes.data) {
          setPayouts(payoutsRes.data);
        }
      } else {
        const docId = parseInt(selectedDoctorId, 10);
        const [sumRes, visRes, payRes] = await Promise.all([
          window.electronAPI.doctorCommission.getSummary(docId, query),
          window.electronAPI.doctorCommission.getVisits(docId, query),
          window.electronAPI.doctorCommission.listPayouts({ ...query, doctorId: docId }),
        ]);

        if (thisRequest !== requestId.current) return;

        if (sumRes.success && sumRes.data) {
          setSingleSummary(sumRes.data);
        } else {
          setErrorMessage(sumRes.error || 'Failed to load doctor settlement summary.');
        }

        if (visRes.success && visRes.data) {
          setVisits(visRes.data);
        }

        if (payRes.success && payRes.data) {
          setPayouts(payRes.data);
        }
      }
    } catch (err: any) {
      if (thisRequest !== requestId.current) return;
      setErrorMessage(err?.message || 'Error communicating with commission engine.');
    } finally {
      if (thisRequest === requestId.current) setIsLoading(false);
    }
  }, [selectedDoctorId, buildQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const applyPreset = (preset: PresetId) => {
    const now = new Date();
    setActivePreset(preset);
    if (preset === 'today') {
      setStartDate(toInputDate(now));
      setEndDate(toInputDate(now));
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setStartDate(toInputDate(past));
      setEndDate(toInputDate(now));
    } else if (preset === 'month') {
      setStartDate(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(toInputDate(now));
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Export PDF
  const handleExportPdf = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const query = buildQuery();
      if (selectedDoctorId !== 'all') {
        query.doctorId = parseInt(selectedDoctorId, 10);
      }
      const res = await window.electronAPI.doctorCommission.exportPdf(query);
      if (res.success && res.data?.filePath) {
        setSuccessMessage(`PDF statement saved successfully: ${res.data.filePath}`);
      } else if (res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to export PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  // Print
  const handlePrint = async () => {
    setIsPrinting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const query = buildQuery();
      if (selectedDoctorId !== 'all') {
        query.doctorId = parseInt(selectedDoctorId, 10);
      }
      const res = await window.electronAPI.doctorCommission.print(query);
      if (res.success) {
        setSuccessMessage('Print dialog opened.');
      } else if (res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to print commission statement.');
    } finally {
      setIsPrinting(false);
    }
  };

  // Active doctor object
  const activeDoctor = useMemo(() => {
    if (selectedDoctorId === 'all') return null;
    const id = parseInt(selectedDoctorId, 10);
    return doctorsList.find((d) => d.id === id) || null;
  }, [doctorsList, selectedDoctorId]);

  // Filtered overview doctors
  const filteredOverviewDoctors = useMemo(() => {
    if (!overview) return [];
    let list = overview.doctors;
    if (statusFilter === 'unsettled') {
      list = list.filter((d) => d.balancePaisa > 0);
    } else if (statusFilter === 'settled') {
      list = list.filter((d) => d.balancePaisa <= 0);
    }
    return list;
  }, [overview, statusFilter]);

  // Aggregate KPI metrics - strictly isolated per selection
  const kpis = useMemo(() => {
    if (selectedDoctorId !== 'all') {
      if (singleSummary) {
        return {
          rateLabel: `${singleSummary.commissionPercentage}%`,
          invoicedBilledPaisa: singleSummary.netRevenuePaisa,
          earnedCommissionPaisa: singleSummary.totalEarnedCommissionPaisa,
          paidPaisa: singleSummary.totalPaidPaisa,
          balancePaisa: singleSummary.remainingBalancePaisa,
          visitsCount: singleSummary.totalReferredVisits,
          testsCount: singleSummary.totalTestsOrdered,
        };
      }
      return {
        rateLabel: activeDoctor ? `${activeDoctor.commission_percentage}%` : '0%',
        invoicedBilledPaisa: 0,
        earnedCommissionPaisa: 0,
        paidPaisa: 0,
        balancePaisa: 0,
        visitsCount: 0,
        testsCount: 0,
      };
    }

    if (overview) {
      return {
        rateLabel: 'Variable',
        invoicedBilledPaisa: overview.overall.netRevenuePaisa,
        earnedCommissionPaisa: overview.overall.totalEarnedCommissionPaisa,
        paidPaisa: overview.overall.totalPaidPaisa,
        balancePaisa: overview.overall.remainingBalancePaisa,
        visitsCount: overview.overall.totalReferredVisits,
        testsCount: overview.overall.totalTestsOrdered,
      };
    }

    return {
      rateLabel: '—',
      invoicedBilledPaisa: 0,
      earnedCommissionPaisa: 0,
      paidPaisa: 0,
      balancePaisa: 0,
      visitsCount: 0,
      testsCount: 0,
    };
  }, [selectedDoctorId, singleSummary, overview, activeDoctor]);

  // Helper to parse edit trails for payout notes
  const renderPayoutNotesWithAudits = (payout: DoctorPayoutItem) => {
    if (!payout.notes) return <span className="text-slate-400">—</span>;

    const isEditHistory = (str: string) =>
      /\[EDIT HISTORY/i.test(str) ||
      /Reason for change:/i.test(str) ||
      /What changed:/i.test(str);

    let baseNote = '';
    const editTrails: string[] = [];

    const parts = payout.notes.split(/(?=\[EDIT HISTORY)/i).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      if (isEditHistory(p)) {
        if (!editTrails.includes(p)) {
          editTrails.push(p);
        }
      } else {
        baseNote = baseNote ? `${baseNote}\n${p}` : p;
      }
    }

    const isExpanded = !!expandedPayoutAudits[payout.id];

    return (
      <div className="space-y-1.5 text-xs">
        {baseNote && <p className="text-slate-700 break-words">{baseNote}</p>}

        {editTrails.length > 0 && (
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() =>
                setExpandedPayoutAudits((prev) => ({
                  ...prev,
                  [payout.id]: !prev[payout.id],
                }))
              }
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                isExpanded
                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
              title={isExpanded ? 'Hide audit modification records' : 'Show audit modification records'}
            >
              <span>📝 {isExpanded ? 'Hide Audits' : `Show Audits (${editTrails.length})`}</span>
            </button>
          </div>
        )}

        {isExpanded && editTrails.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {editTrails.map((trail, idx) => (
              <div
                key={idx}
                className="rounded-md bg-amber-50/90 border border-amber-200/90 p-2 text-[11px] text-amber-950 whitespace-pre-wrap font-sans leading-relaxed shadow-xs"
              >
                <div className="font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
                  <span>📝 Modification Record:</span>
                </div>
                {trail}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Messages */}
      {errorMessage && (
        <div className="relative">
          <Alert type="error">{errorMessage}</Alert>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="absolute top-3 right-3 text-rose-500 hover:text-rose-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMessage && (
        <div className="relative">
          <Alert type="success">{successMessage}</Alert>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="absolute top-3 right-3 text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Control Bar: Filters & Actions */}
      <Card className="p-4 bg-white border-slate-200 shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left filters: Doctor Select, Date Inputs, Presets */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Doctor Select */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Doctor:</span>
              <select
                value={selectedDoctorId}
                onChange={(e) => {
                  setSelectedDoctorId(e.target.value);
                  setSingleSummary(null);
                  setVisits([]);
                  setPayouts([]);
                }}
                className="h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 font-medium focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700 min-w-[200px]"
              >
                <option value="all">👥 All Referring Doctors</option>
                {doctorsList.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.full_name} ({doc.commission_percentage}% rate)
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Inputs */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset(null);
                }}
                className="h-9 px-2.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset(null);
                }}
                className="h-9 px-2.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    activePreset === p.id
                      ? 'bg-white text-teal-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Settlement Status Filter (When all doctors) */}
            {selectedDoctorId === 'all' && (
              <div className="flex items-center gap-1.5">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="h-9 px-2.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:border-teal-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="unsettled">Has Outstanding Balance</option>
                  <option value="settled">Fully Settled</option>
                </select>
              </div>
            )}
          </div>

          {/* Right actions: Export PDF, Print, Record Payout, Refresh */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={isExporting || isLoading}
              className="gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-50"
              title="Export statement as PDF"
            >
              <Download className="w-3.5 h-3.5 text-teal-700" />
              <span>{isExporting ? 'Exporting...' : 'Export PDF'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={isPrinting || isLoading}
              className="gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-50"
              title="Print official commission statement"
            >
              <Printer className="w-3.5 h-3.5 text-teal-700" />
              <span>{isPrinting ? 'Printing...' : 'Print'}</span>
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsRecordModalOpen(true)}
              className="gap-1.5 bg-teal-700 hover:bg-teal-800 text-white"
            >
              <Plus className="w-4 h-4" />
              <span>Record Payment</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={isLoading}
              title="Refresh"
              className="p-2 text-slate-500 hover:text-slate-800"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards: Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Commission Rate</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-teal-800">{kpis.rateLabel}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {selectedDoctorId === 'all' ? 'Set per doctor' : 'Referred tests rate'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Invoiced Bill Total</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900 tabular-nums">{formatCurrency(kpis.invoicedBilledPaisa)}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {kpis.visitsCount} visits · {kpis.testsCount} tests
          </p>
        </div>

        <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/50">
          <p className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider">
            Earned Commission
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-teal-900 tabular-nums">
              {formatCurrency(kpis.earnedCommissionPaisa)}
            </span>
          </div>
          <p className="text-[11px] text-teal-700/80 mt-0.5">Doctor's gross share</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Paid
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900 tabular-nums">{formatCurrency(kpis.paidPaisa)}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Settled payouts</p>
        </div>

        <div
          className={`p-4 rounded-xl border col-span-2 md:col-span-1 ${
            kpis.balancePaisa > 0
              ? 'border-red-200 bg-red-50/60 text-red-900'
              : 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider">Remaining Balance</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold tabular-nums">{formatCurrency(kpis.balancePaisa)}</span>
          </div>
          <p className="text-[11px] mt-0.5 font-medium">
            {kpis.balancePaisa > 0 ? 'Pending payout to doctor' : 'All accounts settled'}
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      {selectedDoctorId === 'all' ? (
        /* ALL DOCTORS VIEW: Overview Table + Global Payout Ledger */
        <div className="space-y-5">
          {/* Overview Table */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Doctor Commission Summaries</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a doctor to view referred test orders breakdown and settlement ledger
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-full text-slate-700">
                {filteredOverviewDoctors.length} Doctors
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-3">Doctor</th>
                    <th className="py-2.5 px-3 text-center">Rate</th>
                    <th className="py-2.5 px-3 text-center">Visits</th>
                    <th className="py-2.5 px-3 text-right">Invoiced Bill</th>
                    <th className="py-2.5 px-3 text-right text-teal-800">Earned Commission</th>
                    <th className="py-2.5 px-3 text-right">Total Paid</th>
                    <th className="py-2.5 px-3 text-right">Balance Due</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOverviewDoctors.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No doctor commission records found for this period.
                      </td>
                    </tr>
                  ) : (
                    filteredOverviewDoctors.map((doc) => (
                      <tr key={doc.doctorId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          <div>{doc.doctorName}</div>
                          {doc.specialization && (
                            <div className="text-[11px] text-slate-400">{doc.specialization}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                            {doc.commissionPercentage}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums text-slate-600">
                          {doc.referredVisits}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                          {formatCurrency(doc.netSalesPaisa)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-teal-800">
                          {formatCurrency(doc.commissionPaisa)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                          {formatCurrency(doc.paidPaisa)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right tabular-nums font-semibold ${
                            doc.balancePaisa > 0 ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {doc.balancePaisa > 0 ? formatCurrency(doc.balancePaisa) : 'Settled'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDoctorId(String(doc.doctorId));
                                setSingleSummary(null);
                                setVisits([]);
                                setPayouts([]);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors"
                            >
                              <span>View Ledger</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDoctorId(String(doc.doctorId));
                                setIsRecordModalOpen(true);
                              }}
                              className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors"
                              title="Record payment"
                            >
                              Pay
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Global Payout Ledger */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Recorded Payouts & Settlement History</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete audit trail of all disbursements and payments to doctors
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRecordModalOpen(true)}
                className="gap-1.5 text-xs text-teal-800 border-teal-200 hover:bg-teal-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record New Payout</span>
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Doctor</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-center">Method</th>
                    <th className="py-2.5 px-3">Reference / Remarks & Audits</th>
                    <th className="py-2.5 px-3">Recorded By</th>
                    <th className="py-2.5 px-3 text-center">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payouts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No payments recorded yet.
                      </td>
                    </tr>
                  ) : (
                    payouts.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-700">
                          {pay.paymentDate.slice(0, 10)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {pay.doctorName || `Doctor #${pay.doctorId}`}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900">
                          {formatCurrency(pay.amountPaisa)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="capitalize px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                            {pay.paymentMethod.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 max-w-md">
                          {pay.reference && (
                            <div className="text-[11px] font-medium text-slate-700 mb-0.5">
                              Ref: <span className="font-mono text-slate-900">{pay.reference}</span>
                            </div>
                          )}
                          {renderPayoutNotesWithAudits(pay)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {pay.recordedByName || 'System'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setEditingPayout(pay)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-200 bg-white text-slate-600 hover:text-teal-700 hover:bg-slate-50 transition-colors"
                            title="Edit payout entry"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        /* SINGLE DOCTOR SETTLEMENT VIEW */
        <div className="space-y-4">
          {/* Doctor header card */}
          <div className="p-4 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/80 via-white to-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                <User className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{activeDoctor?.full_name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 border border-teal-300">
                    {activeDoctor?.commission_percentage}% Commission Rate
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeDoctor?.specialization || 'Consultant'} {activeDoctor?.phone_number ? `· ${activeDoctor.phone_number}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedDoctorId('all')}
                className="text-xs text-slate-600 border-slate-300"
              >
                ← Back to All Doctors
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setIsRecordModalOpen(true)}
                className="gap-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Payout</span>
              </Button>
            </div>
          </div>

          {/* Sub-tabs: Referred Orders vs Settlements */}
          <div className="flex items-center gap-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setSubTab('orders')}
              className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
                subTab === 'orders'
                  ? 'border-teal-700 text-teal-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Referred Patient Orders ({visits.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('settlements')}
              className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
                subTab === 'settlements'
                  ? 'border-teal-700 text-teal-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Payment & Settlement History ({payouts.length})</span>
            </button>
          </div>

          {/* Sub-tab 1: Referred Patient Orders */}
          {subTab === 'orders' && (
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3">Visit #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Patient</th>
                      <th className="py-2.5 px-3">Tests Ordered</th>
                      <th className="py-2.5 px-3 text-right">Invoiced Bill</th>
                      <th className="py-2.5 px-3 text-center">Rate</th>
                      <th className="py-2.5 px-3 text-right text-teal-800">Doctor Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visits.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No patient test referrals found for this doctor in the selected date range.
                        </td>
                      </tr>
                    ) : (
                      visits.map((vis) => (
                        <tr key={vis.visitId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                            {vis.visitNumber}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                            {vis.orderDate.slice(0, 10)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-900">{vis.patientName}</div>
                            {vis.patientMrn && (
                              <div className="text-[11px] text-slate-400 font-mono">MRN: {vis.patientMrn}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 max-w-xs truncate text-slate-600" title={vis.testNames}>
                            {vis.testNames || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-700 font-medium">
                            {formatCurrency(vis.netTotalPaisa)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-teal-700 font-medium">{vis.doctorPercentage}%</span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-teal-800">
                            {formatCurrency(vis.commissionPaisa)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {visits.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3">
                          Total ({visits.length} Referred Visits)
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {formatCurrency(kpis.invoicedBilledPaisa)}
                        </td>
                        <td className="py-2.5 px-3 text-center">{kpis.rateLabel}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-teal-800">
                          {formatCurrency(kpis.earnedCommissionPaisa)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          )}

          {/* Sub-tab 2: Payment & Settlement History */}
          {subTab === 'settlements' && (
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Amount Paid</th>
                      <th className="py-2.5 px-3 text-center">Payment Method</th>
                      <th className="py-2.5 px-3">Reference / Remarks & Audits</th>
                      <th className="py-2.5 px-3">Recorded By</th>
                      <th className="py-2.5 px-3 text-center">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payouts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No settlements or payments recorded for this doctor yet.
                        </td>
                      </tr>
                    ) : (
                      payouts.map((pay) => (
                        <tr key={pay.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 whitespace-nowrap text-slate-700">
                            {pay.paymentDate.slice(0, 10)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900">
                            {formatCurrency(pay.amountPaisa)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="capitalize px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                              {pay.paymentMethod.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 max-w-md">
                            {pay.reference && (
                              <div className="text-[11px] font-medium text-slate-700 mb-0.5">
                                Ref: <span className="font-mono text-slate-900">{pay.reference}</span>
                              </div>
                            )}
                            {renderPayoutNotesWithAudits(pay)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                            {pay.recordedByName || 'System'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setEditingPayout(pay)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-200 bg-white text-slate-600 hover:text-teal-700 hover:bg-slate-50 transition-colors"
                              title="Edit payout entry"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {payouts.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                      <tr>
                        <td className="py-2.5 px-3">Total Paid</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {formatCurrency(kpis.paidPaisa)}
                        </td>
                        <td colSpan={4}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Record Payout Modal */}
      <RecordDoctorPayoutModal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        onSuccess={() => {
          fetchData();
          setSuccessMessage('Doctor commission payment recorded successfully.');
        }}
        doctors={doctorsList}
        defaultDoctorId={selectedDoctorId !== 'all' ? parseInt(selectedDoctorId, 10) : undefined}
        pendingBalancePaisa={kpis.balancePaisa > 0 ? kpis.balancePaisa : 0}
      />

      {/* Edit Payout Modal */}
      <EditDoctorPayoutModal
        isOpen={!!editingPayout}
        payout={editingPayout}
        doctorName={editingPayout?.doctorName || 'Doctor'}
        onClose={() => setEditingPayout(null)}
        onSuccess={() => {
          fetchData();
          setSuccessMessage('Doctor payout updated and modification details logged.');
        }}
      />
    </div>
  );
};
