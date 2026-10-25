// import React, { useState, useEffect, useCallback, useMemo } from 'react';
// import { DoctorReferralStats, Doctor } from '../../types';
// import { Card } from '../../components/common/Card';
// import { Button } from '../../components/common/Button';
// import { Alert } from '../../components/common/Alert';
// import { formatCurrency } from '../../lib/utils';
// import {
//   Calendar,
//   RotateCw,
//   TrendingUp,
//   AlertCircle,
//   ArrowUpDown,
//   Filter,
// } from 'lucide-react';

// export const DoctorStatisticsView: React.FC = () => {
//   const [stats, setStats] = useState<DoctorReferralStats[]>([]);
//   const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
//   const [isLoading, setIsLoading] = useState(false);
//   const [errorMessage, setErrorMessage] = useState<string | null>(null);

//   // Filters
//   const [startDate, setStartDate] = useState<string>('');
//   const [endDate, setEndDate] = useState<string>('');
//   const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');
//   const [sortBy, setSortBy] = useState<'visits' | 'gross' | 'net' | 'balance' | 'name'>('visits');
//   const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

//   // Load doctors list on mount
//   useEffect(() => {
//     window.electronAPI.doctors
//       .list()
//       .then((res) => {
//         if (res.success && res.data) {
//           setDoctorsList(res.data);
//         }
//       })
//       .catch((err) => console.error('Failed to load doctors list:', err));
//   }, []);

//   // Fetch statistics
//   const fetchStats = useCallback(async () => {
//     setIsLoading(true);
//     setErrorMessage(null);
//     try {
//       const query: any = {};
//       if (startDate) query.startDate = new Date(startDate).toISOString();
//       if (endDate) {
//         const end = new Date(endDate);
//         end.setHours(23, 59, 59, 999);
//         query.endDate = end.toISOString();
//       }
//       if (selectedDoctorId !== 'all') {
//         query.doctorId = parseInt(selectedDoctorId, 10);
//       }

//       const res = await window.electronAPI.reports.getDoctorStats(query);
//       if (res.success && res.data) {
//         setStats(res.data);
//       } else {
//         setErrorMessage(res.error || 'Failed to retrieve doctor referral statistics.');
//       }
//     } catch (err: any) {
//       setErrorMessage(err?.message || 'Error communicating with statistics engine.');
//     } finally {
//       setIsLoading(false);
//     }
//   }, [startDate, endDate, selectedDoctorId]);

//   useEffect(() => {
//     fetchStats();
//   }, [fetchStats]);

//   // Quick Date Presets
//   const applyPreset = (preset: 'today' | '7days' | 'month' | 'all') => {
//     const now = new Date();
//     if (preset === 'today') {
//       const d = now.toISOString().split('T')[0];
//       setStartDate(d);
//       setEndDate(d);
//     } else if (preset === '7days') {
//       const past = new Date();
//       past.setDate(now.getDate() - 7);
//       setStartDate(past.toISOString().split('T')[0]);
//       setEndDate(now.toISOString().split('T')[0]);
//     } else if (preset === 'month') {
//       const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//       setStartDate(startOfMonth.toISOString().split('T')[0]);
//       setEndDate(now.toISOString().split('T')[0]);
//     } else {
//       setStartDate('');
//       setEndDate('');
//     }
//   };

//   // Sort stats
//   const sortedStats = useMemo(() => {
//     const copy = [...stats];
//     copy.sort((a, b) => {
//       let comp = 0;
//       if (sortBy === 'visits') {
//         comp = a.totalVisits - b.totalVisits;
//       } else if (sortBy === 'gross') {
//         comp = a.grossRevenuePaisa - b.grossRevenuePaisa;
//       } else if (sortBy === 'net') {
//         comp = a.netRevenuePaisa - b.netRevenuePaisa;
//       } else if (sortBy === 'balance') {
//         comp = a.totalBalancePaisa - b.totalBalancePaisa;
//       } else if (sortBy === 'name') {
//         comp = a.doctorName.localeCompare(b.doctorName);
//       }
//       return sortDirection === 'desc' ? -comp : comp;
//     });
//     return copy;
//   }, [stats, sortBy, sortDirection]);

