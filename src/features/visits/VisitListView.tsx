// import React, { useState, useEffect, useCallback } from 'react';
// import { Visit, VisitSearchResult, VisitDetail, HospitalSettings } from '../../types';
// import { Card } from '../../components/common/Card';
// import { Button } from '../../components/common/Button';
// import { Badge } from '../../components/common/Badge';
// import { formatCurrency, formatDateTime } from '../../lib/utils';
// import { ReceiptPrintModal } from './ReceiptPrintModal';
// import { RecordPaymentModal } from './RecordPaymentModal';
// import { LabReportPreviewModal } from '../reports/LabReportPreviewModal';
// import {
//   Receipt,
//   Search,
//   Filter,
//   RefreshCw,
//   ChevronLeft,
//   ChevronRight,
//   Printer,
//   Coins,
//   Calendar,
//   AlertCircle,
//   FileText,
// } from 'lucide-react';

// interface VisitListViewProps {
//   hospitalSettings: HospitalSettings | null;
//   onNavigateNewVisit: () => void;
// }

// export const VisitListView: React.FC<VisitListViewProps> = ({
//   hospitalSettings,
//   onNavigateNewVisit,
// }) => {
//   const [data, setData] = useState<VisitSearchResult>({
//     visits: [],
//     total: 0,
//     page: 1,
//     totalPages: 1,
//   });

//   const [searchQuery, setSearchQuery] = useState('');
//   const [statusFilter, setStatusFilter] = useState('all');
//   const [startDate, setStartDate] = useState('');
//   const [endDate, setEndDate] = useState('');
//   const [page, setPage] = useState(1);
//   const [isLoading, setIsLoading] = useState(false);

//   // Modals
//   const [selectedVisitDetail, setSelectedVisitDetail] = useState<VisitDetail | null>(null);
//   const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
//   const [visitToCollectPayment, setVisitToCollectPayment] = useState<Visit | null>(null);
//   const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
//   const [previewVisitId, setPreviewVisitId] = useState<number | null>(null);

//   const fetchVisits = useCallback(async () => {
//     setIsLoading(true);
//     try {
//       const res = await window.electronAPI.visits.search({
//         query: searchQuery.trim() || undefined,
//         status: statusFilter !== 'all' ? statusFilter : undefined,
//         startDate: startDate ? new Date(startDate).toISOString() : undefined,
//         endDate: endDate ? new Date(endDate).toISOString() : undefined,
//         page,
//         limit: 15,
//       });

//       if (res.success && res.data) {
//         setData(res.data);
//       }
//     } catch (err) {
//       console.error('Failed to search visits:', err);
//     } finally {
//       setIsLoading(false);
//     }
//   }, [searchQuery, statusFilter, startDate, endDate, page]);

//   useEffect(() => {
//     fetchVisits();
//   }, [fetchVisits]);

//   // Open Receipt Modal
//   const handleOpenReceipt = async (visitId: number) => {
//     try {
//       const res = await window.electronAPI.visits.getById(visitId);
//       if (res.success && res.data) {
//         setSelectedVisitDetail(res.data);
//         setIsReceiptModalOpen(true);
//       }
//     } catch (err) {
//       console.error('Failed to load visit details for receipt:', err);
//     }
//   };

//   return (
//     <div className="space-y-6 select-text pb-12">
//       {/* Header */}
//       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
//         <div>
//           <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
//             <Receipt className="w-6 h-6 text-brand-600" />
//             Patient Visits & Invoices Desk
//           </h1>
//           <p className="text-xs text-slate-500 mt-1">
//             Accession records, order history, invoice statuses, and balance payments.
//           </p>
//         </div>
//         <div className="flex items-center gap-2">
//           <Button size="sm" variant="outline" onClick={fetchVisits} disabled={isLoading}>
//             <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
//             Refresh
//           </Button>
//           <Button size="sm" variant="primary" onClick={onNavigateNewVisit}>
//             + New Visit & Bill
//           </Button>
//         </div>
//       </div>

//       {/* Filter and Search Bar */}
//       <Card className="p-4">
//         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
//           {/* Search Input */}
//           <div className="lg:col-span-5 relative">
//             <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
//             <input
//               type="text"
//               value={searchQuery}
//               onChange={(e) => {
//                 setSearchQuery(e.target.value);
//                 setPage(1);
//               }}
//               placeholder="Search by Visit #, MRN, Patient Name, Invoice #..."
//               className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
//             />
//           </div>

//           {/* Status Filter */}
//           <div className="lg:col-span-3 flex items-center gap-2">
//             <Filter className="w-4 h-4 text-slate-400 shrink-0" />
//             <select
//               value={statusFilter}
//               onChange={(e) => {
//                 setStatusFilter(e.target.value);
//                 setPage(1);
//               }}
//               className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
//             >
//               <option value="all">All Statuses</option>
//               <option value="registered">Registered / Pending</option>
//               <option value="in_progress">In Progress</option>
//               <option value="completed">Completed</option>
//               <option value="cancelled">Cancelled</option>
//             </select>
//           </div>

