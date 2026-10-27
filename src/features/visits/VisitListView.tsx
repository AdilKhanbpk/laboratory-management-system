import React, { useState, useEffect, useCallback } from 'react';
import { Visit, VisitSearchResult, VisitDetail, HospitalSettings, SafeUser } from '../../types';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { ReceiptPrintModal } from './ReceiptPrintModal';
import { RecordPaymentModal } from './RecordPaymentModal';
import { EditVisitOrderModal } from './EditVisitOrderModal';
import { LabReportPreviewModal } from '../reports/LabReportPreviewModal';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Plus, Calendar, Filter } from 'lucide-react';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, surface #FFFFFF, table header #F8FAFC,
 *   text #1F2937, muted #64748B, border #E2E8F0 (inputs #CBD5E1),
 *   success #15803D, warning #D97706, error #DC2626.
 * Status colors appear only as a small dot next to the payment status.
 */

interface VisitListViewProps {
  hospitalSettings: HospitalSettings | null;
  currentUser?: SafeUser | null;
  onNavigateNewVisit: () => void;
}

const inputClass =
  'block w-full h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-[#0F766E] text-[13px] font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2';

const secondaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed';

const smallBtn =
  'inline-flex items-center h-7 px-2.5 rounded-md border border-[#CBD5E1] bg-white text-xs font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

const smallPrimaryBtn =
  'inline-flex items-center h-7 px-2.5 rounded-md bg-[#0F766E] text-xs font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-1';

const th = 'px-4 py-2.5 text-xs font-medium text-[#64748B] whitespace-nowrap';
const td = 'px-4 py-3 text-[13px] align-middle';

const paymentStatus: Record<string, { label: string; dot: string }> = {
  paid: { label: 'Paid', dot: 'bg-[#15803D]' },
  partially_paid: { label: 'Partly paid', dot: 'bg-[#D97706]' },
  unpaid: { label: 'Unpaid', dot: 'bg-[#DC2626]' },
};

function getFormattedDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getToday(): string {
  return getFormattedDate(new Date());
}

function getThisWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  // Monday as start of week
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return getFormattedDate(monday);
}

function getThisMonthStart(): string {
  const d = new Date();
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
  return getFormattedDate(firstDay);
}

type DatePreset = 'today' | 'this_week' | 'this_month' | 'all' | 'custom';

