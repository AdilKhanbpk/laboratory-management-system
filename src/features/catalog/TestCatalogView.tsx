import React, { useState, useEffect, useCallback } from 'react';
import { LabTest } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { TestFormModal } from './TestFormModal';
import { Plus, Search, Pencil, PowerOff, RotateCcw, RefreshCw } from 'lucide-react';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, surface #FFFFFF, toolbar and table header #F8FAFC,
 *   text #1F2937, muted #64748B, border #E2E8F0 (inputs #CBD5E1),
 *   success #15803D, error #DC2626.
 */

const inputClass =
  'block w-full h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-[#0F766E] text-[13px] font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2';

const secondaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed';

const iconBtn =
  'w-8 h-8 inline-flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

const th = 'px-4 py-2.5 text-xs font-medium text-[#64748B] whitespace-nowrap';
const td = 'px-4 py-3 text-[13px] align-top';

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

  const handleOpenNew = () => {
    setTestToEdit(null);
    setIsFormOpen(true);
  };

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

  const hasFilters = Boolean(searchQuery || selectedCategory !== 'all');

  return (
    <div className="space-y-6 pb-12 text-[#1F2937]">
      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Test catalog</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">
            Tests, profiles, prices and reference ranges.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={fetchTests} disabled={isLoading} className={secondaryBtn}>
            <RefreshCw className={`w-4 h-4 text-[#64748B] ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button type="button" onClick={handleOpenNew} className={primaryBtn}>
            <Plus className="w-4 h-4" />
            New test
          </button>
        </div>
      </div>

      {/* Filters and table share one panel */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0]">
          <div className="relative md:col-span-6">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#94A3B8]" aria-hidden="true" />
            <input
              type="text"
              aria-label="Search tests"
              placeholder="Search by test code or name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>

          <select
            aria-label="Filter by category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={`${inputClass} md:col-span-3`}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className={`${inputClass} md:col-span-3`}
          >
            <option value="active">Active tests</option>
            <option value="all">All tests</option>
            <option value="inactive">Inactive tests</option>
          </select>
        </div>

        {tests.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-[13px] font-medium">
              {hasFilters ? 'No tests match these filters' : 'The test catalog is empty'}
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              {hasFilters
                ? 'Try a different code or name, or clear the category filter.'
                : 'Add your first test with its price and reference ranges.'}
            </p>
            {!hasFilters && (
              <button type="button" onClick={handleOpenNew} className={`${primaryBtn} mt-4`}>
                <Plus className="w-4 h-4" />
                New test
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th scope="col" className={th}>Code</th>
                  <th scope="col" className={th}>Test</th>
                  <th scope="col" className={th}>Category</th>
                  <th scope="col" className={th}>Specimen and container</th>
                  <th scope="col" className={th}>Turnaround</th>
                  <th scope="col" className={`${th} text-right`}>Price (PKR)</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => {
                  const isActive = t.is_active === 1;
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC]"
                    >
                      <td className={`${td} font-medium tabular-nums whitespace-nowrap ${isActive ? '' : 'text-[#64748B]'}`}>
                        {t.test_code}
                      </td>
                      <td className={`${td} ${isActive ? '' : 'text-[#64748B]'}`}>
                        <span className="block font-medium">{t.test_name}</span>
                        {t.test_method && (
                          <span className="block text-xs font-normal text-[#64748B]">{t.test_method}</span>
                        )}
                      </td>
                      <td className={`${td} text-[#64748B] whitespace-nowrap`}>{t.category}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {t.sample_type ? (
                          <>
                            <span className="block">{t.sample_type}</span>
                            {t.collection_container && (
                              <span className="block text-xs text-[#64748B]">{t.collection_container}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-[#64748B]">–</span>
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {t.turnaround_time || <span className="text-[#64748B]">–</span>}
                      </td>
                      <td className={`${td} text-right tabular-nums whitespace-nowrap font-medium`}>
                        {formatCurrency(t.price_paisa)}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#15803D]' : 'bg-[#94A3B8]'}`}
                            aria-hidden="true"
                          />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            title="Edit parameters and price"
                            aria-label={`Edit ${t.test_name}`}
                            className={`${iconBtn} hover:text-[#1F2937]`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(t)}
                            title={isActive ? 'Deactivate test' : 'Reactivate test'}
                            aria-label={`${isActive ? 'Deactivate' : 'Reactivate'} ${t.test_name}`}
                            className={`${iconBtn} ${isActive ? 'hover:text-[#DC2626]' : 'hover:text-[#0F766E]'}`}
                          >
                            {isActive ? <PowerOff className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tests.length > 0 && (
          <div className="px-4 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] text-[13px] text-[#64748B] tabular-nums">
            {tests.length} {tests.length === 1 ? 'test' : 'tests'}
          </div>
        )}
      </section>

      <TestFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => fetchTests()}
        testToEdit={testToEdit}
      />
    </div>
  );
};