//   // Aggregated Summary Totals
//   const summaryTotals = useMemo(() => {
//     return stats.reduce(
//       (acc, s) => {
//         acc.totalVisits += s.totalVisits;
//         acc.uniquePatients += s.uniquePatients;
//         acc.totalTestsOrdered += s.totalTestsOrdered;
//         acc.grossRevenuePaisa += s.grossRevenuePaisa;
//         acc.netRevenuePaisa += s.netRevenuePaisa;
//         acc.totalDiscountPaisa += s.totalDiscountPaisa;
//         acc.totalPaidPaisa += s.totalPaidPaisa;
//         acc.totalBalancePaisa += s.totalBalancePaisa;
//         return acc;
//       },
//       {
//         totalVisits: 0,
//         uniquePatients: 0,
//         totalTestsOrdered: 0,
//         grossRevenuePaisa: 0,
//         netRevenuePaisa: 0,
//         totalDiscountPaisa: 0,
//         totalPaidPaisa: 0,
//         totalBalancePaisa: 0,
//       }
//     );
//   }, [stats]);

//   const toggleSort = (column: 'visits' | 'gross' | 'net' | 'balance' | 'name') => {
//     if (sortBy === column) {
//       setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
//     } else {
//       setSortBy(column);
//       setSortDirection('desc');
//     }
//   };

//   return (
//     <div className="space-y-6">
//       {/* Header */}
//       <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
//         <div>
//           <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
//             <TrendingUp className="w-6 h-6 text-brand-600" />
//             Doctor Referral & Financial Statistics
//           </h1>
//           <p className="text-xs text-slate-500 mt-1">
//             Aggregate patient volume, order counts, gross and net financial totals, and balances by referring physician.
//           </p>
//         </div>

//         <Button variant="outline" size="sm" onClick={fetchStats} isLoading={isLoading}>
//           <RotateCw className="w-3.5 h-3.5 mr-1.5" />
//           Update Statistics
//         </Button>
//       </div>

//       {/* KPI Cards */}
//       <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
//         <Card className="p-3 bg-white border-slate-200">
//           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
//             Referred Visits
//           </span>
//           <span className="text-xl font-bold text-slate-900 mt-0.5 block">
//             {summaryTotals.totalVisits}
//           </span>
//           <span className="text-[10px] text-slate-400 mt-0.5 block">
//             {summaryTotals.uniquePatients} unique patients
//           </span>
//         </Card>

//         <Card className="p-3 bg-white border-slate-200">
//           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
//             Tests Ordered
//           </span>
//           <span className="text-xl font-bold text-brand-600 mt-0.5 block">
//             {summaryTotals.totalTestsOrdered}
//           </span>
//           <span className="text-[10px] text-slate-400 mt-0.5 block">Total parameters billed</span>
//         </Card>

//         <Card className="p-3 bg-white border-slate-200">
//           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
//             Gross Billed
//           </span>
//           <span className="text-lg font-bold text-slate-900 mt-0.5 block">
//             {formatCurrency(summaryTotals.grossRevenuePaisa)}
//           </span>
//           <span className="text-[10px] text-slate-400 mt-0.5 block">List catalog value</span>
//         </Card>

//         <Card className="p-3 bg-white border-slate-200">
//           <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
//             Discounts Granted
//           </span>
//           <span className="text-lg font-bold text-amber-700 mt-0.5 block">
//             {formatCurrency(summaryTotals.totalDiscountPaisa)}
//           </span>
//           <span className="text-[10px] text-slate-400 mt-0.5 block">Deductions applied</span>
//         </Card>

//         <Card className="p-3 bg-white border-slate-200">
//           <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
//             Net Revenue
//           </span>
//           <span className="text-lg font-bold text-emerald-700 mt-0.5 block">
//             {formatCurrency(summaryTotals.netRevenuePaisa)}
//           </span>
//           <span className="text-[10px] text-slate-400 mt-0.5 block">After doctor discounts</span>
//         </Card>

//         <Card className="p-3 bg-white border-slate-200">
//           <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
//             Outstanding Due
//           </span>
//           <span className="text-lg font-bold text-rose-700 mt-0.5 block">
//             {formatCurrency(summaryTotals.totalBalancePaisa)}
//           </span>
//           <span className="text-[10px] text-slate-400 mt-0.5 block">Uncollected patient balances</span>
//         </Card>
//       </div>

