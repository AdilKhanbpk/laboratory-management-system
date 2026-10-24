import React, { useState, useEffect, useCallback } from 'react';
import { LabTest } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { formatCurrency } from '../../lib/utils';
import { TestFormModal } from './TestFormModal';
import {
  FlaskConical,
  Plus,
  Search,
  Filter,
  Edit2,
  PowerOff,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

export const TestCatalogView: React.FC = () => {
  const [tests, setTests] = useState<LabTest[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [isLoading, setIsLoading] = useState(false);

  // Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [testToEdit, setTestToEdit] = useState<LabTest | null>(null);

  const fetchTests = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await window.electronAPI.tests.list({
        search: searchQuery,
        category: selectedCategory,
        includeInactive: statusFilter === 'all' || statusFilter === 'inactive',
      });

      if (res.success && res.data) {
        let list = res.data;
        if (statusFilter === 'inactive') {
          list = list.filter((t) => t.is_active === 0);
        } else if (statusFilter === 'active') {
          list = list.filter((t) => t.is_active === 1);
        }
        setTests(list);
      }

      // Also fetch categories
      const catRes = await window.electronAPI.tests.getCategories();
      if (catRes.success && catRes.data) {
        setCategories(catRes.data);
      }
    } catch (err) {
      console.error('Failed to load test catalog:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCategory, statusFilter]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  const handleOpenEdit = async (testSummary: LabTest) => {
    try {
      const res = await window.electronAPI.tests.getById(testSummary.id);
      if (res.success && res.data) {
        setTestToEdit(res.data);
        setIsFormOpen(true);
      }
    } catch {
      alert('Failed to retrieve full test parameters.');
    }
  };

  const handleToggleActive = async (test: LabTest) => {
    const willDeactivate = test.is_active === 1;
    const confirmMessage = willDeactivate
      ? `Deactivate test '${test.test_code}' (${test.test_name})?\n\nIt will be hidden from new order prescriptions, but all historical invoices, finalized reports, and medical logs will be preserved permanently.`
      : `Reactivate test '${test.test_code}' to appear in new order prescriptions?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await window.electronAPI.tests.setActiveStatus(test.id, !willDeactivate);
      if (res.success) {
        fetchTests();
      } else {
        alert(res.error || 'Failed to update test status.');
      }
    } catch {
      alert('An error occurred while updating test status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Laboratory Test Catalog</h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure laboratory tests, multi-parameter profiles, pricing, and reference ranges.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchTests} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setTestToEdit(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Configure New Test
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by test code or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600 pl-2 border-l border-slate-200">
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="active">Active Only</option>
                <option value="all">All Tests</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Catalog Table */}
      <Card>
        {tests.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FlaskConical className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              {searchQuery ? 'No matching tests found' : 'Test catalog is empty'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5 leading-relaxed">
              {searchQuery
                ? 'Try a different code or test name, or clear category filters.'
                : 'Configure your first diagnostic test with pricing and laboratory reference ranges.'}
            </p>
            {!searchQuery && (
              <Button
                size="sm"
                onClick={() => {
                  setTestToEdit(null);
                  setIsFormOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add First Test
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">Test Code</th>
                  <th className="py-3 px-4">Test Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Specimen / Container</th>
                  <th className="py-3 px-4">TAT</th>
                  <th className="py-3 px-4">Price (PKR)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tests.map((t) => (
                  <tr
                    key={t.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      t.is_active === 0 ? 'opacity-60 bg-slate-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-brand-600 whitespace-nowrap">
                      {t.test_code}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      <div>{t.test_name}</div>
                      {t.test_method && (
                        <div className="text-[11px] font-normal text-slate-400">
                          Method: {t.test_method}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px]">
                        {t.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {t.sample_type ? (
                        <div>
                          <span className="font-medium text-slate-800">{t.sample_type}</span>
                          {t.collection_container && (
                            <div className="text-[11px] text-slate-500">{t.collection_container}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap text-xs">
                      {t.turnaround_time || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(t.price_paisa)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {t.is_active === 1 ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="default" className="text-slate-400 bg-slate-100">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(t)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          title="Configure Parameters & Price"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(t)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            t.is_active === 1
                              ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={t.is_active === 1 ? 'Deactivate Test' : 'Reactivate Test'}
                        >
                          {t.is_active === 1 ? (
                            <PowerOff className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <TestFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => fetchTests()}
        testToEdit={testToEdit}
      />
    </div>
  );
};

