// import React, { useState, useEffect, useMemo } from 'react';
// import { Button } from '../../components/common/Button';
// import { Badge } from '../../components/common/Badge';
// import { Alert } from '../../components/common/Alert';
// import { formatDateTime, calculateAge } from '../../lib/utils';
// import { RangeMatcher, ParameterRangeRule, EvaluationResult } from '../../../electron/services/range-matcher';
// import { OrderItem, Patient, TestResult } from '../../types';
// import { ResultAmendmentModal } from './ResultAmendmentModal';
// import {
//   X,
//   Save,
//   CheckCircle2,
//   FileCheck2,
//   AlertTriangle,
//   Edit3,
//   User,
//   Calendar,
//   Clock,
//   Loader2,
// } from 'lucide-react';

// interface ParameterDetail {
//   parameter: {
//     id: number;
//     name: string;
//     unit: string | null;
//     type: 'numeric' | 'text' | 'options';
//     displayOrder: number;
//   };
//   currentResult: TestResult | null;
//   ranges: ParameterRangeRule[];
// }

// export interface VisitTestItem {
//   orderItemId: number;
//   testName: string;
//   testCode: string;
//   parametersEntered: number;
//   parametersTotal: number;
//   status?: string;
// }

// interface ResultEntryModalProps {
//   orderItemId: number | null;
//   visitTests?: VisitTestItem[];
//   isOpen: boolean;
//   onClose: () => void;
//   onSaved?: () => void;
//   onFinalized?: (visitId: number) => void;
//   onSelectTest?: (orderItemId: number) => void;
// }

// export const ResultEntryModal: React.FC<ResultEntryModalProps> = ({
//   orderItemId,
//   visitTests,
//   isOpen,
//   onClose,
//   onSaved,
//   onFinalized,
//   onSelectTest,
// }) => {
//   const [currentOrderItemId, setCurrentOrderItemId] = useState<number | null>(orderItemId);
//   const [isLoading, setIsLoading] = useState(false);
//   const [isSaving, setIsSaving] = useState(false);
//   const [isReviewing, setIsReviewing] = useState(false);
//   const [isFinalizing, setIsFinalizing] = useState(false);

//   const [orderItem, setOrderItem] = useState<OrderItem | null>(null);
//   const [patient, setPatient] = useState<Patient | null>(null);
//   const [parameters, setParameters] = useState<ParameterDetail[]>([]);

//   // Keep currentOrderItemId synchronized with prop
//   useEffect(() => {
//     setCurrentOrderItemId(orderItemId);
//   }, [orderItemId]);

//   // Local form state: parameterId -> { value: string, notes: string }
//   const [formValues, setFormValues] = useState<Record<number, { value: string; notes: string }>>({});
//   const [errorMessage, setErrorMessage] = useState<string | null>(null);
//   const [successMessage, setSuccessMessage] = useState<string | null>(null);

//   // Amendment modal state
//   const [amendingResultId, setAmendingResultId] = useState<number | null>(null);

//   // Fetch order item results on open or when switching tests
//   const loadOrderDetails = async (idToFetch?: number) => {
//     const targetId = idToFetch ?? currentOrderItemId;
//     if (!targetId) return;
//     setIsLoading(true);
//     setErrorMessage(null);
//     setSuccessMessage(null);

//     try {
//       const res = await window.electronAPI.results.getForOrderItem(targetId);
//       if (res.success && res.data) {
//         setOrderItem(res.data.orderItem);
//         setPatient(res.data.patient);
//         setParameters(res.data.parameters);

