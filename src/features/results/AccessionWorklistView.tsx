import React, { useState, useEffect, useCallback } from 'react';
import { WorklistOrderItem } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Alert } from '../../components/common/Alert';
import { formatDateTime, calculateAge } from '../../lib/utils';
import { ResultEntryModal } from './ResultEntryModal';
import { LabReportPreviewModal } from '../reports/LabReportPreviewModal';
import {
  Search,
  RotateCw,
  Clock,
  AlertCircle,
  FlaskConical,
  Eye,
  Edit,
} from 'lucide-react';

export const AccessionWorklistView: React.FC = () => {
  const [worklist, setWorklist] = useState<WorklistOrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'draft' | 'reviewed' | 'completed'>('all');

  // Active Modals
  const [activeOrderItemId, setActiveOrderItemId] = useState<number | null>(null);
  const [previewVisitId, setPreviewVisitId] = useState<number | null>(null);

  const fetchWorklist = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await window.electronAPI.results.getWorklist({
        query: searchQuery.trim() || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
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
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchWorklist();
  }, [fetchWorklist]);

  // Compute summary metrics
  const summaryMetrics = React.useMemo(() => {
    const total = worklist.length;
    const pending = worklist.filter(
      (w) =>
        (w.orderItemStatus === 'ordered' || w.orderItemStatus === 'pending' || w.parametersEntered === 0) &&
        w.orderItemStatus !== 'completed' &&
        w.resultStatus !== 'finalized'
    ).length;
    const draft = worklist.filter((w) => w.resultStatus === 'draft' && w.orderItemStatus !== 'completed').length;
    const reviewed = worklist.filter((w) => w.resultStatus === 'reviewed' && w.orderItemStatus !== 'completed').length;
    const completed = worklist.filter((w) => w.orderItemStatus === 'completed' || w.resultStatus === 'finalized').length;
    return { total, pending, draft, reviewed, completed };
  }, [worklist]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-brand-600" />
            Specimen Accession & Result Entry Desk
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Capture observed clinical values, evaluate reference ranges, and finalize verified laboratory reports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchWorklist} isLoading={isLoading}>
            <RotateCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh Worklist
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total In Queue
          </span>
          <span className="text-xl font-bold text-slate-900 mt-0.5 block">{summaryMetrics.total}</span>
        </Card>

        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider block">
            Pending Entry
          </span>
          <span className="text-xl font-bold text-amber-700 mt-0.5 block">{summaryMetrics.pending}</span>
        </Card>

        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[11px] font-semibold text-sky-600 uppercase tracking-wider block">
            Draft In Progress
          </span>
          <span className="text-xl font-bold text-sky-700 mt-0.5 block">{summaryMetrics.draft}</span>
        </Card>

        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider block">
            Under Review
          </span>
          <span className="text-xl font-bold text-indigo-700 mt-0.5 block">{summaryMetrics.reviewed}</span>
        </Card>

        <Card className="p-3 bg-white border-slate-200">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block">
            Finalized Reports
          </span>
          <span className="text-xl font-bold text-emerald-700 mt-0.5 block">{summaryMetrics.completed}</span>
        </Card>
      </div>

      {/* Search & Filter Toolbar */}
      <Card className="p-4 bg-white border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Patient Name, MRN, Visit #, or Test Code..."
              className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            {(
              [
                { id: 'all', label: 'All Orders' },
                { id: 'pending', label: 'Pending' },
                { id: 'draft', label: 'Draft' },
                { id: 'reviewed', label: 'Reviewed' },
                { id: 'completed', label: 'Finalized' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Main Worklist Table */}
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
                <th className="py-3 px-4">Visit & Order Date</th>
                <th className="py-3 px-4">Patient Profile</th>
                <th className="py-3 px-4">Ordered Test</th>
                <th className="py-3 px-4">Referring Doctor</th>
                <th className="py-3 px-4 text-center">Parameters</th>
                <th className="py-3 px-4 text-center">Workflow Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RotateCw className="w-4 h-4 animate-spin text-brand-500" />
                      <span>Loading laboratory worklist...</span>
                    </div>
                  </td>
                </tr>
              ) : worklist.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-700">No Orders in Accession Worklist</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      New visit orders registered through the billing desk will appear here automatically.
                    </p>
                  </td>
                </tr>
              ) : (
                worklist.map((item) => {
                  const age = calculateAge(item.patientDob);
                  const isFinalized = item.orderItemStatus === 'completed' || item.resultStatus === 'finalized';
                  const percentComplete =
                    item.parametersTotal > 0
                      ? Math.round((item.parametersEntered / item.parametersTotal) * 100)
                      : 0;

                  return (
                    <tr key={item.orderItemId} className="hover:bg-slate-50/70 transition-colors">
                      {/* Visit Number & Order Date */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 block">{item.visitNumber}</span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(item.orderDate)}
                        </span>
                      </td>

                      {/* Patient Details */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{item.patientName}</span>
                        <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
                          {item.patientMrn} • {age ? age.formatted : 'Age —'} •{' '}
                          <span className="capitalize">{item.patientGender}</span>
                        </span>
                      </td>

                      {/* Test Details */}
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900 block">{item.testName}</span>
                        <span className="text-[11px] text-slate-500 font-mono inline-block bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 mt-0.5">
                          {item.testCode}
                        </span>
                      </td>

                      {/* Doctor */}
                      <td className="py-3 px-4 text-slate-700">
                        {item.doctorName ? (
                          <span className="font-medium">{item.doctorName}</span>
                        ) : (
                          <span className="text-slate-400 italic">Self-referred</span>
                        )}
                      </td>

                      {/* Parameter Completion */}
                      <td className="py-3 px-4 text-center">
                        <span className="font-mono font-semibold text-slate-800">
                          {item.parametersEntered} / {item.parametersTotal}
                        </span>
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 mx-auto mt-1 overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              percentComplete === 100 ? 'bg-emerald-500' : 'bg-brand-500'
                            }`}
                            style={{ width: `${percentComplete}%` }}
                          />
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {isFinalized ? (
                          <Badge variant="success">Finalized</Badge>
                        ) : item.resultStatus === 'reviewed' ? (
                          <Badge variant="info">Reviewed</Badge>
                        ) : item.resultStatus === 'draft' ? (
                          <Badge variant="warning">Draft</Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isFinalized ? (
                            <Button
                              size="sm"
                              variant="primary"
                              className="text-xs h-7 px-2.5"
                              onClick={() => setActiveOrderItemId(item.orderItemId)}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              {item.resultStatus === 'draft' || item.resultStatus === 'reviewed'
                                ? 'Continue Entry'
                                : 'Enter Results'}
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                                onClick={() => setPreviewVisitId(item.visitId)}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                Report
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2 text-slate-700"
                                onClick={() => setActiveOrderItemId(item.orderItemId)}
                              >
                                Detail
                              </Button>
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
      </Card>

      {/* Result Entry Modal */}
      <ResultEntryModal
        orderItemId={activeOrderItemId}
        isOpen={!!activeOrderItemId}
        onClose={() => setActiveOrderItemId(null)}
        onSaved={fetchWorklist}
        onFinalized={(visitId) => {
          fetchWorklist();
          setPreviewVisitId(visitId);
        }}
      />

      {/* Lab Report Preview Modal */}
      <LabReportPreviewModal
        visitId={previewVisitId}
        isOpen={!!previewVisitId}
        onClose={() => setPreviewVisitId(null)}
      />
    </div>
  );
};
