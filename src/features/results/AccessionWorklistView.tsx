import React, { useState, useEffect, useCallback } from 'react';
import { WorklistOrderItem } from '../../types';
import { formatDateTime, calculateAge } from '../../lib/utils';
import { ResultEntryModal, VisitTestItem } from './ResultEntryModal';
import { LabReportPreviewModal } from '../reports/LabReportPreviewModal';
import { Search, RotateCw, AlertCircle } from 'lucide-react';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, surface #FFFFFF, table header #F8FAFC,
 *   text #1F2937, muted #64748B, border #E2E8F0 (inputs #CBD5E1),
 *   success #15803D, warning #D97706, error #DC2626.
 * Workflow status is a small colored dot beside a plain label. Nothing else is colored.
 */

export interface GroupedTestItem {
  orderItemId: number;
  testId: number;
  testCode: string;
  testName: string;
  orderItemStatus: string;
  resultStatus: string;
  parametersTotal: number;
  parametersEntered: number;
}

export interface GroupedVisit {
  visitId: number;
  visitNumber: string;
  patientId: number;
  patientName: string;
  patientMrn: string;
  patientGender: string;
  patientDob: string | null;
  doctorName: string | null;
  orderDate: string;
  tests: GroupedTestItem[];
  parametersTotal: number;
  parametersEntered: number;
  overallStatus: 'pending' | 'draft' | 'reviewed' | 'finalized';
}

type StatusFilter = 'all' | 'pending' | 'draft' | 'reviewed' | 'completed';

const inputClass =
  'block w-full h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

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
const td = 'px-4 py-3 text-[13px] align-top';

const workflowStatus: Record<GroupedVisit['overallStatus'], { label: string; dot: string }> = {
  pending: { label: 'Pending', dot: 'bg-[#94A3B8]' },
  draft: { label: 'Draft', dot: 'bg-[#D97706]' },
  reviewed: { label: 'Reviewed', dot: 'bg-[#0F766E]' },
  finalized: { label: 'Finalized', dot: 'bg-[#15803D]' },
};

function getFormattedDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSevenDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return getFormattedDate(d);
}

function getOneMonthAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return getFormattedDate(d);
}

function getToday(): string {
  return getFormattedDate(new Date());
}

type DatePreset = '1month' | '7days' | 'all' | 'custom';