//       {/* Filter & Date Range Bar */}
//       <Card className="p-4 bg-white border-slate-200 shadow-sm space-y-3">
//         <div className="flex flex-wrap items-center justify-between gap-4">
//           {/* Date Pickers */}
//           <div className="flex flex-wrap items-center gap-2">
//             <div className="flex items-center gap-1.5 text-xs text-slate-600">
//               <Calendar className="w-4 h-4 text-slate-400" />
//               <span>From:</span>
//               <input
//                 type="date"
//                 value={startDate}
//                 onChange={(e) => setStartDate(e.target.value)}
//                 className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:outline-none focus:border-brand-500"
//               />
//             </div>

//             <div className="flex items-center gap-1.5 text-xs text-slate-600">
//               <span>To:</span>
//               <input
//                 type="date"
//                 value={endDate}
//                 onChange={(e) => setEndDate(e.target.value)}
//                 className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:outline-none focus:border-brand-500"
//               />
//             </div>

//             {/* Quick Presets */}
//             <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
//               <button
//                 type="button"
//                 onClick={() => applyPreset('today')}
//                 className="px-2 py-1 rounded hover:bg-white text-slate-600 font-medium transition-colors"
//               >
//                 Today
//               </button>
//               <button
//                 type="button"
//                 onClick={() => applyPreset('7days')}
//                 className="px-2 py-1 rounded hover:bg-white text-slate-600 font-medium transition-colors"
//               >
//                 7 Days
//               </button>
//               <button
//                 type="button"
//                 onClick={() => applyPreset('month')}
//                 className="px-2 py-1 rounded hover:bg-white text-slate-600 font-medium transition-colors"
//               >
//                 This Month
//               </button>
//               <button
//                 type="button"
//                 onClick={() => applyPreset('all')}
//                 className="px-2 py-1 rounded hover:bg-white text-slate-600 font-medium transition-colors"
//               >
//                 All Time
//               </button>
//             </div>
//           </div>

//           {/* Doctor Filter Dropdown */}
//           <div className="flex items-center gap-2 text-xs">
//             <Filter className="w-3.5 h-3.5 text-slate-400" />
//             <select
//               value={selectedDoctorId}
//               onChange={(e) => setSelectedDoctorId(e.target.value)}
//               className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:outline-none focus:border-brand-500"
//             >
//               <option value="all">All Doctors & Direct Walk-ins</option>
//               <option value="0">Self / Direct (No Doctor Selected)</option>
//               {doctorsList.map((doc) => (
//                 <option key={doc.id} value={doc.id}>
//                   {doc.full_name} {doc.specialization ? `(${doc.specialization})` : ''}
//                 </option>
//               ))}
//             </select>
//           </div>
//         </div>
//       </Card>

//       {/* Main Stats Table */}
//       <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
//         {errorMessage && (
//           <div className="p-4 border-b border-slate-200">
//             <Alert type="error">{errorMessage}</Alert>
//           </div>
//         )}