//         const initialForm: Record<number, { value: string; notes: string }> = {};
//         for (const p of res.data.parameters) {
//           initialForm[p.parameter.id] = {
//             value: p.currentResult?.result_value || '',
//             notes: p.currentResult?.result_notes || '',
//           };
//         }
//         setFormValues(initialForm);
//       } else {
//         setErrorMessage(res.error || 'Failed to load test parameters.');
//       }
//     } catch (err: any) {
//       setErrorMessage(err?.message || 'Error communicating with laboratory database.');
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   useEffect(() => {
//     if (isOpen && currentOrderItemId) {
//       loadOrderDetails(currentOrderItemId);
//     } else if (!isOpen) {
//       setOrderItem(null);
//       setPatient(null);
//       setParameters([]);
//       setFormValues({});
//       setErrorMessage(null);
//       setSuccessMessage(null);
//     }
//   }, [isOpen, currentOrderItemId]);

//   const handleSwitchTest = (newId: number) => {
//     if (newId === currentOrderItemId) return;
//     setCurrentOrderItemId(newId);
//     onSelectTest?.(newId);
//   };

//   const isOrderFinalized = orderItem?.status === 'completed';

//   // Live evaluation of results against reference ranges
//   const evaluations = useMemo(() => {
//     if (!patient || !orderItem) return {};

//     const evals: Record<number, EvaluationResult> = {};
//     for (const p of parameters) {
//       const val = formValues[p.parameter.id]?.value || '';
//       evals[p.parameter.id] = RangeMatcher.evaluateResult(
//         val,
//         p.parameter.type,
//         p.parameter.unit,
//         p.ranges,
//         {
//           gender: patient.gender,
//           dateOfBirth: patient.date_of_birth,
//           orderDate: orderItem.created_at,
//         }
//       );
//     }
//     return evals;
//   }, [patient, orderItem, parameters, formValues]);

//   const handleValueChange = (parameterId: number, value: string) => {
//     setFormValues((prev) => ({
//       ...prev,
//       [parameterId]: {
//         ...prev[parameterId],
//         value,
//       },
//     }));
//   };

//   const handleNotesChange = (parameterId: number, notes: string) => {
//     setFormValues((prev) => ({
//       ...prev,
//       [parameterId]: {
//         ...prev[parameterId],
//         notes,
//       },
//     }));
//   };

//   const handleSaveDraft = async () => {
//     if (!currentOrderItemId) return;
//     setIsSaving(true);
//     setErrorMessage(null);
//     setSuccessMessage(null);

//     try {
//       const resultsToSave = parameters
//         .filter((p) => {
//           const val = formValues[p.parameter.id]?.value;
//           return val !== undefined && val.trim().length > 0;
//         })
//         .map((p) => ({
//           parameterId: p.parameter.id,
//           resultValue: formValues[p.parameter.id].value.trim(),
//           resultNotes: formValues[p.parameter.id].notes?.trim() || undefined,
//         }));

//       if (resultsToSave.length === 0) {
//         setErrorMessage('Please enter at least one parameter value before saving a draft.');
//         setIsSaving(false);
//         return;
//       }

//       const res = await window.electronAPI.results.saveDraft({
//         orderItemId: currentOrderItemId,
//         results: resultsToSave,
//       });

//       if (res.success) {
//         setSuccessMessage('Draft results saved successfully.');
//         onSaved?.();
//         await loadOrderDetails(currentOrderItemId);
//       } else {
//         setErrorMessage(res.error || 'Failed to save draft results.');
//       }
//     } catch (err: any) {
//       setErrorMessage(err?.message || 'Error occurred while saving draft.');
//     } finally {
//       setIsSaving(false);
//     }
//   };

//   const handleMarkReviewed = async () => {
//     if (!currentOrderItemId) return;
//     setIsReviewing(true);
//     setErrorMessage(null);
//     setSuccessMessage(null);

//     try {
//       const res = await window.electronAPI.results.markReviewed(currentOrderItemId);
//       if (res.success) {
//         setSuccessMessage('All entered parameters marked as reviewed.');
//         onSaved?.();
//         await loadOrderDetails(currentOrderItemId);
//       } else {
//         setErrorMessage(res.error || 'Failed to mark results as reviewed.');
//       }
//     } catch (err: any) {
//       setErrorMessage(err?.message || 'Error marking results as reviewed.');
//     } finally {
//       setIsReviewing(false);
//     }
//   };

//   const handleFinalizeReport = async () => {
//     if (!orderItem) return;
//     setErrorMessage(null);
//     setSuccessMessage(null);

//     // Verify all active parameters are filled
//     const missing = parameters.filter((p) => {
//       const val = formValues[p.parameter.id]?.value;
//       return !val || !val.trim();
//     });

//     if (missing.length > 0) {
//       setErrorMessage(
//         `Cannot finalize report: ${missing.length} parameter(s) (${missing.map((m) => m.parameter.name).join(', ')}) have no entered value. Save as draft instead.`
//       );
//       return;
//     }

//     // Save any pending values first
//     setIsFinalizing(true);
//     try {
//       const resultsToSave = parameters.map((p) => ({
//         parameterId: p.parameter.id,
//         resultValue: formValues[p.parameter.id].value.trim(),
//         resultNotes: formValues[p.parameter.id].notes?.trim() || undefined,
//       }));

//       const saveRes = await window.electronAPI.results.saveDraft({
//         orderItemId: orderItem.id,
//         results: resultsToSave,
//       });

//       if (!saveRes.success) {
//         setErrorMessage(saveRes.error || 'Failed to update results prior to finalization.');
//         setIsFinalizing(false);
//         return;
//       }

//       // Finalize report
//       const finalizeRes = await window.electronAPI.results.finalizeReport({
//         visitId: orderItem.visit_id,
//         notes: 'Finalized via laboratory accession desk',
//       });

//       if (finalizeRes.success) {
//         setSuccessMessage('Laboratory report finalized and locked successfully.');
//         onSaved?.();
//         await loadOrderDetails();
//         if (onFinalized) {
//           onFinalized(orderItem.visit_id);
//         }
//       } else {
//         setErrorMessage(finalizeRes.error || 'Failed to finalize laboratory report.');
//       }
//     } catch (err: any) {
//       setErrorMessage(err?.message || 'Error occurred during report finalization.');
//     } finally {
//       setIsFinalizing(false);
//     }
//   };

//   if (!isOpen) return null;

//   const ageInfo = patient ? calculateAge(patient.date_of_birth) : null;

//   return (
//     <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
//       <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full overflow-hidden flex flex-col my-auto max-h-[94vh]">
//         {/* Modal Header */}
//         <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
//           <div className="flex items-center gap-3">
//             <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center border border-brand-500/30">
//               <FileCheck2 className="w-5 h-5" />
//             </div>
//             <div>
//               <h2 className="text-base font-bold">
//                 {orderItem?.test_name_snapshot || 'Specimen Result Entry'}
//               </h2>
//               <p className="text-xs text-slate-400">
//                 Test Code: <span className="font-mono text-slate-300">{orderItem?.test_code_snapshot || '—'}</span> • Order Item #{currentOrderItemId}
//               </p>
//             </div>
//           </div>

//           <button
//             onClick={onClose}
//             className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
//           >
//             <X className="w-5 h-5" />
//           </button>
//         </div>

//         {/* Test Switcher Bar for multi-test visits */}
//         {visitTests && visitTests.length > 1 && (
//           <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
//             <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
//               Tests In This Visit ({visitTests.length}):
//             </span>
//             <div className="flex items-center gap-2 flex-wrap">
//               {visitTests.map((t) => {
//                 const isSelected = t.orderItemId === currentOrderItemId;
//                 const isComplete = t.parametersTotal > 0 && t.parametersEntered === t.parametersTotal;
//                 return (
//                   <button
//                     key={t.orderItemId}
//                     type="button"
//                     onClick={() => handleSwitchTest(t.orderItemId)}
//                     className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all ${
//                       isSelected
//                         ? 'bg-white text-brand-700 border-brand-500 shadow-sm ring-1 ring-brand-500/30'
//                         : 'bg-slate-200/70 text-slate-700 border-slate-300 hover:bg-white hover:text-slate-900'
//                     }`}
//                   >
//                     <span>{t.testName}</span>
//                     <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
//                       {t.testCode}
//                     </span>
//                     <span
//                       className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
//                         isComplete
//                           ? 'bg-emerald-100 text-emerald-800'
//                           : t.parametersEntered > 0
//                           ? 'bg-amber-100 text-amber-800'
//                           : 'bg-slate-200 text-slate-600'
//                       }`}
//                     >
//                       {t.parametersEntered} / {t.parametersTotal}
//                     </span>
//                   </button>
//                 );
//               })}
//             </div>
//           </div>
//         )}

//         {/* Demographics Strip */}
//         {patient && orderItem && (
//           <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs shrink-0">
//             <div>
//               <span className="text-slate-500 block">Patient Name & MRN</span>
//               <span className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
//                 <User className="w-3.5 h-3.5 text-slate-400" />
//                 {patient.full_name} ({patient.patient_mrn})
//               </span>
//             </div>

//             <div>
//               <span className="text-slate-500 block">Age & Biological Sex</span>
//               <span className="font-semibold text-slate-800 capitalize mt-0.5 block">
//                 {ageInfo ? ageInfo.formatted : 'Age unrecorded'} • {patient.gender}
//               </span>
//             </div>

//             <div>
//               <span className="text-slate-500 block">Visit Number & Date</span>
//               <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
//                 <Calendar className="w-3.5 h-3.5 text-slate-400" />
//                 {orderItem.visit_id ? `Visit #${orderItem.visit_id}` : '—'} • {formatDateTime(orderItem.created_at)}
//               </span>
//             </div>

//             <div>
//               <span className="text-slate-500 block">Status & Locking</span>
//               <div className="mt-0.5">
//                 {isOrderFinalized ? (
//                   <Badge variant="success">Finalized & Locked</Badge>
//                 ) : (
//                   <Badge variant="warning">In Progress / Draft</Badge>
//                 )}
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Modal Body */}
//         <div className="p-6 overflow-y-auto flex-1 space-y-4">
//           {errorMessage && <Alert type="error">{errorMessage}</Alert>}
//           {successMessage && <Alert type="success">{successMessage}</Alert>}

//           {isOrderFinalized && (
//             <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-900">
//               <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
//               <div>
//                 <span className="font-bold block">Immutable Finalized Record</span>
//                 This test order has been validated and finalized. Direct editing is locked. Any corrections require an audited formal clinical amendment.
//               </div>
//             </div>
//           )}

//           {isLoading ? (
//             <div className="py-16 text-center text-slate-500">
//               <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-brand-500" />
//               <p className="text-sm font-medium">Loading test parameters & reference ranges...</p>
//             </div>
//           ) : parameters.length === 0 ? (
//             <div className="py-12 text-center text-slate-500">
//               <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
//               <p className="text-sm font-semibold text-slate-800">No Parameters Defined</p>
//               <p className="text-xs text-slate-500 mt-1">
//                 This test catalog entry does not have any active clinical parameters configured.
//               </p>
//             </div>
//           ) : (
//             <div className="overflow-x-auto rounded-xl border border-slate-200">
//               <table className="w-full text-left text-xs border-collapse">
//                 <thead>
//                   <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
//                     <th className="py-3 px-4 w-1/4">Parameter & Unit</th>
//                     <th className="py-3 px-4 w-1/4">Reference Range (Age/Sex Matched)</th>
//                     <th className="py-3 px-4 w-1/4">Observed Value</th>
//                     <th className="py-3 px-3 w-28 text-center">Clinical Flag</th>
//                     <th className="py-3 px-4">Notes / Actions</th>
//                   </tr>
//                 </thead>
//                 <tbody className="divide-y divide-slate-200">
//                   {parameters.map((p) => {
//                     const evalRes = evaluations[p.parameter.id];
//                     const currentVal = formValues[p.parameter.id]?.value || '';
//                     const currentNotes = formValues[p.parameter.id]?.notes || '';
//                     const resultId = p.currentResult?.id;

//                     return (
//                       <tr
//                         key={p.parameter.id}
//                         className={`hover:bg-slate-50/70 transition-colors ${
//                           evalRes?.flag === 'critical' ? 'bg-rose-50/50' : ''
//                         }`}
//                       >
//                         {/* Parameter Name & Unit */}
//                         <td className="py-3.5 px-4 align-top">
//                           <span className="font-bold text-slate-900 block">{p.parameter.name}</span>
//                           <span className="text-[11px] text-slate-500 font-mono mt-0.5 inline-block">
//                             Unit: {p.parameter.unit || 'None'} • Type: {p.parameter.type}
//                           </span>
//                         </td>

//                         {/* Reference Range Display */}
//                         <td className="py-3.5 px-4 align-top text-slate-700">
//                           <div className="font-medium text-slate-800">
//                             {evalRes?.referenceRangeDisplay || 'Unconfigured'}
//                           </div>
//                           {evalRes?.matchedRangeRule && (
//                             <span className="text-[10px] text-slate-400 block mt-0.5">
//                               Rule: {evalRes.matchedRangeRule.gender} (
//                               {Math.round(evalRes.matchedRangeRule.min_age_days / 365)} -{' '}
//                               {Math.round(evalRes.matchedRangeRule.max_age_days / 365)} yrs)
//                             </span>
//                           )}
//                         </td>

//                         {/* Result Value Input */}
//                         <td className="py-3.5 px-4 align-top">
//                           <div className="relative">
//                             <input
//                               type="text"
//                               value={currentVal}
//                               onChange={(e) => handleValueChange(p.parameter.id, e.target.value)}
//                               disabled={isOrderFinalized}
//                               placeholder={
//                                 p.parameter.type === 'numeric' ? '0.00' : 'Enter result...'
//                               }
//                               className={`w-full px-3 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-2 transition-all ${
//                                 isOrderFinalized
//                                   ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
//                                   : evalRes && !evalRes.isValid && currentVal
//                                   ? 'border-rose-300 ring-rose-200 text-rose-900 bg-rose-50/30'
//                                   : evalRes?.flag === 'critical'
//                                   ? 'border-rose-400 ring-rose-300 text-rose-900 font-bold bg-rose-50'
//                                   : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/20 bg-white text-slate-900'
//                               }`}
//                             />
//                             {p.parameter.unit && (
//                               <span className="absolute right-2.5 top-2 text-[10px] font-mono text-slate-400 pointer-events-none">
//                                 {p.parameter.unit}
//                               </span>
//                             )}
//                           </div>
//                           {evalRes && !evalRes.isValid && currentVal && (
//                             <span className="text-[10px] text-rose-600 block mt-1 font-medium">
//                               {evalRes.validationError}
//                             </span>
//                           )}
//                         </td>

//                         {/* Flag Badge */}
//                         <td className="py-3.5 px-3 align-top text-center">
//                           {currentVal.trim().length === 0 ? (
//                             <span className="text-slate-400 text-[11px]">—</span>
//                           ) : evalRes?.flag === 'normal' ? (
//                             <Badge variant="success">NORMAL</Badge>
//                           ) : evalRes?.flag === 'low' ? (
//                             <Badge variant="warning">LOW (L)</Badge>
//                           ) : evalRes?.flag === 'high' ? (
//                             <Badge variant="warning">HIGH (H)</Badge>
//                           ) : evalRes?.flag === 'critical' ? (
//                             <Badge variant="danger" className="animate-pulse font-bold">
//                               CRITICAL *
//                             </Badge>
//                           ) : (
//                             <Badge variant="outline">—</Badge>
//                           )}
//                         </td>

//                         {/* Notes / Amendments */}
//                         <td className="py-3.5 px-4 align-top">
//                           {!isOrderFinalized ? (
//                             <input
//                               type="text"
//                               value={currentNotes}
//                               onChange={(e) => handleNotesChange(p.parameter.id, e.target.value)}
//                               placeholder="Clinical note (optional)..."
//                               className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
//                             />
//                           ) : (
//                             <div className="flex items-center justify-between gap-2">
//                               <span className="text-slate-600 text-xs truncate max-w-[150px]">
//                                 {currentNotes || 'No notes recorded'}
//                               </span>
//                               {resultId && (
//                                 <Button
//                                   size="sm"
//                                   variant="outline"
//                                   className="text-[11px] px-2 py-1 h-7 border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0"
//                                   onClick={() => setAmendingResultId(resultId)}
//                                 >
//                                   <Edit3 className="w-3 h-3 mr-1" />
//                                   Amend
//                                 </Button>
//                               )}
//                             </div>
//                           )}
//                         </td>
//                       </tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </div>

//         {/* Modal Footer Controls */}
//         <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
//           <div className="text-xs text-slate-500 flex items-center gap-1.5">
//             <Clock className="w-4 h-4 text-slate-400" />
//             <span>Values are strictly verified against validated reference ranges.</span>
//           </div>

//           <div className="flex items-center gap-2">
//             <Button variant="outline" size="sm" onClick={onClose}>
//               Close
//             </Button>

//             {!isOrderFinalized && (
//               <>
//                 <Button
//                   variant="outline"
//                   size="sm"
//                   onClick={handleSaveDraft}
//                   isLoading={isSaving}
//                   disabled={isLoading || parameters.length === 0}
//                 >
//                   <Save className="w-3.5 h-3.5 mr-1.5" />
//                   Save Draft
//                 </Button>

//                 <Button
//                   variant="outline"
//                   size="sm"
//                   onClick={handleMarkReviewed}
//                   isLoading={isReviewing}
//                   disabled={isLoading || parameters.length === 0}
//                 >
//                   <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-sky-500" />
//                   Mark Reviewed
//                 </Button>

//                 <Button
//                   variant="primary"
//                   size="sm"
//                   onClick={handleFinalizeReport}
//                   isLoading={isFinalizing}
//                   disabled={isLoading || parameters.length === 0}
//                   className="bg-emerald-600 hover:bg-emerald-700"
//                 >
//                   <FileCheck2 className="w-3.5 h-3.5 mr-1.5" />
//                   Finalize Report
//                 </Button>
//               </>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* Clinical Amendment Modal for Finalized Results */}
//       <ResultAmendmentModal
//         resultId={amendingResultId}
//         isOpen={!!amendingResultId}
//         onClose={() => setAmendingResultId(null)}
//         onSuccess={async () => {
//           setSuccessMessage('Formal amendment recorded successfully.');
//           await loadOrderDetails();
//           onSaved?.();
//         }}
//       />
//     </div>
//   );
// };
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatDateTime, calculateAge } from '../../lib/utils';
import { RangeMatcher, ParameterRangeRule, EvaluationResult } from '../../../electron/services/range-matcher';
import { OrderItem, Patient, TestResult } from '../../types';
import { ResultAmendmentModal } from './ResultAmendmentModal';
import { X, Save, CheckCircle2, FileCheck2, Loader2 } from 'lucide-react';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, page #F5F7FA, surface #FFFFFF,
 *   text #1F2937, muted #64748B, border #E2E8F0,
 *   warning #D97706, error #DC2626, success #15803D. Radius 8px, no decorative shadows.
 */