export const AccessionWorklistView: React.FC = () => {
  const [worklist, setWorklist] = useState<WorklistOrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters: Default active tab is 'pending', default date is 1 month
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [datePreset, setDatePreset] = useState<DatePreset>('7days');
  const [startDate, setStartDate] = useState<string>(getOneMonthAgo());
  const [endDate, setEndDate] = useState<string>(getToday());

  // Active modals
  const [activeOrderItemId, setActiveOrderItemId] = useState<number | null>(null);
  const [activeVisitTests, setActiveVisitTests] = useState<VisitTestItem[]>([]);
  const [previewVisitId, setPreviewVisitId] = useState<number | null>(null);

  const fetchWorklist = useCallback(async (customStart?: string, customEnd?: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const sDate = customStart !== undefined ? customStart : startDate;
      const eDate = customEnd !== undefined ? customEnd : endDate;

      const startISO = sDate ? new Date(`${sDate}T00:00:00`).toISOString() : undefined;
      const endISO = eDate ? new Date(`${eDate}T23:59:59.999`).toISOString() : undefined;

      const res = await window.electronAPI.results.getWorklist({
        query: searchQuery.trim() || undefined,
        startDate: startISO,
        endDate: endISO,
      });

      if (res.success && res.data) {
        setWorklist(res.data);
      } else {
        setErrorMessage(res.error || 'Failed to retrieve specimen accession worklist.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error communicating with laboratory database.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, startDate, endDate]);

  useEffect(() => {
    fetchWorklist();
  }, [fetchWorklist]);

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === '1month') {
      const s = getOneMonthAgo();
      const e = getToday();
      setStartDate(s);
      setEndDate(e);
      fetchWorklist(s, e);
    } else if (preset === '7days') {
      const s = getSevenDaysAgo();
      const e = getToday();
      setStartDate(s);
      setEndDate(e);
      fetchWorklist(s, e);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      fetchWorklist('', '');
    }
  };

  // Group raw order items by visit (bill)
  const groupedVisits = React.useMemo<GroupedVisit[]>(() => {
    const visitMap = new Map<number, GroupedVisit>();

    for (const item of worklist) {
      let visit: GroupedVisit | undefined = visitMap.get(item.visitId);
      if (!visit) {
        const created: GroupedVisit = {
          visitId: item.visitId,
          visitNumber: item.visitNumber,
          patientId: item.patientId,
          patientName: item.patientName,
          patientMrn: item.patientMrn,
          patientGender: item.patientGender,
          patientDob: item.patientDob ?? null,
          doctorName: item.doctorName ?? null,
          orderDate: item.orderDate,
          tests: [],
          parametersTotal: 0,
          parametersEntered: 0,
          overallStatus: 'pending',
        };
        visitMap.set(item.visitId, created);
        visit = created;
      }

      visit.tests.push({
        orderItemId: item.orderItemId,
        testId: item.testId,
        testCode: item.testCode,
        testName: item.testName,
        orderItemStatus: item.orderItemStatus,
        resultStatus: item.resultStatus,
        parametersTotal: item.parametersTotal,
        parametersEntered: item.parametersEntered,
      });

      visit.parametersTotal += item.parametersTotal;
      visit.parametersEntered += item.parametersEntered;
    }

    // Overall status for each visit
    for (const visit of visitMap.values()) {
      // Every test in the visit must have at least one parameter entered
      const allTestsHaveResults =
        visit.tests.length > 0 &&
        visit.tests.every((t) => t.parametersEntered > 0);

      const allFinalized =
        allTestsHaveResults &&
        visit.tests.every((t) => t.orderItemStatus === 'completed' || t.resultStatus === 'finalized');

      const anyReviewed = visit.tests.some((t) => t.resultStatus === 'reviewed');

      if (allFinalized) {
        visit.overallStatus = 'finalized';
      } else if (anyReviewed) {
        visit.overallStatus = 'reviewed';
      } else if (allTestsHaveResults) {
        visit.overallStatus = 'draft';
      } else {
        // If any test in the visit has zero entered results, keep visit as pending
        visit.overallStatus = 'pending';
      }
    }

    return Array.from(visitMap.values());
  }, [worklist]);

  // Keep activeVisitTests in sync whenever groupedVisits updates
  useEffect(() => {
    if (activeOrderItemId) {
      const foundVisit = groupedVisits.find((v) =>
        v.tests.some((t) => t.orderItemId === activeOrderItemId)
      );
      if (foundVisit) {
        setActiveVisitTests(foundVisit.tests);
      }
    }
  }, [groupedVisits, activeOrderItemId]);

  const filteredVisits = React.useMemo(() => {
    if (statusFilter === 'all') return groupedVisits;
    if (statusFilter === 'pending') return groupedVisits.filter((v) => v.overallStatus === 'pending');
    if (statusFilter === 'draft') return groupedVisits.filter((v) => v.overallStatus === 'draft');
    if (statusFilter === 'reviewed') return groupedVisits.filter((v) => v.overallStatus === 'reviewed');
    if (statusFilter === 'completed') return groupedVisits.filter((v) => v.overallStatus === 'finalized');
    return groupedVisits;
  }, [groupedVisits, statusFilter]);

  // Counts shown on the filter tabs
  const summaryMetrics = React.useMemo(() => {
    const total = groupedVisits.length;
    const pending = groupedVisits.filter((v) => v.overallStatus === 'pending').length;
    const draft = groupedVisits.filter((v) => v.overallStatus === 'draft').length;
    const reviewed = groupedVisits.filter((v) => v.overallStatus === 'reviewed').length;
    const completed = groupedVisits.filter((v) => v.overallStatus === 'finalized').length;
    return { total, pending, draft, reviewed, completed };
  }, [groupedVisits]);

  const handleOpenVisitResults = (visit: GroupedVisit, targetOrderItemId?: number) => {
    setActiveVisitTests(visit.tests);
    if (targetOrderItemId) {
      setActiveOrderItemId(targetOrderItemId);
    } else {
      const incompleteTest = visit.tests.find((t) => t.parametersEntered < t.parametersTotal);
      setActiveOrderItemId(incompleteTest ? incompleteTest.orderItemId : visit.tests[0].orderItemId);
    }
  };

  const tabs: Array<{ id: StatusFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: summaryMetrics.total },
    { id: 'pending', label: 'Pending', count: summaryMetrics.pending },
    { id: 'draft', label: 'Draft', count: summaryMetrics.draft },
    { id: 'reviewed', label: 'Reviewed', count: summaryMetrics.reviewed },
    { id: 'completed', label: 'Finalized', count: summaryMetrics.completed },
  ];

  return (
    <div className="space-y-6 pb-12 text-[#1F2937]">
      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Specimens and results</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">
            Enter observed values, check them against reference ranges and finalize reports.
          </p>
        </div>
        <button type="button" onClick={() => fetchWorklist()} disabled={isLoading} className={secondaryBtn}>
          <RotateCw className={`w-4 h-4 text-[#64748B] ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#DC2626] bg-white px-4 py-3"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" />
          <p className="text-[13px]">{errorMessage}</p>
        </div>
      )}

      {/* Worklist: filter toolbar, then table */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="flex flex-col gap-3 px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0]">
          {/* Status tabs & Search Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div
              className="flex flex-wrap gap-1 p-1 rounded-md bg-white border border-[#CBD5E1] self-start"
              role="group"
              aria-label="Filter by status"
            >
              {tabs.map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`h-7 px-3 rounded text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] ${
                      active
                        ? 'bg-[#0F766E] text-white'
                        : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1F2937]'
                    }`}
                  >
                    {tab.label}
                    <span className={`ml-1.5 tabular-nums font-normal ${active ? 'text-white/80' : 'text-[#94A3B8]'}`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full lg:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#94A3B8]" aria-hidden="true" />
              <input
                type="text"
                aria-label="Search worklist"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient, MRN, visit or test code"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          {/* Date range filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#64748B]">Date range:</span>
              <div className="inline-flex rounded-md border border-[#CBD5E1] bg-white p-0.5" role="group">
                <button
                  type="button"
                  onClick={() => applyDatePreset('1month')}
                  className={`h-6 px-2.5 rounded text-xs font-medium transition-colors ${
                    datePreset === '1month'
                      ? 'bg-[#0F766E] text-white'
                      : 'text-[#64748B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  1 Month
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('7days')}
                  className={`h-6 px-2.5 rounded text-xs font-medium transition-colors ${
                    datePreset === '7days'
                      ? 'bg-[#0F766E] text-white'
                      : 'text-[#64748B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  Last 7 Days
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

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#64748B]">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset('custom');
                  }}
                  className="h-7 px-2 text-xs border border-[#CBD5E1] rounded bg-white text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                  title="From date"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#64748B]">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset('custom');
                  }}
                  className="h-7 px-2 text-xs border border-[#CBD5E1] rounded bg-white text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                  title="To date"
                />
              </div>
              {datePreset === 'custom' && (
                <button
                  type="button"
                  onClick={() => fetchWorklist()}
                  className="h-7 px-2 text-xs rounded bg-[#0F766E] text-white font-medium hover:bg-[#115E59]"
                >
                  Apply
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <tr>
                <th scope="col" className={th}>Visit</th>
                <th scope="col" className={th}>Patient</th>
                <th scope="col" className={th}>Tests</th>
                <th scope="col" className={th}>Referring doctor</th>
                <th scope="col" className={th}>Results entered</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && worklist.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-[#64748B]">
                    Loading worklist…
                  </td>
                </tr>
              ) : filteredVisits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-[13px] font-medium">
                      {searchQuery || statusFilter !== 'all' ? 'No orders match these filters' : 'The worklist is empty'}
                    </p>
                    <p className="mt-1 text-xs text-[#64748B]">
                      {searchQuery || statusFilter !== 'all'
                        ? 'Clear the search or choose another status.'
                        : 'Orders created at the billing desk appear here automatically.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredVisits.map((visit) => {
                  const age = calculateAge(visit.patientDob);
                  const isFinalized = visit.overallStatus === 'finalized';
                  const status = workflowStatus[visit.overallStatus];
                  const percentComplete =
                    visit.parametersTotal > 0
                      ? Math.round((visit.parametersEntered / visit.parametersTotal) * 100)
                      : 0;

                  return (
                    <tr
                      key={visit.visitId}
                      className={`border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC] ${
                        isLoading ? 'opacity-60' : ''
                      }`}
                    >
                      {/* Visit and order date */}
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="block font-medium tabular-nums">{visit.visitNumber}</span>
                        <span className="block text-xs text-[#64748B]">{formatDateTime(visit.orderDate)}</span>
                      </td>

                      {/* Patient */}
                      <td className={td}>
                        <span className="block font-medium">{visit.patientName}</span>
                        <span className="block text-xs text-[#64748B]">
                          {visit.patientMrn}, {age ? age.formatted : 'age unknown'},{' '}
                          <span className="capitalize">{visit.patientGender}</span>
                        </span>
                      </td>

                      {/* Tests: each test opens its own result entry */}
                      <td className={td}>
                        <ul className="space-y-1.5">
                          {visit.tests.map((t) => (
                            <li key={t.orderItemId} className="flex items-baseline gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenVisitResults(visit, t.orderItemId)}
                                title={`Open results for ${t.testName}`}
                                className="text-left font-medium hover:text-[#0F766E] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded"
                              >
                                {t.testName}
                              </button>
                              <span className="text-xs text-[#64748B]">{t.testCode}</span>
                              {visit.tests.length > 1 && (
                                <span className="text-xs text-[#64748B] tabular-nums">
                                  {t.parametersEntered}/{t.parametersTotal}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>

                      {/* Doctor */}
                      <td className={td}>
                        {visit.doctorName || <span className="text-[#64748B]">Self-referred</span>}
                      </td>

                      {/* Progress */}
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="block tabular-nums">
                          {visit.parametersEntered} of {visit.parametersTotal}
                        </span>
                        <div
                          className="mt-1.5 h-1 w-24 rounded-full bg-[#E2E8F0] overflow-hidden"
                          role="progressbar"
                          aria-valuenow={percentComplete}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Results entered"
                        >
                          <div className="h-full bg-[#0F766E]" style={{ width: `${percentComplete}%` }} />
                        </div>
                      </td>

                      {/* Status */}
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${status.dot}`} aria-hidden="true" />
                          {status.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className={`${td} whitespace-nowrap`}>
                        <div className="flex items-center justify-end gap-2">
                          {!isFinalized ? (
                            <button
                              type="button"
                              className={smallPrimaryBtn}
                              onClick={() => handleOpenVisitResults(visit)}
                            >
                              {visit.overallStatus === 'draft' || visit.overallStatus === 'reviewed'
                                ? 'Continue entry'
                                : 'Enter results'}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={smallBtn}
                                onClick={() => setPreviewVisitId(visit.visitId)}
                              >
                                Report
                              </button>
                              <button
                                type="button"
                                className={smallBtn}
                                onClick={() => handleOpenVisitResults(visit)}
                                title="Edit results or update report"
                              >
                                Edit results
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Result entry modal */}
      <ResultEntryModal
        orderItemId={activeOrderItemId}
        visitTests={activeVisitTests}
        isOpen={!!activeOrderItemId}
        onClose={() => {
          setActiveOrderItemId(null);
          setActiveVisitTests([]);
        }}
        onSaved={fetchWorklist}
        onFinalized={(visitId) => {
          fetchWorklist();
          setActiveOrderItemId(null);
          setActiveVisitTests([]);
          setPreviewVisitId(visitId);
        }}
        onSelectTest={(orderItemId) => setActiveOrderItemId(orderItemId)}
      />

      {/* Lab report preview modal */}
      <LabReportPreviewModal
        visitId={previewVisitId}
        isOpen={!!previewVisitId}
        onClose={() => setPreviewVisitId(null)}
      />
    </div>
  );
};