//         <div className="overflow-x-auto">
//           <table className="w-full text-left text-xs border-collapse">
//             <thead>
//               <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
//                 <th
//                   className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
//                   onClick={() => toggleSort('name')}
//                 >
//                   <div className="flex items-center gap-1.5">
//                     <span>Referring Doctor</span>
//                     <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
//                   </div>
//                 </th>
//                 <th
//                   className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors"
//                   onClick={() => toggleSort('visits')}
//                 >
//                   <div className="flex items-center justify-center gap-1.5">
//                     <span>Visits</span>
//                     <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
//                   </div>
//                 </th>
//                 <th className="py-3 px-4 text-center">Patients</th>
//                 <th className="py-3 px-4 text-center">Tests</th>
//                 <th
//                   className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
//                   onClick={() => toggleSort('gross')}
//                 >
//                   <div className="flex items-center justify-end gap-1.5">
//                     <span>Gross Billed</span>
//                     <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
//                   </div>
//                 </th>
//                 <th className="py-3 px-4 text-right">Discounts</th>
//                 <th
//                   className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
//                   onClick={() => toggleSort('net')}
//                 >
//                   <div className="flex items-center justify-end gap-1.5">
//                     <span>Net Invoiced</span>
//                     <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
//                   </div>
//                 </th>
//                 <th className="py-3 px-4 text-right">Collected</th>
//                 <th
//                   className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
//                   onClick={() => toggleSort('balance')}
//                 >
//                   <div className="flex items-center justify-end gap-1.5">
//                     <span>Balance Due</span>
//                     <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
//                   </div>
//                 </th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-slate-200">
//               {isLoading ? (
//                 <tr>
//                   <td colSpan={9} className="py-12 text-center text-slate-500">
//                     <div className="flex items-center justify-center gap-2">
//                       <RotateCw className="w-4 h-4 animate-spin text-brand-500" />
//                       <span>Aggregating physician referral totals...</span>
//                     </div>
//                   </td>
//                 </tr>
//               ) : sortedStats.length === 0 ? (
//                 <tr>
//                   <td colSpan={9} className="py-12 text-center text-slate-500">
//                     <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
//                     <p className="font-semibold text-slate-700">No Referral Records in this Period</p>
//                     <p className="text-slate-400 text-[11px] mt-0.5">
//                       Adjust your date filters or select a different doctor.
//                     </p>
//                   </td>
//                 </tr>
//               ) : (
//                 sortedStats.map((doc) => (
//                   <tr key={doc.doctorId} className="hover:bg-slate-50/70 transition-colors">
//                     {/* Doctor Details */}
//                     <td className="py-3 px-4">
//                       <div className="flex items-center gap-1.5">
//                         <span className="font-bold text-slate-900">{doc.doctorName}</span>
//                         {doc.doctorId === 0 && (
//                           <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
//                             Direct Walk-in
//                           </span>
//                         )}
//                       </div>
//                       <span className="text-[11px] text-slate-400 block mt-0.5">
//                         {doc.specialization || 'General Referral'}
//                       </span>
//                     </td>

//                     {/* Visits */}
//                     <td className="py-3 px-4 text-center font-bold text-slate-900">
//                       {doc.totalVisits}
//                     </td>

//                     {/* Patients */}
//                     <td className="py-3 px-4 text-center text-slate-700">
//                       {doc.uniquePatients}
//                     </td>

//                     {/* Tests */}
//                     <td className="py-3 px-4 text-center font-semibold text-brand-600">
//                       {doc.totalTestsOrdered}
//                     </td>

//                     {/* Gross */}
//                     <td className="py-3 px-4 text-right font-medium text-slate-800">
//                       {formatCurrency(doc.grossRevenuePaisa)}
//                     </td>

//                     {/* Discounts */}
//                     <td className="py-3 px-4 text-right text-amber-700">
//                       {doc.totalDiscountPaisa > 0 ? formatCurrency(doc.totalDiscountPaisa) : '—'}
//                     </td>

//                     {/* Net */}
//                     <td className="py-3 px-4 text-right font-bold text-slate-900">
//                       {formatCurrency(doc.netRevenuePaisa)}
//                     </td>

//                     {/* Collected */}
//                     <td className="py-3 px-4 text-right text-emerald-700 font-medium">
//                       {formatCurrency(doc.totalPaidPaisa)}
//                     </td>