export const VisitListView: React.FC<VisitListViewProps> = ({
  hospitalSettings,
  currentUser,
  onNavigateNewVisit,
}) => {
  const [sessionUser, setSessionUser] = useState<SafeUser | null>(currentUser || null);

  useEffect(() => {
    if (currentUser !== undefined) {
      setSessionUser(currentUser);
    } else {
      window.electronAPI.auth.getSession().then((res) => {
        if (res.success && res.data?.user) {
          setSessionUser(res.data.user);
        }
      }).catch(() => {});
    }
  }, [currentUser]);

  const isAdmin = sessionUser?.role === 'admin';

  const [data, setData] = useState<VisitSearchResult>({
    visits: [],
    total: 0,
    page: 1,
    totalPages: 1,
    totalBilledPaisa: 0,
    totalPaidPaisa: 0,
    totalBalancePaisa: 0,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [selectedVisitDetail, setSelectedVisitDetail] = useState<VisitDetail | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [visitToCollectPayment, setVisitToCollectPayment] = useState<Visit | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [previewVisitId, setPreviewVisitId] = useState<number | null>(null);
  const [editingVisitId, setEditingVisitId] = useState<number | null>(null);

  const fetchVisits = useCallback(async () => {
    setIsLoading(true);
    try {
      const startISO = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined;
      const endISO = endDate ? new Date(`${endDate}T23:59:59.999`).toISOString() : undefined;

      const res = await window.electronAPI.visits.search({
        query: searchQuery.trim() || undefined,
        paymentStatus: statusFilter !== 'all' ? statusFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        startDate: startISO,
        endDate: endISO,
        page,
        limit: 15,
      });

      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to search visits:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, startDate, endDate, page]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  const handleOpenReceipt = async (visitId: number) => {
    try {
      const res = await window.electronAPI.visits.getById(visitId);
      if (res.success && res.data) {
        setSelectedVisitDetail(res.data);
        setIsReceiptModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to load visit details for receipt:', err);
    }
  };

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    setPage(1);
    if (preset === 'today') {
      const t = getToday();
      setStartDate(t);
      setEndDate(t);
    } else if (preset === 'this_week') {
      setStartDate(getThisWeekStart());
      setEndDate(getToday());
    } else if (preset === 'this_month') {
      setStartDate(getThisMonthStart());
      setEndDate(getToday());
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  const hasFilters = Boolean(searchQuery || statusFilter !== 'all' || startDate || endDate);

  return (
    <div className="space-y-6 pb-12 text-[#1F2937] select-text">
      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Orders and invoices</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">
            Visit history, invoice status, real-time revenue and outstanding balances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fetchVisits()} disabled={isLoading} className={secondaryBtn}>
            <RefreshCw className={`w-4 h-4 text-[#64748B] ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button type="button" onClick={onNavigateNewVisit} className={primaryBtn}>
            <Plus className="w-4 h-4" />
            New visit and bill
          </button>
        </div>
      </div>

      {/* Income & Financial Summary Live Cards (Visible ONLY to Administrator) */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-3.5 shadow-sm">
            <p className="text-xs font-medium text-[#64748B]">Total Net Billed</p>
            <p className="text-lg font-bold text-[#1F2937] mt-1 tabular-nums">
              {formatCurrency(data.totalBilledPaisa ?? 0)}
            </p>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">Across {data.total} matching visit{data.total === 1 ? '' : 's'}</p>
          </div>

          <div className="bg-white border border-[#E2E8F0] border-l-4 border-l-[#15803D] rounded-lg p-3.5 shadow-sm">
            <p className="text-xs font-medium text-[#15803D]">Total Income Received</p>
            <p className="text-lg font-bold text-[#15803D] mt-1 tabular-nums">
              {formatCurrency(data.totalPaidPaisa ?? 0)}
            </p>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">Cleared & collected revenue</p>
          </div>

          <div className="bg-white border border-[#E2E8F0] border-l-4 border-l-[#D97706] rounded-lg p-3.5 shadow-sm">
            <p className="text-xs font-medium text-[#D97706]">Outstanding Balance</p>
            <p className="text-lg font-bold text-[#D97706] mt-1 tabular-nums">
              {formatCurrency(data.totalBalancePaisa ?? 0)}
            </p>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">Pending collection from patients</p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-lg p-3.5 shadow-sm">
            <p className="text-xs font-medium text-[#64748B]">Filtered Visits</p>
            <p className="text-lg font-bold text-[#0F766E] mt-1 tabular-nums">
              {data.total}
            </p>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">
              {statusFilter === 'all'
                ? 'All payment statuses'
                : statusFilter === 'paid'
                ? 'Paid visits only'
                : 'Unpaid & partial visits'}
            </p>
          </div>
        </div>
      )}

      {/* Filters and table share one panel */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {/* Filter Toolbar */}
        <div className="flex flex-col gap-3 px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0]">
          {/* Row 1: Search and Payment Status Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            <div className="relative lg:col-span-8">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#94A3B8]" aria-hidden="true" />
              <input
                type="text"
                aria-label="Search visits"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by visit number, MRN, patient or invoice"
                className={`${inputClass} pl-9`}
              />
            </div>

            <div className="lg:col-span-4 flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#64748B] shrink-0" />
              <select
                aria-label="Filter by payment status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'all' | 'paid' | 'unpaid');
                  setPage(1);
                }}
                className={inputClass}
              >
                <option value="all">All (Paid & Unpaid)</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid / Partial</option>
              </select>
            </div>
          </div>

          {/* Row 2: Date Presets & Date to Date Pickers */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
              <span className="text-xs font-medium text-[#64748B]">Date filter:</span>
              <div className="inline-flex rounded-md border border-[#CBD5E1] bg-white p-0.5" role="group">
                <button
                  type="button"
                  onClick={() => applyDatePreset('today')}
                  className={`h-6 px-2.5 rounded text-xs font-medium transition-colors ${
                    datePreset === 'today'
                      ? 'bg-[#0F766E] text-white'
                      : 'text-[#64748B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('this_week')}
                  className={`h-6 px-2.5 rounded text-xs font-medium transition-colors ${
                    datePreset === 'this_week'
                      ? 'bg-[#0F766E] text-white'
                      : 'text-[#64748B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('this_month')}
                  className={`h-6 px-2.5 rounded text-xs font-medium transition-colors ${
                    datePreset === 'this_month'
                      ? 'bg-[#0F766E] text-white'
                      : 'text-[#64748B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('all')}
                  className={`h-6 px-2.5 rounded text-xs font-medium transition-colors ${
                    datePreset === 'all'
                      ? 'bg-[#0F766E] text-white'
                      : 'text-[#64748B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  All Time
                </button>
              </div>
            </div>

            {/* Date to Date custom range */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#64748B]">From:</span>
                <input
                  type="date"
                  aria-label="From date"
                  title="From date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset('custom');
                    setPage(1);
                  }}
                  className="h-7 px-2 text-xs border border-[#CBD5E1] rounded bg-white text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#64748B]">To:</span>
                <input
                  type="date"
                  aria-label="To date"
                  title="To date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset('custom');
                    setPage(1);
                  }}
                  className="h-7 px-2 text-xs border border-[#CBD5E1] rounded bg-white text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <tr>
                <th scope="col" className={th}>Visit</th>
                <th scope="col" className={th}>Date and time</th>
                <th scope="col" className={th}>Patient</th>
                <th scope="col" className={th}>Referring doctor</th>
                <th scope="col" className={`${th} text-right`}>Net total</th>
                <th scope="col" className={th}>Payment</th>
                <th scope="col" className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className={isLoading ? 'opacity-60' : undefined}>
              {data.visits.length > 0 ? (
                data.visits.map((v) => {
                  const status = paymentStatus[v.payment_status || 'unpaid'] || paymentStatus.unpaid;
                  return (
                    <tr key={v.id} className="border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC]">
                      <td className={`${td} font-medium tabular-nums whitespace-nowrap`}>{v.visit_number}</td>

                      <td className={`${td} text-[#64748B] whitespace-nowrap`}>{formatDateTime(v.order_date)}</td>

                      <td className={td}>
                        <span className="block font-medium">{v.patient_name}</span>
                        <span className="block text-xs text-[#64748B]">
                          {v.patient_mrn}, <span className="capitalize">{v.patient_gender}</span>
                        </span>
                      </td>

                      <td className={td}>
                        {v.doctor_name || <span className="text-[#64748B]">Walk-in</span>}
                      </td>

                      <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                        {v.final_total !== undefined ? formatCurrency(v.final_total) : '–'}
                      </td>

                      <td className={`${td} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${status.dot}`} aria-hidden="true" />
                          {status.label}
                        </span>
                      </td>

                      <td className={`${td} whitespace-nowrap`}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className={smallBtn}
                            onClick={() => setEditingVisitId(v.id)}
                            title="Edit order, doctor, tests or bill discount"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={smallBtn}
                            onClick={() => handleOpenReceipt(v.id)}
                            title="View or print the receipt"
                          >
                            Receipt
                          </button>
                          <button
                            type="button"
                            className={smallBtn}
                            onClick={() => setPreviewVisitId(v.id)}
                            title="View the diagnostic report"
                          >
                            Report
                          </button>
                          {(v.balance_amount || 0) > 0 && (
                            <button
                              type="button"
                              className={smallPrimaryBtn}
                              onClick={() => {
                                setVisitToCollectPayment(v);
                                setIsPaymentModalOpen(true);
                              }}
                              title="Collect the outstanding balance"
                            >
                              Collect payment
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-[13px] font-medium">
                      {hasFilters ? 'No visits match these filters' : 'No visits recorded yet'}
                    </p>
                    <p className="mt-1 text-xs text-[#64748B]">
                      {hasFilters
                        ? 'Clear the search or change the filters.'
                        : 'Use New visit and bill to create the first invoice.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] text-[13px] text-[#64748B]">
          <span className="tabular-nums">
            Showing {data.visits.length} of {data.total} visits
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={`${secondaryBtn} !px-2`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="tabular-nums">
              Page {data.page} of {data.totalPages}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              className={`${secondaryBtn} !px-2`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Receipt modal */}
      <ReceiptPrintModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        visitDetail={selectedVisitDetail}
        hospital={hospitalSettings}
      />

      {/* Record payment modal */}
      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        visit={visitToCollectPayment}
        onSuccess={() => {
          fetchVisits();
        }}
      />

      {/* Lab report preview modal */}
      <LabReportPreviewModal
        visitId={previewVisitId}
        isOpen={!!previewVisitId}
        onClose={() => setPreviewVisitId(null)}
      />

      {/* Edit visit order and invoice modal */}
      <EditVisitOrderModal
        visitId={editingVisitId}
        isOpen={!!editingVisitId}
        onClose={() => setEditingVisitId(null)}
        onSuccess={() => {
          fetchVisits();
        }}
      />
    </div>
  );
};
