// import React, { useState } from 'react';
// import { VisitDetail, HospitalSettings } from '../../types';
// import { Button } from '../../components/common/Button';
// import { formatCurrency, formatDateTime } from '../../lib/utils';
// import { Printer, X, Receipt, CheckCircle2, AlertCircle } from 'lucide-react';

// interface ReceiptPrintModalProps {
//   visitDetail: VisitDetail | null;
//   hospital: HospitalSettings | null;
//   isOpen: boolean;
//   onClose: () => void;
// }

// export const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
//   visitDetail,
//   hospital,
//   isOpen,
//   onClose,
// }) => {
//   const [printFormat, setPrintFormat] = useState<'standard' | 'thermal'>('standard');

//   if (!isOpen || !visitDetail) return null;

//   const { visit, patient, doctor, orderItems, invoice, payments } = visitDetail;
//   const latestPayment = payments.length > 0 ? payments[payments.length - 1] : null;

//   const handlePrint = () => {
//     window.print();
//   };

//   return (
//     <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
//       <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col my-auto max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:w-full print:max-w-none">
//         {/* Modal Controls - Hidden during Print */}
//         <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
//           <div className="flex items-center gap-2">
//             <Receipt className="w-5 h-5 text-brand-400" />
//             <h2 className="text-base font-bold">Laboratory Invoice & Official Receipt</h2>
//           </div>
//           <div className="flex items-center gap-3">
//             {/* Format Toggle */}
//             <div className="flex bg-slate-800 rounded-lg p-0.5 text-xs">
//               <button
//                 type="button"
//                 onClick={() => setPrintFormat('standard')}
//                 className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
//                   printFormat === 'standard' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
//                 }`}
//               >
//                 Standard (A4/A5)
//               </button>
//               <button
//                 type="button"
//                 onClick={() => setPrintFormat('thermal')}
//                 className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
//                   printFormat === 'thermal' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
//                 }`}
//               >
//                 Thermal (80mm)
//               </button>
//             </div>

//             <Button size="sm" variant="primary" onClick={handlePrint}>
//               <Printer className="w-4 h-4 mr-1.5" />
//               Print Receipt
//             </Button>
//             <button
//               onClick={onClose}
//               className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
//             >
//               <X className="w-5 h-5" />
//             </button>
//           </div>
//         </div>

//         {/* Printable Receipt Body */}
//         <div
//           className={`p-6 sm:p-8 overflow-y-auto bg-white text-slate-900 text-xs print:p-0 ${
//             printFormat === 'thermal' ? 'max-w-[80mm] mx-auto font-mono text-[11px]' : ''
//           }`}
//         >
//           {/* Header */}
//           <div className="border-b border-slate-300 pb-4 mb-4 text-center">
//             {hospital?.logo_url && (
//               <img
//                 src={hospital.logo_url}
//                 alt={hospital.hospital_name}
//                 className="h-12 w-auto mx-auto mb-2 object-contain print:h-10"
//               />
//             )}
//             <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 uppercase">
//               {hospital?.hospital_name || 'Medical Diagnostic Laboratory'}
//             </h1>
//             {hospital?.tagline && (
//               <p className="text-xs text-slate-500 font-medium italic mb-1">{hospital.tagline}</p>
//             )}
//             <p className="text-[11px] text-slate-600">
//               {hospital?.address}
//               {hospital?.phone_primary && ` • Tel: ${hospital.phone_primary}`}
//               {hospital?.email && ` • ${hospital.email}`}
//             </p>
//           </div>

//           {/* Receipt Numbers and Dates */}
//           <div className="grid grid-cols-2 gap-2 pb-3 mb-3 border-b border-dashed border-slate-300 text-[11px]">
//             <div>
//               <span className="text-slate-500 block">Visit Number:</span>
//               <span className="font-bold font-mono text-slate-900">{visit.visit_number}</span>
//             </div>
//             <div className="text-right">
//               <span className="text-slate-500 block">Invoice Number:</span>
//               <span className="font-bold font-mono text-slate-900">{invoice.invoice_number}</span>
//             </div>
//             <div>
//               <span className="text-slate-500 block">Order Date & Time:</span>
//               <span className="font-medium text-slate-800">{formatDateTime(visit.order_date)}</span>
//             </div>
//             <div className="text-right">
//               <span className="text-slate-500 block">Receipt / Ref #:</span>
//               <span className="font-mono text-slate-800">
//                 {latestPayment?.receipt_number || 'UNPAID'}
//               </span>
//             </div>
//           </div>