//                     {/* Balance */}
//                     <td className="py-3 px-4 text-right">
//                       {doc.totalBalancePaisa > 0 ? (
//                         <span className="font-bold text-rose-600">
//                           {formatCurrency(doc.totalBalancePaisa)}
//                         </span>
//                       ) : (
//                         <span className="text-slate-400 text-xs">Clear</span>
//                       )}
//                     </td>
//                   </tr>
//                 ))
//               )}
//             </tbody>
//           </table>
//         </div>
//       </Card>
//     </div>
//   );
// };
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DoctorReferralStats, Doctor } from '../../types';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatCurrency } from '../../lib/utils';
import { RotateCw, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

/*
 * Design tokens (kept as arbitrary Tailwind values so this file is self-contained)
 *   primary        #0F766E   primary hover  #115E59
 *   page bg        #F5F7FA   surface        #FFFFFF
 *   text           #1F2937   muted text     #64748B
 *   border         #E2E8F0
 *   warning        #D97706   error          #DC2626   success #15803D
 * Radius: 8px everywhere. No shadows. Teal is used only for selected/active/primary.
 */

type SortKey = 'visits' | 'gross' | 'net' | 'balance' | 'name';

// Local date -> YYYY-MM-DD (toISOString shifts the day for timezones ahead of UTC, e.g. PKT)
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
      if (thisRequest !== requestId.current) return; // a newer request replaced this one
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
    fetchStats();
  }, [fetchStats]);

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
      note: `${formatCurrency(totals.totalPaidPaisa)} collected`,
      alert: totals.totalBalancePaisa > 0,
    },
  ];

  const inputCls =
    'h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-[13px] text-[#1F2937] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

  return (
    <div className="space-y-5 text-[#1F2937]">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold leading-6">Referring doctors</h1>
          <p className="text-[13px] text-[#64748B] mt-0.5">
            Visits, billing and outstanding balances for each referring physician.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} isLoading={isLoading}>
          <RotateCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Filters: one flat row, no container card */}
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

        <label className="flex flex-col gap-1 text-xs text-[#64748B] sm:ml-auto">
          Doctor
          <select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            className={`${inputCls} min-w-[240px]`}
          >
            <option value="all">All doctors and walk-ins</option>
            <option value="0">Walk-ins only (no referring doctor)</option>
            {doctorsList.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.full_name}
                {doc.specialization ? ` (${doc.specialization})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Summary: a single ruled strip instead of six cards */}
      <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {summary.map((s, i) => (
          <div
            key={s.label}
            className={`px-4 py-3 border-[#E2E8F0] ${
              i > 0 ? 'xl:border-l' : ''
            } ${i % 2 === 1 ? 'border-l md:border-l-0' : ''} ${
              i >= 2 ? 'border-t md:border-t-0' : ''
            } ${i >= 3 ? 'md:border-t xl:border-t-0' : ''} ${i % 3 !== 0 ? 'md:border-l' : ''}`}
          >
            <dt className="text-xs text-[#64748B]">{s.label}</dt>
            <dd
              className={`mt-1 text-lg font-semibold leading-6 ${num} ${
                s.alert ? 'text-[#DC2626]' : 'text-[#1F2937]'
              }`}
            >
              {isLoading && stats.length === 0 ? '—' : s.value}
            </dd>
            <div className="mt-0.5 h-4 text-xs text-[#64748B]">{s.note ?? ''}</div>
          </div>
        ))}
      </dl>

      {/* Table */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {errorMessage && (
          <div className="p-3 border-b border-[#E2E8F0]">
            <Alert type="error">{errorMessage}</Alert>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <tr>
                {sortable('name', 'Doctor', 'left')}
                {/* {sortable('visits', 'Visits', 'right')} */}
                {plainHead('Patients', 'right')}
                {plainHead('Tests', 'right')}
                {sortable('gross', 'Gross', 'right')}
                {plainHead('Discount', 'right')}
                {sortable('net', 'Net', 'right')}
                {plainHead('Collected', 'right')}
                {sortable('balance', 'Balance', 'right')}
              </tr>
            </thead>

            <tbody>
              {isLoading && stats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-[#64748B]">
                    Loading referral figures…
                  </td>
                </tr>
              ) : sortedStats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center">
                    <p className="font-medium">No referrals in this period</p>
                    <p className="text-[#64748B] mt-0.5">
                      Widen the date range or choose a different doctor.
                    </p>
                  </td>
                </tr>
              ) : (
                sortedStats.map((doc) => (
                  <tr
                    key={doc.doctorId}
                    className={`border-b border-[#E2E8F0] hover:bg-[#F8FAFC] ${
                      isLoading ? 'opacity-60' : ''
                    }`}
                  >
                    <td className={cell}>
                      <div className="font-medium">
                        {doc.doctorName}
                        {doc.doctorId === 0 && (
                          <span className="ml-2 text-xs font-normal text-[#64748B]">
                            walk-in
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#64748B]">
                        {doc.specialization || (doc.doctorId === 0 ? 'No referring doctor' : '—')}
                      </div>
                    </td>
                    {/* <td className={`${cell} text-right ${num}`}>{doc.totalVisits}</td> */}
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
                  {/* <td className={`${cell} text-right ${num}`}>{totals.totalVisits}</td> */}
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
  );
};