//           {/* Date Range Start */}
//           <div className="lg:col-span-2 flex items-center gap-1.5">
//             <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
//             <input
//               type="date"
//               value={startDate}
//               onChange={(e) => {
//                 setStartDate(e.target.value);
//                 setPage(1);
//               }}
//               className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
//               title="Filter from date"
//             />
//           </div>

//           {/* Date Range End */}
//           <div className="lg:col-span-2">
//             <input
//               type="date"
//               value={endDate}
//               onChange={(e) => {
//                 setEndDate(e.target.value);
//                 setPage(1);
//               }}
//               className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
//               title="Filter to date"
//             />
//           </div>
//         </div>
//       </Card>

//       {/* Visits Table */}
//       <Card className="overflow-hidden border border-slate-200">
//         <div className="overflow-x-auto">
//           <table className="w-full text-xs text-left">
//             <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
//               <tr>
//                 <th className="py-3 px-4">Visit #</th>
//                 <th className="py-3 px-4">Date & Time</th>
//                 <th className="py-3 px-4">Patient Information</th>
//                 <th className="py-3 px-4">Referring Doctor</th>
//                 {/* <th className="py-3 px-4">Invoice #</th> */}
//                 <th className="py-3 px-4 text-right">Net Total</th>
//                 {/* <th className="py-3 px-4 text-right">Balance</th> */}
//                 <th className="py-3 px-4 text-center">Payment Status</th>
//                 <th className="py-3 px-4 text-center">Actions</th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-slate-100 bg-white">
//               {data.visits.length > 0 ? (
//                 data.visits.map((v) => (
//                   <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
//                     {/* Visit # */}
//                     <td className="py-3 px-4 font-mono font-bold text-brand-700">
//                       {v.visit_number}
//                     </td>

//                     {/* Date */}
//                     <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
//                       {formatDateTime(v.order_date)}
//                     </td>

//                     {/* Patient */}
//                     <td className="py-3 px-4">
//                       <span className="font-bold text-slate-900 block">{v.patient_name}</span>
//                       <span className="font-mono text-[10px] text-slate-500">
//                         {v.patient_mrn} • <span className="capitalize">{v.patient_gender}</span>
//                       </span>
//                     </td>

//                     {/* Doctor */}
//                     <td className="py-3 px-4 text-slate-700">
//                       {v.doctor_name || <span className="text-slate-400 italic">Self / Walk-in</span>}
//                     </td>

//                     {/* Invoice # */}
//                     {/* <td className="py-3 px-4 font-mono text-slate-600">
//                       {v.invoice_number || '—'}
//                     </td> */}

//                     {/* Net Total */}
//                     <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
//                       {v.final_total !== undefined ? formatCurrency(v.final_total) : '—'}
//                     </td>

//                     {/* Balance */}
//                     {/* <td
//                       className={`py-3 px-4 text-right font-mono font-bold ${
//                         (v.balance_amount || 0) > 0 ? 'text-amber-700' : 'text-slate-400'
//                       }`}
//                     >
//                       {v.balance_amount !== undefined ? formatCurrency(v.balance_amount) : '—'}
//                     </td> */}

//                     {/* Payment Status */}
//                     <td className="py-3 px-4 text-center">
//                       <Badge
//                         variant={
//                           v.payment_status === 'paid'
//                             ? 'success'
//                             : v.payment_status === 'partially_paid'
//                             ? 'warning'
//                             : 'danger'
//                         }
//                         className="text-[10px] uppercase font-bold"
//                       >
//                         {v.payment_status || 'unpaid'}
//                       </Badge>
//                     </td>

//                     {/* Actions */}
//                     <td className="py-3 px-4 text-center whitespace-nowrap">
//                       <div className="flex items-center justify-center gap-1.5">
//                         <Button
//                           size="sm"
//                           variant="outline"
//                           className="h-7 px-2 text-[11px]"
//                           onClick={() => handleOpenReceipt(v.id)}
//                           title="Print or view official receipt"
//                         >
//                           <Printer className="w-3.5 h-3.5 mr-1" />
//                           Receipt
//                         </Button>

//                         <Button
//                           size="sm"
//                           variant="outline"
//                           className="h-7 px-2 text-[11px] text-brand-700 border-brand-200 hover:bg-brand-50"
//                           onClick={() => setPreviewVisitId(v.id)}
//                           title="View diagnostic pathology report"
//                         >
//                           <FileText className="w-3.5 h-3.5 mr-1 text-brand-600" />
//                           Report
//                         </Button>