interface ParameterDetail {
  parameter: {
    id: number;
    name: string;
    unit: string | null;
    type: 'numeric' | 'text' | 'options';
    displayOrder: number;
  };
  currentResult: TestResult | null;
  ranges: ParameterRangeRule[];
}

export interface VisitTestItem {
  orderItemId: number;
  testName: string;
  testCode: string;
  parametersEntered: number;
  parametersTotal: number;
  status?: string;
}

interface ResultEntryModalProps {
  orderItemId: number | null;
  visitTests?: VisitTestItem[];
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onFinalized?: (visitId: number) => void;
  onSelectTest?: (orderItemId: number) => void;
}

const FLAG_LABEL: Record<string, { text: string; cls: string }> = {
  normal: { text: 'Normal', cls: 'text-[#15803D]' },
  low: { text: 'Low', cls: 'text-[#D97706] font-semibold' },
  high: { text: 'High', cls: 'text-[#D97706] font-semibold' },
  critical: { text: 'Critical', cls: 'text-[#DC2626] font-semibold' },
};

export const ResultEntryModal: React.FC<ResultEntryModalProps> = ({
  orderItemId,
  visitTests,
  isOpen,
  onClose,
  onSaved,
  onFinalized,
  onSelectTest,
}) => {
  const [currentOrderItemId, setCurrentOrderItemId] = useState<number | null>(orderItemId);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const [orderItem, setOrderItem] = useState<OrderItem | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [parameters, setParameters] = useState<ParameterDetail[]>([]);

  const [formValues, setFormValues] = useState<Record<number, { value: string; notes: string }>>({});
  const [openNotes, setOpenNotes] = useState<Record<number, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [amendingResultId, setAmendingResultId] = useState<number | null>(null);

  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    setCurrentOrderItemId(orderItemId);
  }, [orderItemId]);

  const loadOrderDetails = async (idToFetch?: number) => {
    const targetId = idToFetch ?? currentOrderItemId;
    if (!targetId) return;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await window.electronAPI.results.getForOrderItem(targetId);
      if (res.success && res.data) {
        setOrderItem(res.data.orderItem);
        setPatient(res.data.patient);
        setParameters(res.data.parameters);

        const initialForm: Record<number, { value: string; notes: string }> = {};
        for (const p of res.data.parameters) {
          initialForm[p.parameter.id] = {
            value: p.currentResult?.result_value || '',
            notes: p.currentResult?.result_notes || '',
          };
        }
        setFormValues(initialForm);
        setOpenNotes({});
      } else {
        setErrorMessage(res.error || 'Could not load the test parameters.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not reach the laboratory database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentOrderItemId) {
      loadOrderDetails(currentOrderItemId);
    } else if (!isOpen) {
      setOrderItem(null);
      setPatient(null);
      setParameters([]);
      setFormValues({});
      setOpenNotes({});
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, currentOrderItemId]);

  const isOrderFinalized = orderItem?.status === 'completed';

  // Put the cursor in the first empty result box once the list is ready
  useEffect(() => {
    if (isLoading || isOrderFinalized || parameters.length === 0) return;
    const inputs = tableRef.current?.querySelectorAll<HTMLInputElement>('input[data-result]');
    if (!inputs) return;
    const firstEmpty = Array.from(inputs).find((i) => !i.value) || inputs[0];
    firstEmpty?.focus();
  }, [isLoading, isOrderFinalized, parameters.length, currentOrderItemId]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !amendingResultId) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, amendingResultId]);

  const handleSwitchTest = (newId: number) => {
    if (newId === currentOrderItemId) return;
    setCurrentOrderItemId(newId);
    onSelectTest?.(newId);
  };

  const evaluations = useMemo(() => {
    if (!patient || !orderItem) return {};
    const evals: Record<number, EvaluationResult> = {};
    for (const p of parameters) {
      const val = formValues[p.parameter.id]?.value || '';
      evals[p.parameter.id] = RangeMatcher.evaluateResult(
        val,
        p.parameter.type,
        p.parameter.unit,
        p.ranges,
        {
          gender: patient.gender,
          dateOfBirth: patient.date_of_birth,
          orderDate: orderItem.created_at,
        }
      );
    }
    return evals;
  }, [patient, orderItem, parameters, formValues]);

  const handleValueChange = (parameterId: number, value: string) => {
    setFormValues((prev) => ({ ...prev, [parameterId]: { ...prev[parameterId], value } }));
  };

  const handleNotesChange = (parameterId: number, notes: string) => {
    setFormValues((prev) => ({ ...prev, [parameterId]: { ...prev[parameterId], notes } }));
  };

  // Enter moves to the next result box, like a form in a spreadsheet
  const handleResultKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const inputs = Array.from(
      tableRef.current?.querySelectorAll<HTMLInputElement>('input[data-result]') || []
    );
    const idx = inputs.indexOf(e.currentTarget);
    const next = inputs[idx + 1];
    if (next) {
      next.focus();
      next.select();
    }
  };

  const handleSaveDraft = async () => {
    if (!currentOrderItemId) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const resultsToSave = parameters
        .filter((p) => {
          const val = formValues[p.parameter.id]?.value;
          return val !== undefined && val.trim().length > 0;
        })
        .map((p) => ({
          parameterId: p.parameter.id,
          resultValue: formValues[p.parameter.id].value.trim(),
          resultNotes: formValues[p.parameter.id].notes?.trim() || undefined,
        }));

      if (resultsToSave.length === 0) {
        setErrorMessage('Enter at least one result before saving a draft.');
        setIsSaving(false);
        return;
      }

      const res = await window.electronAPI.results.saveDraft({
        orderItemId: currentOrderItemId,
        results: resultsToSave,
      });

      if (res.success) {
        setSuccessMessage('Draft saved.');
        onSaved?.();
        await loadOrderDetails(currentOrderItemId);
      } else {
        setErrorMessage(res.error || 'Could not save the draft.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Something went wrong while saving the draft.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkReviewed = async () => {
    if (!currentOrderItemId) return;
    setIsReviewing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await window.electronAPI.results.markReviewed(currentOrderItemId);
      if (res.success) {
        setSuccessMessage('Entered results marked as reviewed.');
        onSaved?.();
        await loadOrderDetails(currentOrderItemId);
      } else {
        setErrorMessage(res.error || 'Could not mark the results as reviewed.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Something went wrong while marking as reviewed.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleFinalizeReport = async () => {
    if (!orderItem) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const missing = parameters.filter((p) => {
      const val = formValues[p.parameter.id]?.value;
      return !val || !val.trim();
    });

    if (missing.length > 0) {
      setErrorMessage(
        `Can’t finalize yet. ${missing.length} result${missing.length > 1 ? 's are' : ' is'} empty: ${missing
          .map((m) => m.parameter.name)
          .join(', ')}. Save a draft to finish later.`
      );
      return;
    }

    setIsFinalizing(true);
    try {
      const resultsToSave = parameters.map((p) => ({
        parameterId: p.parameter.id,
        resultValue: formValues[p.parameter.id].value.trim(),
        resultNotes: formValues[p.parameter.id].notes?.trim() || undefined,
      }));

      const saveRes = await window.electronAPI.results.saveDraft({
        orderItemId: orderItem.id,
        results: resultsToSave,
      });

      if (!saveRes.success) {
        setErrorMessage(saveRes.error || 'Could not save results before finalizing.');
        setIsFinalizing(false);
        return;
      }

      const finalizeRes = await window.electronAPI.results.finalizeReport({
        visitId: orderItem.visit_id,
        notes: 'Finalized via laboratory accession desk',
      });

      if (finalizeRes.success) {
        setSuccessMessage('Report finalized and locked.');
        onSaved?.();
        await loadOrderDetails();
        if (onFinalized) onFinalized(orderItem.visit_id);
      } else {
        setErrorMessage(finalizeRes.error || 'Could not finalize the report.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Something went wrong while finalizing.');
    } finally {
      setIsFinalizing(false);
    }
  };

  if (!isOpen) return null;

  const ageInfo = patient ? calculateAge(patient.date_of_birth) : null;
  const filledCount = parameters.filter((p) => (formValues[p.parameter.id]?.value || '').trim()).length;
  const th = 'px-3 py-2.5 text-left font-semibold text-[#1F2937] border-r border-[#E2E8F0] last:border-r-0';
  const td = 'px-3 py-2 align-top border-r border-[#E2E8F0] last:border-r-0';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Enter test results"
    >
      <div className="bg-white rounded-lg border border-[#E2E8F0] w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-[#1F2937]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6 truncate">
              {orderItem?.test_name_snapshot || 'Enter results'}
            </h2>
            <p className="text-[13px] text-[#64748B]">
              {orderItem?.test_code_snapshot ? `${orderItem.test_code_snapshot} · ` : ''}
              Order item {currentOrderItemId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 hover:text-[#1F2937] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Other tests in this visit */}
        {visitTests && visitTests.length > 1 && (
          <div className="px-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-end gap-1 overflow-x-auto shrink-0">
            {visitTests.map((t) => {
              const selected = t.orderItemId === currentOrderItemId;
              const complete = t.parametersTotal > 0 && t.parametersEntered === t.parametersTotal;
              return (
                <button
                  key={t.orderItemId}
                  type="button"
                  onClick={() => handleSwitchTest(t.orderItemId)}
                  aria-current={selected ? 'true' : undefined}
                  className={`px-3 py-2 text-[13px] whitespace-nowrap border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F766E] ${
                    selected
                      ? 'border-[#0F766E] text-[#0F766E] font-semibold bg-white'
                      : 'border-transparent text-[#64748B] hover:text-[#1F2937]'
                  }`}
                >
                  {t.testName}
                  <span
                    className={`ml-2 text-xs tabular-nums ${
                      complete ? 'text-[#15803D]' : 'text-[#64748B]'
                    }`}
                  >
                    {t.parametersEntered}/{t.parametersTotal}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Patient line */}
        {patient && orderItem && (
          <div className="px-5 py-2.5 border-b border-[#E2E8F0] flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] shrink-0">
            <span>
              <span className="font-semibold">{patient.full_name}</span>
              <span className="text-[#64748B]"> · {patient.patient_mrn}</span>
            </span>
            <span className="text-[#64748B] capitalize">
              {ageInfo ? ageInfo.formatted : 'Age not recorded'}, {patient.gender}
            </span>
            <span className="text-[#64748B]">
              {orderItem.visit_id ? `Visit ${orderItem.visit_id}, ` : ''}
              {formatDateTime(orderItem.created_at)}
            </span>
            <span
              className={`sm:ml-auto font-medium ${
                isOrderFinalized ? 'text-[#15803D]' : 'text-[#64748B]'
              }`}
            >
              {isOrderFinalized ? 'Finalized' : 'Draft'}
            </span>
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3 bg-[#F5F7FA]">
          {errorMessage && <Alert type="error">{errorMessage}</Alert>}
          {successMessage && <Alert type="success">{successMessage}</Alert>}

          {isOrderFinalized && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-[13px]">
              <CheckCircle2 className="w-4 h-4 text-[#15803D] mt-0.5 shrink-0" />
              <p>
                <span className="font-semibold">This report is finalized.</span>{' '}
                <span className="text-[#64748B]">
                  Results are locked. Use Amend to correct a value; every amendment is recorded.
                </span>
              </p>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center text-[#64748B] text-[13px]">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#0F766E]" />
              Loading parameters and reference ranges…
            </div>
          ) : parameters.length === 0 ? (
            <div className="py-14 text-center bg-white border border-[#E2E8F0] rounded-lg">
              <p className="font-medium text-[13px]">This test has no parameters</p>
              <p className="text-[13px] text-[#64748B] mt-0.5">
                Add parameters to it in the test catalog, then come back to enter results.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
              <table ref={tableRef} className="w-full text-[13px] border-collapse">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr>
                    <th scope="col" className={`${th} w-[26%]`}>Parameter</th>
                    <th scope="col" className={`${th} w-[26%]`}>Result</th>
                    <th scope="col" className={`${th} w-[20%]`}>Reference range</th>
                    <th scope="col" className={`${th} w-[10%]`}>Flag</th>
                    <th scope="col" className={th}>Note <span className="font-normal text-xs text-[#64748B]">(Optional)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {parameters.map((p) => {
                    const id = p.parameter.id;
                    const evalRes = evaluations[id];
                    const currentVal = formValues[id]?.value || '';
                    const currentNotes = formValues[id]?.notes || '';
                    const hasValue = currentVal.trim().length > 0;
                    const invalid = !!evalRes && !evalRes.isValid && hasValue;
                    const critical = evalRes?.flag === 'critical';
                    const flag = hasValue && evalRes?.flag ? FLAG_LABEL[evalRes.flag] : null;
                    const resultId = p.currentResult?.id;
                    const showNote = openNotes[id] || !!currentNotes;

                    const rule = evalRes?.matchedRangeRule;
                    const ruleHint = rule
                      ? `${rule.gender}, ${Math.round(rule.min_age_days / 365)} to ${Math.round(
                          rule.max_age_days / 365
                        )} years`
                      : undefined;

                    return (
                      <tr
                        key={id}
                        className={`border-b border-[#E2E8F0] last:border-b-0 ${
                          critical ? 'bg-[#FEF2F2]' : ''
                        }`}
                      >
                        <td className={td}>
                          <label htmlFor={`result-${id}`} className="font-medium block pt-1.5">
                            {p.parameter.name}
                          </label>
                        </td>

                        <td className={td}>
                          <div className="flex items-center gap-2">
                            <input
                              id={`result-${id}`}
                              data-result
                              type="text"
                              inputMode={p.parameter.type === 'numeric' ? 'decimal' : 'text'}
                              autoComplete="off"
                              value={currentVal}
                              onChange={(e) => handleValueChange(id, e.target.value)}
                              onKeyDown={handleResultKeyDown}
                              disabled={isOrderFinalized}
                              aria-invalid={invalid}
                              className={`h-8 w-full min-w-0 px-2.5 rounded-lg border text-[13px] tabular-nums focus:outline-none focus:ring-1 ${
                                isOrderFinalized
                                  ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#1F2937] cursor-not-allowed'
                                  : invalid || critical
                                  ? 'bg-white border-[#DC2626] focus:ring-[#DC2626]'
                                  : 'bg-white border-[#CBD5E1] focus:border-[#0F766E] focus:ring-[#0F766E]'
                              }`}
                            />
                            <span className="text-xs text-[#64748B] w-14 shrink-0">
                              {p.parameter.unit || ''}
                            </span>
                          </div>
                          {invalid && (
                            <p className="text-xs text-[#DC2626] mt-1">{evalRes?.validationError}</p>
                          )}
                        </td>

                        <td className={`${td} text-[#64748B]`} title={ruleHint}>
                          <span className="block pt-1.5">
                            {evalRes?.referenceRangeDisplay || (p.ranges && p.ranges.length > 0 ? p.ranges[0].display_text : 'Not configured')}
                          </span>
                        </td>

                        <td className={td}>
                          <span className={`block pt-1.5 ${flag ? flag.cls : 'text-[#64748B]'}`}>
                            {flag ? flag.text : '—'}
                          </span>
                        </td>

                        <td className={td}>
                          {isOrderFinalized ? (
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-[#64748B] pt-1.5">{currentNotes || '—'}</span>
                              {resultId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs shrink-0"
                                  onClick={() => setAmendingResultId(resultId)}
                                >
                                  Amend
                                </Button>
                              )}
                            </div>
                          ) : showNote ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={currentNotes}
                                onChange={(e) => handleNotesChange(id, e.target.value)}
                                placeholder="Note (optional)"
                                aria-label={`Note (optional) for ${p.parameter.name}`}
                                className="h-8 w-full px-2.5 rounded-lg border border-[#CBD5E1] bg-white text-[13px] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
                              />
                              {!currentNotes && (
                                <button
                                  type="button"
                                  onClick={() => setOpenNotes((prev) => ({ ...prev, [id]: false }))}
                                  className="text-xs text-[#64748B] hover:text-[#1F2937] p-1"
                                  title="Hide note input"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOpenNotes((prev) => ({ ...prev, [id]: true }))}
                              className="text-xs text-[#0F766E] hover:text-[#115E59] hover:underline pt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded"
                            >
                              Add note (optional)
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className="text-[13px] text-[#64748B] tabular-nums">
            {parameters.length > 0 && !isLoading
              ? `${filledCount} of ${parameters.length} results entered`
              : ' '}
            {!isOrderFinalized && parameters.length > 0 && !isLoading && (
              <span className="ml-3 text-xs">Press Enter to move to the next result</span>
            )}
          </p>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>

            {!isOrderFinalized && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDraft}
                  isLoading={isSaving}
                  disabled={isLoading || parameters.length === 0}
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  Save draft
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkReviewed}
                  isLoading={isReviewing}
                  disabled={isLoading || parameters.length === 0}
                >
                  Mark reviewed
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleFinalizeReport}
                  isLoading={isFinalizing}
                  disabled={isLoading || parameters.length === 0}
                  className="bg-[#0F766E] hover:bg-[#115E59]"
                >
                  <FileCheck2 className="w-3.5 h-3.5 mr-1.5" />
                  Finalize report
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <ResultAmendmentModal
        resultId={amendingResultId}
        isOpen={!!amendingResultId}
        onClose={() => setAmendingResultId(null)}
        onSuccess={async () => {
          setSuccessMessage('Amendment recorded.');
          await loadOrderDetails();
          onSaved?.();
        }}
      />
    </div>
  );
};