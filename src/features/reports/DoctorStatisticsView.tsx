import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DoctorReferralStats, Doctor } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatCurrency } from '../../lib/utils';
import {
  Calendar,
  RotateCw,
  TrendingUp,
  AlertCircle,
  ArrowUpDown,
  Filter,
} from 'lucide-react';

export const DoctorStatisticsView: React.FC = () => {
  const [stats, setStats] = useState<DoctorReferralStats[]>([]);
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'visits' | 'gross' | 'net' | 'balance' | 'name'>('visits');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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

  // Fetch statistics
  const fetchStats = useCallback(async () => {
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
      if (res.success && res.data) {
        setStats(res.data);
      } else {
        setErrorMessage(res.error || 'Failed to retrieve doctor referral statistics.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error communicating with statistics engine.');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, selectedDoctorId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Quick Date Presets
  const applyPreset = (preset: 'today' | '7days' | 'month' | 'all') => {
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(d);
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(startOfMonth.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Sort stats
  const sortedStats = useMemo(() => {
    const copy = [...stats];
    copy.sort((a, b) => {
      let comp = 0;
      if (sortBy === 'visits') {
        comp = a.totalVisits - b.totalVisits;
      } else if (sortBy === 'gross') {
        comp = a.grossRevenuePaisa - b.grossRevenuePaisa;
      } else if (sortBy === 'net') {
        comp = a.netRevenuePaisa - b.netRevenuePaisa;
      } else if (sortBy === 'balance') {
        comp = a.totalBalancePaisa - b.totalBalancePaisa;
      } else if (sortBy === 'name') {
        comp = a.doctorName.localeCompare(b.doctorName);
      }
      return sortDirection === 'desc' ? -comp : comp;
    });
    return copy;
  }, [stats, sortBy, sortDirection]);

  // Aggregated Summary Totals
  const summaryTotals = useMemo(() => {
    return stats.reduce(
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
    );
  }, [stats]);

  const toggleSort = (column: 'visits' | 'gross' | 'net' | 'balance' | 'name') => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDirection('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-brand-600" />
            Doctor Referral & Financial Statistics
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Aggregate patient volume, order counts, gross and net financial totals, and balances by referring physician.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchStats} isLoading={isLoading}>
          <RotateCw className="w-3.5 h-3.5 mr-1.5" />
          Update Statistics
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Referred Visits
          </span>
          <span className="text-xl font-bold text-slate-900 mt-0.5 block">
            {summaryTotals.totalVisits}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            {summaryTotals.uniquePatients} unique patients
          </span>
        </Card>

        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Tests Ordered
          </span>
          <span className="text-xl font-bold text-brand-600 mt-0.5 block">
            {summaryTotals.totalTestsOrdered}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Total parameters billed</span>
        </Card>

        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Gross Billed
          </span>
          <span className="text-lg font-bold text-slate-900 mt-0.5 block">
            {formatCurrency(summaryTotals.grossRevenuePaisa)}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">List catalog value</span>
        </Card>

        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
            Discounts Granted
          </span>
          <span className="text-lg font-bold text-amber-700 mt-0.5 block">
            {formatCurrency(summaryTotals.totalDiscountPaisa)}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Deductions applied</span>
        </Card>

        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
            Net Revenue
          </span>
          <span className="text-lg font-bold text-emerald-700 mt-0.5 block">
            {formatCurrency(summaryTotals.netRevenuePaisa)}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">After doctor discounts</span>
        </Card>

        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
            Outstanding Due
          </span>
          <span className="text-lg font-bold text-rose-700 mt-0.5 block">
            {formatCurrency(summaryTotals.totalBalancePaisa)}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Uncollected patient balances</span>
        </Card>
      </div>

      {/* Filter & Date Range Bar */}
      <Card className="p-4 bg-white border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Date Pickers */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className="px-2 py-1 rounded hover:bg-white text-slate-600 font-medium transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyPreset('7days')}
                className="px-2 py-1 rounded hover:bg-white text-slate-600 font-medium transition-colors"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset('month')}
                className="px-2 py-1 rounded hover:bg-white text-slate-600 font-medium transition-colors"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => applyPreset('all')}
                className="px-2 py-1 rounded hover:bg-white text-slate-600 font-medium transition-colors"
              >
                All Time
              </button>
            </div>
          </div>

          {/* Doctor Filter Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:outline-none focus:border-brand-500"
            >
              <option value="all">All Doctors & Direct Walk-ins</option>
              <option value="0">Self / Direct (No Doctor Selected)</option>
              {doctorsList.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.full_name} {doc.specialization ? `(${doc.specialization})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Main Stats Table */}
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        {errorMessage && (
          <div className="p-4 border-b border-slate-200">
            <Alert type="error">{errorMessage}</Alert>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleSort('name')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Referring Doctor</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleSort('visits')}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Visits</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">Patients</th>
                <th className="py-3 px-4 text-center">Tests</th>
                <th
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleSort('gross')}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Gross Billed</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Discounts</th>
                <th
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleSort('net')}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Net Invoiced</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Collected</th>
                <th
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleSort('balance')}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Balance Due</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RotateCw className="w-4 h-4 animate-spin text-brand-500" />
                      <span>Aggregating physician referral totals...</span>
                    </div>
                  </td>
                </tr>
              ) : sortedStats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-700">No Referral Records in this Period</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Adjust your date filters or select a different doctor.
                    </p>
                  </td>
                </tr>
              ) : (
                sortedStats.map((doc) => (
                  <tr key={doc.doctorId} className="hover:bg-slate-50/70 transition-colors">
                    {/* Doctor Details */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">{doc.doctorName}</span>
                        {doc.doctorId === 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                            Direct Walk-in
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {doc.specialization || 'General Referral'}
                      </span>
                    </td>

                    {/* Visits */}
                    <td className="py-3 px-4 text-center font-bold text-slate-900">
                      {doc.totalVisits}
                    </td>

                    {/* Patients */}
                    <td className="py-3 px-4 text-center text-slate-700">
                      {doc.uniquePatients}
                    </td>

                    {/* Tests */}
                    <td className="py-3 px-4 text-center font-semibold text-brand-600">
                      {doc.totalTestsOrdered}
                    </td>

                    {/* Gross */}
                    <td className="py-3 px-4 text-right font-medium text-slate-800">
                      {formatCurrency(doc.grossRevenuePaisa)}
                    </td>

                    {/* Discounts */}
                    <td className="py-3 px-4 text-right text-amber-700">
                      {doc.totalDiscountPaisa > 0 ? formatCurrency(doc.totalDiscountPaisa) : '—'}
                    </td>

                    {/* Net */}
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {formatCurrency(doc.netRevenuePaisa)}
                    </td>

                    {/* Collected */}
                    <td className="py-3 px-4 text-right text-emerald-700 font-medium">
                      {formatCurrency(doc.totalPaidPaisa)}
                    </td>

                    {/* Balance */}
                    <td className="py-3 px-4 text-right">
                      {doc.totalBalancePaisa > 0 ? (
                        <span className="font-bold text-rose-600">
                          {formatCurrency(doc.totalBalancePaisa)}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Clear</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