//           {/* Patient and Doctor Information */}
//           <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 print:bg-white print:border-slate-300">
//             <div className="grid grid-cols-2 gap-2 text-[11px]">
//               <div>
//                 <span className="text-slate-500 block">Patient Name:</span>
//                 <span className="font-bold text-sm text-slate-900">{patient.full_name}</span>
//                 <span className="text-slate-500 block mt-0.5">
//                   MRN: <strong className="font-mono text-slate-800">{patient.patient_mrn}</strong>
//                 </span>
//               </div>
//               <div className="text-right">
//                 <span className="text-slate-500 block">Demographics:</span>
//                 <span className="font-medium text-slate-800 capitalize">
//                   {patient.gender} • {patient.date_of_birth || 'Age Unknown'}
//                 </span>
//                 <span className="text-slate-500 block mt-0.5">
//                   Phone: {patient.phone_number || 'N/A'}
//                 </span>
//               </div>
//             </div>
//             <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] flex justify-between">
//               <span className="text-slate-500">Referring Doctor:</span>
//               <span className="font-semibold text-slate-800">
//                 {doctor ? `${doctor.full_name}${doctor.specialization ? ` (${doctor.specialization})` : ''}` : 'Self / Walk-in / Direct'}
//               </span>
//             </div>
//           </div>

//           {/* Itemized Tests Table */}
//           <table className="w-full mb-4 border-collapse text-left">
//             <thead>
//               <tr className="border-b border-slate-400 text-[11px] uppercase text-slate-600 font-bold">
//                 <th className="py-1.5 pr-2">#</th>
//                 <th className="py-1.5 pr-2">Test Name & Code</th>
//                 <th className="py-1.5 px-2 text-center">Qty</th>
//                 <th className="py-1.5 pl-2 text-right">Price</th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-slate-200">
//               {orderItems.map((item, idx) => (
//                 <tr key={item.id} className="text-slate-800">
//                   <td className="py-2 pr-2 text-slate-500">{idx + 1}</td>
//                   <td className="py-2 pr-2">
//                     <span className="font-bold text-slate-900">{item.test_name_snapshot}</span>
//                     <span className="font-mono text-[10px] text-slate-500 block">
//                       Code: {item.test_code_snapshot}
//                     </span>
//                   </td>
//                   <td className="py-2 px-2 text-center">{item.quantity}</td>
//                   <td className="py-2 pl-2 text-right font-mono font-medium">
//                     {formatCurrency(item.subtotal_amount)}
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>

//           {/* Financial Totals */}
//           <div className="border-t border-slate-300 pt-3 space-y-1.5 mb-4 text-xs">
//             <div className="flex justify-between text-slate-600">
//               <span>Gross Subtotal:</span>
//               <span className="font-mono font-medium text-slate-800">
//                 {formatCurrency(invoice.subtotal_amount)}
//               </span>
//             </div>
//             {invoice.discount_amount > 0 && (
//               <div className="flex justify-between text-emerald-700 font-medium">
//                 <span>
//                   Discount Applied
//                   {invoice.discount_type === 'percentage'
//                     ? ` (${invoice.discount_value}%)`
//                     : ' (Fixed)'}:
//                 </span>
//                 <span className="font-mono">-{formatCurrency(invoice.discount_amount)}</span>
//               </div>
//             )}
//             <div className="flex justify-between text-sm font-black border-t border-slate-300 pt-2 text-slate-900">
//               <span>Net Invoice Total:</span>
//               <span className="font-mono">{formatCurrency(invoice.final_total)}</span>
//             </div>
//             <div className="flex justify-between text-slate-700 font-medium pt-1">
//               <span>Amount Received:</span>
//               <span className="font-mono font-bold text-slate-900">
//                 {formatCurrency(invoice.paid_amount)}
//               </span>
//             </div>
//             <div
//               className={`flex justify-between text-sm font-bold pt-1 border-t border-dashed ${
//                 invoice.balance_amount > 0 ? 'text-amber-700' : 'text-emerald-700'
//               }`}
//             >
//               <span>Balance Due:</span>
//               <span className="font-mono">{formatCurrency(invoice.balance_amount)}</span>
//             </div>
//           </div>

//           {/* Payment Status Banner */}
//           <div
//             className={`p-2.5 rounded-lg text-center font-bold text-xs uppercase tracking-wider mb-4 border ${
//               invoice.payment_status === 'paid'
//                 ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
//                 : invoice.payment_status === 'partially_paid'
//                 ? 'bg-amber-50 text-amber-800 border-amber-200'
//                 : 'bg-red-50 text-red-800 border-red-200'
//             }`}
//           >
//             {invoice.payment_status === 'paid' ? (
//               <span className="inline-flex items-center gap-1.5">
//                 <CheckCircle2 className="w-4 h-4 text-emerald-600 print:hidden" />
//                 Payment Cleared in Full
//               </span>
//             ) : invoice.payment_status === 'partially_paid' ? (
//               <span className="inline-flex items-center gap-1.5">
//                 <AlertCircle className="w-4 h-4 text-amber-600 print:hidden" />
//                 Partially Paid — Balance Outstanding
//               </span>
//             ) : (
//               'Payment Pending / Unpaid'
//             )}
//           </div>

