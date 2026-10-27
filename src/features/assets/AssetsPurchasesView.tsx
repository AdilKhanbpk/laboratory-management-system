import React, { useState, useEffect, useCallback } from 'react';
import { LabAsset, HospitalSettings } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { AssetFormModal } from './AssetFormModal';
import {
  Plus,
  Search,
  Pencil,
  FileDown,
  Printer,
  DollarSign,
  Package,
  Loader2,
} from 'lucide-react';

interface AssetsPurchasesViewProps {
  hospitalSettings?: HospitalSettings | null;
}

type DatePreset = 'lifetime' | 'today' | 'last7' | 'last30' | 'this_month' | 'custom';

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
const td = 'px-4 py-3 text-[13px] align-middle whitespace-nowrap';

export const AssetsPurchasesView: React.FC<AssetsPurchasesViewProps> = ({ hospitalSettings }) => {
  const [assets, setAssets] = useState<LabAsset[]>([]);
  const [expandedAssetId, setExpandedAssetId] = useState<number | null>(null);
  const [summary, setSummary] = useState<{
    totalCount: number;
    totalAmountPaisa: number;
    technicianAmountPaisa: number;
    doctorAmountPaisa: number;
  }>({
    totalCount: 0,
    totalAmountPaisa: 0,
    technicianAmountPaisa: 0,
    doctorAmountPaisa: 0,
  });
  // const [netProfitPreview, setNetProfitPreview] = useState<{
  //   totalSalesPaisa: number;
  //   totalAssetsPaisa: number;
  //   totalDoctorsCommissionPaisa: number;
  //   netProfitPaisa: number;
  //   technicianPct: number;
  //   investorPct: number;
  //   mySharePaisa: number;
  //   investorSharePaisa: number;
  //   techOutOfPocketPaisa: number;
  //   remainingBalancePaisa: number;
  // } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Filters
  const [preset, setPreset] = useState<DatePreset>('lifetime');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState<LabAsset | null>(null);

  // Apply preset dates
  const handleSelectPreset = (newPreset: DatePreset) => {
    setPreset(newPreset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (newPreset === 'lifetime') {
      setStartDate('');
      setEndDate('');
    } else if (newPreset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (newPreset === 'last7') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (newPreset === 'last30') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (newPreset === 'this_month') {
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${m}-01`);
      setEndDate(todayStr);
    }
  };

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      const query = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: searchQuery || undefined,
      };

      const partnershipApi = window.electronAPI.partnership || (window.electronAPI.finance as any);
      const [listRes, sumRes, partRes] = await Promise.all([
        window.electronAPI.assets.list(query),
        window.electronAPI.assets.getSummary({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        partnershipApi?.getDashboard
          ? partnershipApi.getDashboard({
              startDate: startDate || undefined,
              endDate: endDate || undefined,
            })
          : Promise.resolve({ success: false, data: null }),
      ]);

      if (listRes.success && listRes.data) {
        setAssets(listRes.data);
      }
      if (sumRes.success && sumRes.data) {
        setSummary({
          totalCount: sumRes.data.totalCount || 0,
          totalAmountPaisa: sumRes.data.totalAmountPaisa || 0,
          technicianAmountPaisa: (sumRes.data as any).technicianAmountPaisa || 0,
          doctorAmountPaisa: (sumRes.data as any).doctorAmountPaisa || 0,
        });
      }
      if (partRes && partRes.success && partRes.data?.period) {
        // const p = partRes.data.period;
        // setNetProfitPreview({
        //   totalSalesPaisa: p.totalSalesPaisa || 0,
        //   totalAssetsPaisa: p.totalAssetsPaisa || 0,
        //   totalDoctorsCommissionPaisa: p.totalDoctorsCommissionPaisa || 0,
        //   netProfitPaisa: p.netProfitPaisa || 0,
        //   technicianPct: p.technicianPct || 50,
        //   investorPct: p.investorPct || 50,
        //   mySharePaisa: p.mySharePaisa || 0,
        //   investorSharePaisa: p.investorSharePaisa || 0,
        //   techOutOfPocketPaisa: p.techOutOfPocketPaisa || 0,
        //   remainingBalancePaisa: p.remainingBalancePaisa || 0,
        // });
      }
    } catch (err) {
      console.error('Failed to load assets/purchases:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleOpenNew = () => {
    setAssetToEdit(null);
    setIsFormOpen(true);
  };

  const handleEdit = (asset: LabAsset) => {
    setAssetToEdit(asset);
    setIsFormOpen(true);
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const query = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: searchQuery || undefined,
      };
      const res = await window.electronAPI.assets.exportPdf(query);
      if (res.success && res.data?.filePath) {
        alert(`Assets & Purchases report exported successfully to:\n${res.data.filePath}`);
      } else if (!res.data?.success && res.error) {
        alert(`PDF export failed: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Export error: ${err?.message || 'Could not export PDF'}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12 text-[#1F2937]">
      {/* Printable Report View (Visible only during print) */}
      <div className="hidden print:block text-black bg-white p-6">
        <div className="border-b-2 border-[#0F766E] pb-4 mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-[#0F766E]">
              {hospitalSettings?.hospital_name || 'Laboratory Management System'}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">{hospitalSettings?.address}</p>
            <p className="text-xs text-slate-600">Tel: {hospitalSettings?.phone_primary}</p>
          </div>
          <div className="text-right">
            <h2 className="text-base font-bold text-slate-900">ASSETS & PURCHASES REPORT</h2>
            <p className="text-xs text-slate-500 mt-1">
              Date Filter:{' '}
              {startDate && endDate
                ? `${startDate} to ${endDate}`
                : startDate
                ? `From ${startDate}`
                : endDate
                ? `Up to ${endDate}`
                : 'All Time (Lifetime)'}
            </p>
            <p className="text-xs text-slate-500">Printed: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-4 flex flex-wrap gap-8 text-xs">
          <div>
            <span className="text-slate-500 block">Total Items:</span>
            <span className="font-bold text-slate-800 text-sm">{summary.totalCount} items</span>
          </div>
          <div>
            <span className="text-slate-500 block">Total Purchases Amount:</span>
            <span className="font-bold text-[#0F766E] text-sm">{formatCurrency(summary.totalAmountPaisa)}</span>
          </div>
          {summary.technicianAmountPaisa > 0 && (
            <div>
              <span className="text-slate-500 block">Technician Out-of-Pocket:</span>
              <span className="font-bold text-[#0F766E] text-sm">{formatCurrency(summary.technicianAmountPaisa)}</span>
            </div>
          )}
          {summary.doctorAmountPaisa > 0 && (
            <div>
              <span className="text-slate-500 block">Doctor / Lab Purchases:</span>
              <span className="font-bold text-blue-700 text-sm">{formatCurrency(summary.doctorAmountPaisa)}</span>
            </div>
          )}
        </div>

        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-100">
              <th className="py-2 px-2">Date</th>
              <th className="py-2 px-2">Item Description</th>
              <th className="py-2 px-2">Purchased By</th>
              <th className="py-2 px-2">Category</th>
              <th className="py-2 px-2">Vendor</th>
              <th className="py-2 px-2">Receipt #</th>
              <th className="py-2 px-2 text-right">Amount (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-b border-slate-200">
                <td className="py-2 px-2 whitespace-nowrap">{a.purchase_date}</td>
                <td className="py-2 px-2 font-medium">{a.title}</td>
                <td className="py-2 px-2 capitalize">
                  {a.purchased_by === 'doctor' ? 'Doctor' : 'Technician'}
                  {a.purchaser_name ? ` (${a.purchaser_name})` : ''}
                </td>
                <td className="py-2 px-2">{a.category}</td>
                <td className="py-2 px-2">{a.vendor_name || '—'}</td>
                <td className="py-2 px-2">{a.invoice_receipt_no || '—'}</td>
                <td className="py-2 px-2 text-right font-semibold">{formatCurrency(a.amount_paisa)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#0F766E] font-bold">
              <td colSpan={6} className="py-3 px-2 text-right">Total Purchases:</td>
              <td className="py-3 px-2 text-right text-sm text-[#0F766E]">{formatCurrency(summary.totalAmountPaisa)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Screen Interface (Hidden when printing) */}
      <div className="print:hidden space-y-6">
        {/* Page Heading & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Assets and purchases</h1>
            <p className="mt-1 text-[13px] text-[#64748B]">
              Record equipment, reagents, and operational purchases for the laboratory.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className={secondaryBtn}
              title="Print assets report directly"
            >
              <Printer className="w-4 h-4 text-[#64748B]" />
              Print
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className={secondaryBtn}
              title="Save assets report as standalone PDF document"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#0F766E]" />
              ) : (
                <FileDown className="w-4 h-4 text-[#0F766E]" />
              )}
              {isExportingPdf ? 'Exporting…' : 'Export PDF'}
            </button>
            <button type="button" onClick={handleOpenNew} className={primaryBtn}>
              <Plus className="w-4 h-4" />
              New purchase entry
            </button>
          </div>
        </div>

        {/* Lifetime and Range KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
            <span className="flex items-center gap-2 text-xs font-medium text-[#64748B] uppercase tracking-wider">
              <DollarSign className="w-4 h-4 text-[#0F766E]" />
              Total Purchases
            </span>
            <span className="block mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
              {formatCurrency(summary.totalAmountPaisa)}
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
              <span>Tech: <strong className="text-teal-700 font-semibold">{formatCurrency(summary.technicianAmountPaisa)}</strong></span>
              <span>•</span>
              <span>Doc: <strong className="text-blue-700 font-semibold">{formatCurrency(summary.doctorAmountPaisa)}</strong></span>
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
            <span className="flex items-center gap-2 text-xs font-medium text-[#64748B] uppercase tracking-wider">
              <Package className="w-4 h-4 text-[#0F766E]" />
              Total Entries
            </span>
            <span className="block mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
              {summary.totalCount} items
            </span>
            <span className="block mt-1 text-xs text-[#64748B]">Recorded purchases</span>
          </div>

          {/* <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
            <span className="flex items-center gap-2 text-xs font-medium text-[#64748B] uppercase tracking-wider">
              <Calendar className="w-4 h-4 text-[#0F766E]" />
              Average Purchase
            </span>
            <span className="block mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
              {summary.totalCount > 0
                ? formatCurrency(Math.round(summary.totalAmountPaisa / summary.totalCount))
                : formatCurrency(0)}
            </span>
            <span className="block mt-1 text-xs text-[#64748B]">Per item average</span>
          </div> */}
        </div>

        {/* Date Filter Bar */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#64748B] mr-1">Period:</span>
            {[
              { id: 'lifetime', label: 'Lifetime' },
              { id: 'today', label: 'Today' },
              { id: 'last7', label: 'Last 7 days' },
              { id: 'last30', label: 'Last 1 month' },
              { id: 'this_month', label: 'This month' },
              { id: 'custom', label: 'Custom range' },
            ].map((p) => {
              const active = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id as DatePreset)}
                  className={`h-7 px-3 rounded text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#0F766E] text-white shadow-sm'
                      : 'border border-[#CBD5E1] bg-white text-[#1F2937] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Dynamic Custom Date Inputs */}
          {preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <label htmlFor="custom-start" className="text-xs font-medium text-[#64748B]">
                  From:
                </label>
                <input
                  id="custom-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 px-2.5 rounded-md border border-[#CBD5E1] bg-white text-xs text-[#1F2937]"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="custom-end" className="text-xs font-medium text-[#64748B]">
                  To:
                </label>
                <input
                  id="custom-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 px-2.5 rounded-md border border-[#CBD5E1] bg-white text-xs text-[#1F2937]"
                />
              </div>

              <button
                type="button"
                onClick={fetchAssets}
                className="h-8 px-3 rounded-md bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-medium transition-colors"
              >
                Apply Range
              </button>
            </div>
          )}
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search purchase description, vendor, invoice # or notes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputClass} pl-9`}
              />
            </div>

            <div>
              <select
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={inputClass}
              >
                <option value="all">All categories</option>
                <option value="Equipment">Equipment</option>
                <option value="Reagents & Chemicals">Reagents & Chemicals</option>
                <option value="Medical Supplies">Medical Supplies</option>
                <option value="Maintenance & Repairs">Maintenance & Repairs</option>
                <option value="Utilities & Rent">Utilities & Rent</option>
                <option value="IT & Hardware">IT & Hardware</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>
        </div>

        {/* Purchases Table */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-[#64748B]">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0F766E] mb-2" />
              <p className="text-[13px]">Loading purchases and assets…</p>
            </div>
          ) : assets.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-[#F1F5F9] text-[#64748B] flex items-center justify-center mx-auto mb-3">
                <Package className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-[#1F2937]">No purchases found</h3>
              <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
                {searchQuery || categoryFilter !== 'all' || startDate
                  ? 'No entries match your search criteria or date filter.'
                  : 'Start recording equipment, lab reagents, and operational expenses.'}
              </p>
              <button type="button" onClick={handleOpenNew} className={`${primaryBtn} mt-4`}>
                <Plus className="w-4 h-4" />
                New purchase entry
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr>
                    <th scope="col" className={th}>Date</th>
                    <th scope="col" className={th}>Item description</th>
                    <th scope="col" className={th}>Purchased by</th>
                    <th scope="col" className={th}>Category</th>
                    <th scope="col" className={th}>Vendor</th>
                    <th scope="col" className={th}>Invoice / Receipt</th>
                    <th scope="col" className={th}>Notes</th>
                    <th scope="col" className={`${th} text-right`}>Amount</th>
                    <th scope="col" className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <React.Fragment key={asset.id}>
                      <tr
                        className="border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC]"
                      >
                      <td className={`${td} font-medium tabular-nums`}>{asset.purchase_date}</td>
                      <td className={`${td} font-semibold text-[#1F2937]`}>{asset.title}</td>
                      <td className={td}>
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`inline-flex items-center w-fit px-2 py-0.5 rounded text-xs font-semibold ${
                              asset.purchased_by === 'doctor'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-teal-50 text-teal-700 border border-teal-200'
                            }`}
                          >
                            {asset.purchased_by === 'doctor' ? 'Doctor' : 'Technician'}
                          </span>
                          {asset.purchaser_name && (
                            <span className="text-[11px] text-[#64748B]">
                              {asset.purchaser_name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={td}>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#F1F5F9] text-[#334155] border border-[#CBD5E1]">
                          {asset.category || 'General'}
                        </span>
                      </td>
                      <td className={`${td} text-[#64748B]`}>{asset.vendor_name || '–'}</td>
                      <td className={`${td} tabular-nums text-[#64748B]`}>{asset.invoice_receipt_no || '–'}</td>
                      <td className={`${td} text-[#64748B]`}>
                        {(() => {
                          if (!asset.notes) return '–';
                          const isEditHistory = (str: string) =>
                            /\[EDIT HISTORY/i.test(str) ||
                            /Reason for change:/i.test(str) ||
                            /What changed:/i.test(str);
                          const parts = asset.notes.split(/(?=\[EDIT HISTORY)/i).map((p) => p.trim()).filter(Boolean);
                          const editTrails: string[] = [];
                          for (const p of parts) {
                            if (isEditHistory(p) && !editTrails.includes(p)) {
                              editTrails.push(p);
                            }
                          }
                          const editCount = editTrails.length;
                          const baseNotes = parts.filter((p) => !isEditHistory(p)).join(' ');

                          return (
                            <div className="flex items-center gap-1.5 max-w-[260px]">
                              <span className="truncate" title={baseNotes || undefined}>{baseNotes || (editCount > 0 ? 'Edited entry' : '–')}</span>
                              {editCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedAssetId(expandedAssetId === asset.id ? null : asset.id)}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors shrink-0 ${
                                    expandedAssetId === asset.id
                                      ? 'bg-amber-600 text-white border-amber-700'
                                      : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                  }`}
                                  title="Click to view full modification history"
                                >
                                  📝 {expandedAssetId === asset.id ? 'Hide Audits' : `Show Audits (${editCount})`}
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`${td} text-right tabular-nums font-bold text-[#0F766E]`}>
                        {formatCurrency(asset.amount_paisa)}
                      </td>
                      <td className={td}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(asset)}
                            title="Edit details"
                            className={`${iconBtn} hover:text-[#1F2937]`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedAssetId === asset.id && asset.notes && (
                      <tr className="bg-amber-50/50 border-b border-amber-200">
                        <td colSpan={9} className="px-6 py-3.5">
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                              <span>📝 Modification Audit Trail for:</span>
                              <span className="font-semibold text-slate-800">{asset.title}</span>
                            </p>
                            {(() => {
                              const isEditHistory = (str: string) =>
                                /\[EDIT HISTORY/i.test(str) ||
                                /Reason for change:/i.test(str) ||
                                /What changed:/i.test(str);
                              const parts = asset.notes.split(/(?=\[EDIT HISTORY)/i).map((p) => p.trim()).filter(Boolean);
                              const editTrails: string[] = [];
                              for (const p of parts) {
                                if (isEditHistory(p) && !editTrails.includes(p)) {
                                  editTrails.push(p);
                                }
                              }

                              return editTrails.map((trail, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-md bg-white border border-amber-200/90 p-2.5 text-xs text-amber-950 whitespace-pre-wrap font-sans leading-relaxed shadow-xs"
                                >
                                  {trail}
                                </div>
                              ));
                            })()}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <AssetFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => {
            fetchAssets();
          }}
          assetToEdit={assetToEdit}
        />
      )}
    </div>
  );
};
