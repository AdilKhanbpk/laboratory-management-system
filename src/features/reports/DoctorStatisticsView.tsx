import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DoctorReferralStats, Doctor } from '../../types';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatCurrency } from '../../lib/utils';
import { DoctorPercentageSettlementView } from './DoctorPercentageSettlementView';
import {
  RotateCw,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Percent,
  BarChart3,
} from 'lucide-react';

/*
 * Design tokens:
 *   primary        #0F766E   primary hover  #115E59
 *   page bg        #F5F7FA   surface        #FFFFFF
 *   text           #1F2937   muted text     #64748B
 *   border         #E2E8F0
 *   warning        #D97706   error          #DC2626   success #15803D
 * Radius: 8px everywhere. No shadows. Teal is used only for selected/active/primary.
 */

type SortKey = 'visits' | 'gross' | 'net' | 'balance' | 'name';

// Local date -> YYYY-MM-DD
const toInputDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7days', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

export const DoctorStatisticsView: React.FC = () => {
  // Main view tab: 'percentage' (Doctor Percentage & Settlements) or 'referrals' (Volume stats)
  const [activeTab, setActiveTab] = useState<'percentage' | 'referrals'>('percentage');

  // Referrals tab states
  const [stats, setStats] = useState<DoctorReferralStats[]>([]);
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activePreset, setActivePreset] = useState<PresetId | null>('all');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('visits');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const requestId = useRef(0);

  useEffect(() => {
    window.electronAPI.doctors
      .list()
      .then((res) => {
        if (res.success && res.data) setDoctorsList(res.data);
      })
      .catch((err) => console.error('Failed to load doctors list:', err));
  }, []);

  const fetchStats = useCallback(async () => {
    const thisRequest = ++requestId.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const query: any = {};
      if (startDate) query.startDate = new Date(startDate).toISOString();
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.endDate = end.toISOString();
      }
      if (selectedDoctorId !== 'all') {
        query.doctorId = parseInt(selectedDoctorId, 10);
      }

      const res = await window.electronAPI.reports.getDoctorStats(query);
      if (thisRequest !== requestId.current) return;
      if (res.success && res.data) {
        setStats(res.data);
      } else {
        setErrorMessage(res.error || 'Could not load doctor referral statistics.');
      }
    } catch (err: any) {
      if (thisRequest !== requestId.current) return;
      setErrorMessage(err?.message || 'Could not reach the statistics service.');
    } finally {
      if (thisRequest === requestId.current) setIsLoading(false);
    }
  }, [startDate, endDate, selectedDoctorId]);

  useEffect(() => {
    if (activeTab === 'referrals') {
      fetchStats();
    }
  }, [activeTab, fetchStats]);

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

  const sortedStats = useMemo(() => {
    const copy = [...stats];
    copy.sort((a, b) => {
      let comp = 0;
      if (sortBy === 'visits') comp = a.totalVisits - b.totalVisits;
      else if (sortBy === 'gross') comp = a.grossRevenuePaisa - b.grossRevenuePaisa;
      else if (sortBy === 'net') comp = a.netRevenuePaisa - b.netRevenuePaisa;
      else if (sortBy === 'balance') comp = a.totalBalancePaisa - b.totalBalancePaisa;
      else comp = a.doctorName.localeCompare(b.doctorName);
      return sortDirection === 'desc' ? -comp : comp;
    });
    return copy;
  }, [stats, sortBy, sortDirection]);

  const totals = useMemo(
    () =>
      stats.reduce(
        (acc, s) => {
          acc.totalVisits += s.totalVisits;
          acc.uniquePatients += s.uniquePatients;
          acc.totalTestsOrdered += s.totalTestsOrdered;
          acc.grossRevenuePaisa += s.grossRevenuePaisa;
          acc.netRevenuePaisa += s.netRevenuePaisa;
          acc.totalDiscountPaisa += s.totalDiscountPaisa;
          acc.totalPaidPaisa += s.totalPaidPaisa;
          acc.totalBalancePaisa += s.totalBalancePaisa;
          return acc;
        },
        {
          totalVisits: 0,
          uniquePatients: 0,
          totalTestsOrdered: 0,
          grossRevenuePaisa: 0,
          netRevenuePaisa: 0,
          totalDiscountPaisa: 0,
          totalPaidPaisa: 0,
          totalBalancePaisa: 0,
        }
      ),
    [stats]
  );

  const toggleSort = (column: SortKey) => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDirection(column === 'name' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortBy !== column) return <ChevronsUpDown className="w-3.5 h-3.5 text-slate-300" />;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-[#0F766E]" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-[#0F766E]" />
    );
  };

  const sortable = (
    column: SortKey,
    label: string,
    align: 'left' | 'center' | 'right'
  ) => (
    <th
      scope="col"
      aria-sort={
        sortBy === column ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
      }
      className={`p-0 border-r border-[#E2E8F0] last:border-r-0 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className={`w-full flex items-center gap-1 px-3 py-2.5 font-semibold text-[#1F2937] hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F766E] ${
          align === 'right'
            ? 'justify-end'
            : align === 'center'
            ? 'justify-center'
            : 'justify-start'
        }`}
      >
        {label}
        <SortIcon column={column} />
      </button>
    </th>
  );

  const plainHead = (label: string, align: 'center' | 'right') => (
    <th
      scope="col"
      className={`px-3 py-2.5 font-semibold text-[#1F2937] border-r border-[#E2E8F0] last:border-r-0 ${
        align === 'right' ? 'text-right' : 'text-center'
      }`}
    >
      {label}
    </th>
  );

  const num = 'tabular-nums';
  const cell = 'px-3 py-2.5 border-r border-[#E2E8F0] last:border-r-0';

  const summary: { label: string; value: string | number; note?: string; alert?: boolean }[] = [
    { label: 'Visits', value: totals.totalVisits, note: `${totals.uniquePatients} patients` },
    { label: 'Tests ordered', value: totals.totalTestsOrdered },
    { label: 'Gross billed', value: formatCurrency(totals.grossRevenuePaisa) },
    { label: 'Discounts', value: formatCurrency(totals.totalDiscountPaisa) },
    { label: 'Net invoiced', value: formatCurrency(totals.netRevenuePaisa) },
    {
      label: 'Balance due',
      value: formatCurrency(totals.totalBalancePaisa),
      alert: totals.totalBalancePaisa > 0,
    },
  ];

  const inputCls =
    'h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-[13px] text-[#1F2937] ' +
    'focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

  return (
    <div className="space-y-5 text-[#1F2937]">
      {/* Page Header with Main Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Doctor Statistics & Settlements</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage referring doctors, test commissions, payouts, and referral volume.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('percentage')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'percentage'
                ? 'bg-[#0F766E] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100'
            }`}
          >
            <Percent className="w-3.5 h-3.5" />
            <span>Doctor Percentage & Settlements</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('referrals')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'referrals'
                ? 'bg-[#0F766E] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Referral Volume & Billing</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Doctor Percentage & Settlements View */}
      {activeTab === 'percentage' && <DoctorPercentageSettlementView />}

      {/* Tab 2: Referral Volume & Billing View */}
      {activeTab === 'referrals' && (
        <div className="space-y-5">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 pb-4 border-b border-[#E2E8F0]">
            <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white p-0.5">
              {PRESETS.map((p) => {
                const active = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    aria-pressed={active}
                    className={`h-7 px-3 rounded-md text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] ${
                      active
                        ? 'bg-[#0F766E] text-white'
                        : 'text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <label className="flex flex-col gap-1 text-xs text-[#64748B]">
              From
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset(null);
                }}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[#64748B]">
              To
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset(null);
                }}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[#64748B]">
              Doctor
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className={`${inputCls} min-w-[200px]`}
              >
                <option value="all">All doctors & direct walk-ins</option>
                <option value="0">Direct walk-in (no referring doctor)</option>
                {doctorsList.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.full_name}
                    {doc.specialization ? ` · ${doc.specialization}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={fetchStats} isLoading={isLoading}>
                <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </Button>
            </div>
          </div>

          {errorMessage && (
            <Alert type="error">
              {errorMessage}
            </Alert>
          )}

          {/* KPI summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {summary.map((s) => (
              <div
                key={s.label}
                className={`p-3 rounded-lg border bg-white ${
                  s.alert ? 'border-[#DC2626] bg-red-50/30' : 'border-[#E2E8F0]'
                }`}
              >
                <div className="text-xs text-[#64748B]">{s.label}</div>
                <div
                  className={`text-lg font-semibold mt-0.5 tabular-nums ${
                    s.alert ? 'text-[#DC2626]' : 'text-[#1F2937]'
                  }`}
                >
                  {s.value}
                </div>
                {s.note && <div className="text-[11px] text-[#64748B] mt-0.5">{s.note}</div>}
              </div>
            ))}
          </div>

          {/* Table */}
          <section className="rounded-lg border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    {sortable('name', 'Doctor', 'left')}
                    {plainHead('Patients', 'right')}
                    {plainHead('Tests', 'right')}
                    {sortable('gross', 'Gross billed', 'right')}
                    {plainHead('Discounts', 'right')}
                    {sortable('net', 'Net billed', 'right')}
                    {plainHead('Paid', 'right')}
                    {sortable('balance', 'Balance due', 'right')}
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#E2E8F0]">
                  {sortedStats.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#64748B]">
                        {isLoading
                          ? 'Loading doctor statistics...'
                          : 'No referral activity matches the selected criteria.'}
                      </td>
                    </tr>
                  ) : (
                    sortedStats.map((doc) => (
                      <tr key={doc.doctorId} className="hover:bg-slate-50 transition-colors">
                        <td className={`${cell} font-medium`}>
                          <div>{doc.doctorName}</div>
                          {doc.specialization && (
                            <div className="text-[11px] text-[#64748B] font-normal">
                              {doc.specialization}
                            </div>
                          )}
                        </td>
                        <td className={`${cell} text-right ${num}`}>{doc.uniquePatients}</td>
                        <td className={`${cell} text-right ${num}`}>{doc.totalTestsOrdered}</td>
                        <td className={`${cell} text-right ${num}`}>
                          {formatCurrency(doc.grossRevenuePaisa)}
                        </td>
                        <td className={`${cell} text-right ${num} text-[#64748B]`}>
                          {doc.totalDiscountPaisa > 0 ? formatCurrency(doc.totalDiscountPaisa) : '—'}
                        </td>
                        <td className={`${cell} text-right ${num} font-medium`}>
                          {formatCurrency(doc.netRevenuePaisa)}
                        </td>
                        <td className={`${cell} text-right ${num}`}>
                          {formatCurrency(doc.totalPaidPaisa)}
                        </td>
                        <td
                          className={`${cell} text-right ${num} ${
                            doc.totalBalancePaisa > 0 ? 'font-semibold text-[#DC2626]' : 'text-[#64748B]'
                          }`}
                        >
                          {doc.totalBalancePaisa > 0 ? formatCurrency(doc.totalBalancePaisa) : 'Paid'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>

                {sortedStats.length > 0 && (
                  <tfoot className="bg-[#F8FAFC] border-t border-[#CBD5E1] font-semibold">
                    <tr>
                      <td className={cell}>Total</td>
                      <td className={`${cell} text-right ${num}`}>{totals.uniquePatients}</td>
                      <td className={`${cell} text-right ${num}`}>{totals.totalTestsOrdered}</td>
                      <td className={`${cell} text-right ${num}`}>
                        {formatCurrency(totals.grossRevenuePaisa)}
                      </td>
                      <td className={`${cell} text-right ${num}`}>
                        {formatCurrency(totals.totalDiscountPaisa)}
                      </td>
                      <td className={`${cell} text-right ${num}`}>
                        {formatCurrency(totals.netRevenuePaisa)}
                      </td>
                      <td className={`${cell} text-right ${num}`}>
                        {formatCurrency(totals.totalPaidPaisa)}
                      </td>
                      <td className={`${cell} text-right ${num}`}>
                        {formatCurrency(totals.totalBalancePaisa)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