//           {/* Footer Terms */}
//           <div className="text-[10px] text-slate-500 border-t border-slate-200 pt-3 text-center leading-relaxed">
//             <p>Laboratory reports will be released upon presentation of this original receipt.</p>
//             <p>Computer-generated invoice. No physical signature required.</p>
//             <p className="mt-1 font-mono text-[9px] text-slate-400">
//               Issued: {new Date().toISOString()} • Operator: {visit.operator_name || 'Laboratory Staff'}
//             </p>
//           </div>
//         </div>

//         {/* Modal Footer - Hidden during Print */}
//         <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 print:hidden">
//           <Button size="sm" variant="secondary" onClick={onClose}>
//             Close
//           </Button>
//           <Button size="sm" variant="primary" onClick={handlePrint}>
//             <Printer className="w-4 h-4 mr-1.5" />
//             Print
//           </Button>
//         </div>
//       </div>
//     </div>
//   );
// };

import React, { useState, useEffect } from 'react';
import { VisitDetail, HospitalSettings } from '../../types';
import { Button } from '../../components/common/Button';
import { formatCurrency, formatDateTime, calculateAge } from '../../lib/utils';
import { Printer, X } from 'lucide-react';

/*
 * Same tokens as the rest of the app (primary #0F766E, border #E2E8F0, text #1F2937,
 * muted #64748B, radius 8px). The receipt itself is black on white so it prints
 * cleanly on any printer, including black-and-white thermal ones.
 */