//                         {(v.balance_amount || 0) > 0 && (
//                           <Button
//                             size="sm"
//                             variant="primary"
//                             className="h-7 px-2 text-[11px] bg-amber-600 hover:bg-amber-700 text-white"
//                             onClick={() => {
//                               setVisitToCollectPayment(v);
//                               setIsPaymentModalOpen(true);
//                             }}
//                             title="Collect outstanding balance"
//                           >
//                             <Coins className="w-3.5 h-3.5 mr-1" />
//                             Pay
//                           </Button>
//                         )}
//                       </div>
//                     </td>
//                   </tr>
//                 ))
//               ) : (
//                 <tr>
//                   <td colSpan={9} className="py-12 text-center text-slate-400">
//                     <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
//                     <p className="text-sm font-semibold text-slate-700">No patient visits recorded</p>
//                     <p className="text-xs text-slate-400 mt-1">
//                       {searchQuery
//                         ? 'Try clearing your search terms or filters.'
//                         : 'Register a new patient visit to create the first invoice.'}
//                     </p>
//                   </td>
//                 </tr>
//               )}
//             </tbody>
//           </table>
//         </div>

//         {/* Pagination Bar */}
//         <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
//           <div>
//             Showing <strong>{data.visits.length}</strong> of <strong>{data.total}</strong> visits
//           </div>
//           <div className="flex items-center gap-2">
//             <Button
//               size="sm"
//               variant="outline"
//               disabled={page <= 1}
//               onClick={() => setPage((p) => Math.max(1, p - 1))}
//             >
//               <ChevronLeft className="w-4 h-4" />
//             </Button>
//             <span className="font-semibold text-slate-700">
//               Page {data.page} of {data.totalPages}
//             </span>
//             <Button
//               size="sm"
//               variant="outline"
//               disabled={page >= data.totalPages}
//               onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
//             >
//               <ChevronRight className="w-4 h-4" />
//             </Button>
//           </div>
//         </div>
//       </Card>

//       {/* Receipt Modal */}
//       <ReceiptPrintModal
//         isOpen={isReceiptModalOpen}
//         onClose={() => setIsReceiptModalOpen(false)}
//         visitDetail={selectedVisitDetail}
//         hospital={hospitalSettings}
//       />

//       {/* Record Payment Modal */}
//       <RecordPaymentModal
//         isOpen={isPaymentModalOpen}
//         onClose={() => setIsPaymentModalOpen(false)}
//         visit={visitToCollectPayment}
//         onSuccess={() => {
//           fetchVisits();
//         }}
//       />

//       {/* Lab Report Preview Modal */}
//       <LabReportPreviewModal
//         visitId={previewVisitId}
//         isOpen={!!previewVisitId}
//         onClose={() => setPreviewVisitId(null)}
//       />
//     </div>
//   );
// };
import React, { useState, useEffect, useCallback } from 'react';
import { Visit, VisitSearchResult, VisitDetail, HospitalSettings } from '../../types';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { ReceiptPrintModal } from './ReceiptPrintModal';
import { RecordPaymentModal } from './RecordPaymentModal';
import { LabReportPreviewModal } from '../reports/LabReportPreviewModal';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, surface #FFFFFF, table header #F8FAFC,
 *   text #1F2937, muted #64748B, border #E2E8F0 (inputs #CBD5E1),
 *   success #15803D, warning #D97706, error #DC2626.
 * Status colors appear only as a small dot next to the payment status.
 */

interface VisitListViewProps {
  hospitalSettings: HospitalSettings | null;
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

export const VisitListView: React.FC<VisitListViewProps> = ({
  hospitalSettings,
  onNavigateNewVisit,
}) => {
  const [data, setData] = useState<VisitSearchResult>({
    visits: [],
    total: 0,
    page: 1,
    totalPages: 1,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  const fetchVisits = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await window.electronAPI.visits.search({
        query: searchQuery.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
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

  const hasFilters = Boolean(searchQuery || statusFilter !== 'all' || startDate || endDate);

  return (
    <div className="space-y-6 pb-12 text-[#1F2937] select-text">
      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Orders and invoices</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">
            Visit history, invoice status and outstanding balances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={fetchVisits} disabled={isLoading} className={secondaryBtn}>
            <RefreshCw className={`w-4 h-4 text-[#64748B] ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button type="button" onClick={onNavigateNewVisit} className={primaryBtn}>
            <Plus className="w-4 h-4" />
            New visit and bill
          </button>
        </div>
      </div>

      {/* Filters and table share one panel */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 px-4 py-3 border-b border-[#E2E8F0]">
          <div className="relative lg:col-span-5">
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

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={`${inputClass} lg:col-span-3`}
          >
            <option value="all">All statuses</option>
            <option value="registered">Registered, pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <input
            type="date"
            aria-label="From date"
            title="From date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className={`${inputClass} lg:col-span-2`}
          />

          <input
            type="date"
            aria-label="To date"
            title="To date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className={`${inputClass} lg:col-span-2`}
          />
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
    </div>
  );
};