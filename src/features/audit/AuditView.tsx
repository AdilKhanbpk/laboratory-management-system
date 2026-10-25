import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { formatDateTime } from '../../lib/utils';
import { RefreshCw, ShieldAlert, ChevronDown, Calendar, Filter } from 'lucide-react';
import type { AuditLogEntry } from '../../types';

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

type DatePreset = '7days' | '1month' | 'all' | 'custom';

export const AuditView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasMore, setHasMore] = useState(true);

  // Date filters: default to last 1 week
  const [preset, setPreset] = useState<DatePreset>('7days');
  const [startDate, setStartDate] = useState<string>(getSevenDaysAgo());
  const [endDate, setEndDate] = useState<string>(getToday());

  const fetchLogs = useCallback(async (customStart?: string, customEnd?: string) => {
    setIsLoading(true);
    try {
      const sDate = customStart !== undefined ? customStart : startDate;
      const eDate = customEnd !== undefined ? customEnd : endDate;

      const startISO = sDate ? new Date(`${sDate}T00:00:00`).toISOString() : undefined;
      const endISO = eDate ? new Date(`${eDate}T23:59:59.999`).toISOString() : undefined;

      const res = await window.electronAPI.audit.query({
        startDate: startISO,
        endDate: endISO,
        limit: 100,
        offset: 0,
      });

      const data = res.data;
      if (res.success && data) {
        setLogs(data.logs);
        setTotalCount(data.total);
        setHasMore(data.hasMore);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Handle Preset Selection
  const applyPreset = (newPreset: DatePreset) => {
    setPreset(newPreset);
    if (newPreset === '7days') {
      const s = getSevenDaysAgo();
      const e = getToday();
      setStartDate(s);
      setEndDate(e);
      fetchLogs(s, e);
    } else if (newPreset === '1month') {
      const s = getOneMonthAgo();
      const e = getToday();
      setStartDate(s);
      setEndDate(e);
      fetchLogs(s, e);
    } else if (newPreset === 'all') {
      setStartDate('');
      setEndDate('');
      fetchLogs('', '');
    }
  };

  // Load More: When in 7days or custom date mode, load the previous 1 week
  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    try {
      if (startDate) {
        // Calculate previous 1 week chunk from current startDate
        const curStart = new Date(`${startDate}T00:00:00`);
        const prevStart = new Date(curStart);
        prevStart.setDate(prevStart.getDate() - 7);

        const newStartStr = getFormattedDate(prevStart);
        const newStartISO = new Date(`${newStartStr}T00:00:00`).toISOString();
        const curStartISO = new Date(`${startDate}T00:00:00`).toISOString();

        // Query the slice from prevStart up to curStart
        const res = await window.electronAPI.audit.query({
          startDate: newStartISO,
          endDate: curStartISO,
          limit: 100,
          offset: 0,
        });

        const data = res.data;
        if (res.success && data) {
          // Append previous week's logs, avoiding duplicates by id
          setLogs((existing) => {
            const existingIds = new Set(existing.map((l) => l.id));
            const newEntries = data.logs.filter((l) => !existingIds.has(l.id));
            return [...existing, ...newEntries];
          });
          setStartDate(newStartStr);
          setTotalCount((c) => c + data.logs.length);
        }
      } else {
        // Preset is 'all' - load next offset
        const res = await window.electronAPI.audit.query({
          limit: 100,
          offset: logs.length,
        });

        const data = res.data;
        if (res.success && data) {
          setLogs((existing) => [...existing, ...data.logs]);
          setHasMore(data.hasMore);
        }
      }
    } catch (err) {
      console.error('Failed to load more audit logs:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes('SUCCESS') || action.includes('INITIALIZED')) {
      return <Badge variant="success">{action}</Badge>;
    }
    if (action.includes('FAILED') || action.includes('BLOCKED') || action.includes('REJECTED')) {
      return <Badge variant="danger">{action}</Badge>;
    }
    if (action.includes('UPDATED')) {
      return <Badge variant="info">{action}</Badge>;
    }
    return <Badge variant="default">{action}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Security Audit Trail</h1>
          <p className="text-xs text-slate-500 mt-1">
            Immutable, non-tamperable record of all authentication, settings, and medical system events.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLogs()} isLoading={isLoading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh Trail
        </Button>
      </div>

      {/* Date & Preset Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-700">Filters:</span>
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => applyPreset('7days')}
                className={`px-3 py-1.5 text-xs font-medium border rounded-l-md transition-colors ${
                  preset === '7days'
                    ? 'bg-[#0F766E] text-white border-[#0F766E]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset('1month')}
                className={`px-3 py-1.5 text-xs font-medium border-t border-b border-r transition-colors ${
                  preset === '1month'
                    ? 'bg-[#0F766E] text-white border-[#0F766E]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Last 1 Month
              </button>
              <button
                type="button"
                onClick={() => applyPreset('all')}
                className={`px-3 py-1.5 text-xs font-medium border rounded-r-md transition-colors ${
                  preset === 'all'
                    ? 'bg-[#0F766E] text-white border-[#0F766E]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                All Logs
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreset('custom');
                }}
                className="h-8 px-2 text-xs border border-slate-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                title="From date"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreset('custom');
                }}
                className="h-8 px-2 text-xs border border-slate-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                title="To date"
              />
            </div>
            {preset === 'custom' && (
              <Button size="sm" variant="secondary" className="h-8 text-xs px-2.5" onClick={() => fetchLogs()}>
                Apply
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card
        title="Audit Events"
        subtitle={
          startDate && endDate
            ? `Showing logs from ${startDate} to ${endDate} (${logs.length} loaded of ${totalCount} total)`
            : `Showing all logs (${logs.length} loaded of ${totalCount} total)`
        }
      >
        {logs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No audit logs recorded for the selected period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity</th>
                  <th className="py-2.5 px-3">Operator</th>
                  <th className="py-2.5 px-3">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log: any) => {
                  let formattedDetails = log.details_json;
                  try {
                    const parsed = JSON.parse(log.details_json);
                    formattedDetails = Object.entries(parsed)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' • ');
                  } catch {
                    // keep raw
                  }

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {log.entity_type} {log.entity_id ? `#${log.entity_id}` : ''}
                      </td>
                      <td className="py-3 px-3 text-slate-800 whitespace-nowrap font-medium">
                        {log.username ? `@${log.username}` : (log.user_id ? `User #${log.user_id}` : 'System')}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500 max-w-md truncate" title={log.details_json}>
                        {formattedDetails}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Load More Button */}
            {(!startDate ? hasMore : true) && (
              <div className="p-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/70">
                <span className="text-xs text-slate-500">
                  Loaded <strong className="text-slate-800">{logs.length}</strong> event{logs.length === 1 ? '' : 's'}
                  {startDate ? ` (back to ${startDate})` : ''}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  isLoading={isLoadingMore}
                  className="text-xs h-8"
                >
                  <ChevronDown className="w-3.5 h-3.5 mr-1" />
                  {startDate ? 'Load More (Previous 1 Week)' : 'Load More Records'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

