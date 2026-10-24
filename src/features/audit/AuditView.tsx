import React, { useState, useEffect } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { formatDateTime } from '../../lib/utils';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { AuditLogEntry } from '../../types';

export const AuditView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await window.electronAPI.audit.getRecent(100);
      if (res.success && res.data) {
        setLogs(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch audit log:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

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
        <Button variant="outline" size="sm" onClick={fetchLogs} isLoading={isLoading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh Trail
        </Button>
      </div>

      <Card
        title="Recent Audit Events"
        subtitle="Stored securely in the encrypted audit_logs table (passwords & keys strictly redacted)"
      >
        {logs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No audit logs recorded yet.</p>
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
          </div>
        )}
      </Card>
    </div>
  );
};