interface ReceiptPrintModalProps {
  visitDetail: VisitDetail | null;
  hospital: HospitalSettings | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
  visitDetail,
  hospital,
  isOpen,
  onClose,
}) => {
  const [printFormat, setPrintFormat] = useState<'standard' | 'thermal'>('standard');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !visitDetail) return null;

  const { visit, patient, doctor, orderItems, invoice, payments } = visitDetail;
  const latestPayment = payments.length > 0 ? payments[payments.length - 1] : null;
  const isThermal = printFormat === 'thermal';
  const ageInfo = patient.date_of_birth ? calculateAge(patient.date_of_birth) : null;

  const handlePrint = () => window.print();

  const statusText =
    invoice.payment_status === 'paid'
      ? 'Paid in full'
      : invoice.payment_status === 'partially_paid'
      ? 'Partly paid. Balance outstanding.'
      : 'Unpaid';

  const statusColor =
    invoice.payment_status === 'paid'
      ? 'text-[#15803D]'
      : invoice.payment_status === 'partially_paid'
      ? 'text-[#D97706]'
      : 'text-[#DC2626]';

  const contactLine = [
    hospital?.address,
    hospital?.phone_primary && `Tel ${hospital.phone_primary}`,
    hospital?.email,
  ]
    .filter(Boolean)
    .join(', ');

  const Row: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
    label,
    value,
    mono,
  }) => (
    <div className="flex justify-between gap-3">
      <dt className="text-[#64748B] print:text-black">{label}</dt>
      <dd className={`text-right ${mono ? 'tabular-nums' : ''}`}>{value}</dd>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 print:p-0 print:bg-white print:static print:block"
      role="dialog"
      aria-modal="true"
      aria-label="Invoice and receipt"
    >
      {/* Page size follows the chosen format */}
      <style>{`@media print { @page { size: ${isThermal ? '80mm auto' : 'A4'}; margin: ${
        isThermal ? '3mm' : '12mm'
      }; } }`}</style>

      <div className="bg-white rounded-lg border border-[#E2E8F0] w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden text-[#1F2937] print:max-h-none print:border-0 print:rounded-none print:max-w-none print:overflow-visible">
        {/* Controls (not printed) */}
        <div className="px-5 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <h2 className="text-base font-semibold">Invoice and receipt</h2>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white p-0.5">
              {(
                [
                  { id: 'standard', label: 'A4 / A5' },
                  { id: 'thermal', label: 'Thermal 80 mm' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={printFormat === f.id}
                  onClick={() => setPrintFormat(f.id)}
                  className={`h-7 px-3 rounded-md text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] ${
                    printFormat === f.id
                      ? 'bg-[#0F766E] text-white'
                      : 'text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <Button
              size="sm"
              variant="primary"
              onClick={handlePrint}
              className="bg-[#0F766E] hover:bg-[#115E59]"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print
            </Button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 hover:text-[#1F2937] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Paper preview */}
        <div className="flex-1 overflow-y-auto bg-[#F5F7FA] p-5 print:p-0 print:bg-white print:overflow-visible">
          <div
            className={`bg-white border border-[#E2E8F0] rounded-lg mx-auto p-6 text-[13px] leading-5 print:border-0 print:rounded-none print:p-0 print:text-black ${
              isThermal ? 'max-w-[80mm] font-mono text-[11px] leading-4 p-4' : ''
            }`}
          >
            {/* Letterhead */}
            <header className="text-center pb-3 mb-3 border-b border-[#CBD5E1] print:border-black">
              {hospital?.logo_url && (
                <img
                  src={hospital.logo_url}
                  alt={hospital.hospital_name}
                  className="h-12 w-auto mx-auto mb-2 object-contain print:h-10"
                />
              )}
              <h1 className="text-base font-semibold leading-5">
                {hospital?.hospital_name || 'Medical Diagnostic Laboratory'}
              </h1>
              {hospital?.tagline && (
                <p className="text-xs text-[#64748B] print:text-black">{hospital.tagline}</p>
              )}
              {contactLine && (
                <p className="text-xs text-[#64748B] print:text-black mt-0.5">{contactLine}</p>
              )}
            </header>

            {/* Document numbers */}
            <dl
              className={`grid gap-x-8 gap-y-1 pb-3 mb-3 border-b border-[#E2E8F0] print:border-black ${
                isThermal ? 'grid-cols-1' : 'grid-cols-2'
              }`}
            >
              <Row label="Invoice no." value={invoice.invoice_number} mono />
              <Row label="Visit no." value={visit.visit_number} mono />
              <Row label="Date" value={formatDateTime(visit.order_date)} />
              <Row
                label="Receipt no."
                value={latestPayment?.receipt_number || 'Not paid yet'}
                mono
              />
            </dl>

            {/* Patient */}
            <section className="pb-3 mb-3 border-b border-[#E2E8F0] print:border-black">
              <p className="font-semibold text-sm">{patient.full_name}</p>
              <dl
                className={`mt-1 grid gap-x-8 gap-y-1 ${
                  isThermal ? 'grid-cols-1' : 'grid-cols-2'
                }`}
              >
                <Row label="MRN" value={patient.patient_mrn} mono />
                <Row
                  label="Age, sex"
                  value={
                    <span className="capitalize">
                      {ageInfo ? ageInfo.formatted : 'Age not recorded'}, {patient.gender}
                    </span>
                  }
                />
                <Row label="Phone" value={patient.phone_number || '—'} />
                <Row
                  label="Referred by"
                  value={
                    doctor
                      ? `${doctor.full_name}${
                          doctor.specialization ? ` (${doctor.specialization})` : ''
                        }`
                      : 'Walk-in, no doctor'
                  }
                />
              </dl>
            </section>

            {/* Tests */}
            <table className="w-full border-collapse mb-3">
              <thead>
                <tr className="border-b border-[#1F2937] print:border-black text-left font-semibold">
                  <th className="py-1.5 pr-2">Test</th>
                  <th className="py-1.5 px-2 text-center w-10">Qty</th>
                  <th className="py-1.5 pl-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[#E2E8F0] print:border-slate-400 align-top"
                  >
                    <td className="py-1.5 pr-2">
                      {item.test_name_snapshot}
                      <span className="text-xs text-[#64748B] print:text-black">
                        {' '}
                        {item.test_code_snapshot}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{item.quantity}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">
                      {formatCurrency(item.subtotal_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <dl className={`space-y-1 mb-3 ${isThermal ? '' : 'ml-auto w-full max-w-[18rem]'}`}>
              <Row label="Subtotal" value={formatCurrency(invoice.subtotal_amount)} mono />
              {invoice.discount_amount > 0 && (
                <Row
                  label={`Discount${
                    invoice.discount_type === 'percentage' ? ` (${invoice.discount_value}%)` : ''
                  }`}
                  value={`− ${formatCurrency(invoice.discount_amount)}`}
                  mono
                />
              )}
              <div className="flex justify-between gap-3 pt-1.5 border-t border-[#1F2937] print:border-black font-semibold text-sm">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCurrency(invoice.final_total)}</dd>
              </div>
              <Row label="Received" value={formatCurrency(invoice.paid_amount)} mono />
              <div className="flex justify-between gap-3 font-semibold">
                <dt>Balance due</dt>
                <dd className="tabular-nums">{formatCurrency(invoice.balance_amount)}</dd>
              </div>
            </dl>

            {/* Payment status: plain text, readable without color */}
            <p
              className={`py-2 mb-3 text-center font-semibold border-y border-[#E2E8F0] print:border-black print:text-black ${statusColor}`}
            >
              {statusText}
            </p>

            {/* Footer */}
            <footer className="text-xs text-[#64748B] print:text-black text-center space-y-0.5">
              <p>Reports are released on presentation of this receipt.</p>
              <p>Computer-generated invoice. No signature required.</p>
              <p className="pt-1">
                Printed {formatDateTime(new Date().toISOString())} by{' '}
                {visit.operator_name || 'Laboratory staff'}
              </p>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
};