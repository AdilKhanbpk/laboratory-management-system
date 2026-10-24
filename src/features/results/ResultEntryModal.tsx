import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Alert } from '../../components/common/Alert';
import { formatDateTime, calculateAge } from '../../lib/utils';
import { RangeMatcher, ParameterRangeRule, EvaluationResult } from '../../../electron/services/range-matcher';
import { OrderItem, Patient, TestResult } from '../../types';
import { ResultAmendmentModal } from './ResultAmendmentModal';
import {
  X,
  Save,
  CheckCircle2,
  FileCheck2,
  AlertTriangle,
  Edit3,
  User,
  Calendar,
  Clock,
  Loader2,
} from 'lucide-react';

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

interface ResultEntryModalProps {
  orderItemId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onFinalized?: (visitId: number) => void;
}

export const ResultEntryModal: React.FC<ResultEntryModalProps> = ({
  orderItemId,
  isOpen,
  onClose,
  onSaved,
  onFinalized,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const [orderItem, setOrderItem] = useState<OrderItem | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [parameters, setParameters] = useState<ParameterDetail[]>([]);

  // Local form state: parameterId -> { value: string, notes: string }
  const [formValues, setFormValues] = useState<Record<number, { value: string; notes: string }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Amendment modal state
  const [amendingResultId, setAmendingResultId] = useState<number | null>(null);

  // Fetch order item results on open
  const loadOrderDetails = async () => {
    if (!orderItemId) return;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await window.electronAPI.results.getForOrderItem(orderItemId);
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
      } else {
        setErrorMessage(res.error || 'Failed to load test parameters.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error communicating with laboratory database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && orderItemId) {
      loadOrderDetails();
    } else {
      setOrderItem(null);
      setPatient(null);
      setParameters([]);
      setFormValues({});
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, orderItemId]);

  const isOrderFinalized = orderItem?.status === 'completed';

  // Live evaluation of results against reference ranges
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
    setFormValues((prev) => ({
      ...prev,
      [parameterId]: {
        ...prev[parameterId],
        value,
      },
    }));
  };

  const handleNotesChange = (parameterId: number, notes: string) => {
    setFormValues((prev) => ({
      ...prev,
      [parameterId]: {
        ...prev[parameterId],
        notes,
      },
    }));
  };

  const handleSaveDraft = async () => {
    if (!orderItemId) return;
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
        setErrorMessage('Please enter at least one parameter value before saving a draft.');
        setIsSaving(false);
        return;
      }

      const res = await window.electronAPI.results.saveDraft({
        orderItemId,
        results: resultsToSave,
      });

      if (res.success) {
        setSuccessMessage('Draft results saved successfully.');
        onSaved?.();
        await loadOrderDetails();
      } else {
        setErrorMessage(res.error || 'Failed to save draft results.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error occurred while saving draft.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkReviewed = async () => {
    if (!orderItemId) return;
    setIsReviewing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await window.electronAPI.results.markReviewed(orderItemId);
      if (res.success) {
        setSuccessMessage('All entered parameters marked as reviewed.');
        onSaved?.();
        await loadOrderDetails();
      } else {
        setErrorMessage(res.error || 'Failed to mark results as reviewed.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error marking results as reviewed.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleFinalizeReport = async () => {
    if (!orderItem) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    // Verify all active parameters are filled
    const missing = parameters.filter((p) => {
      const val = formValues[p.parameter.id]?.value;
      return !val || !val.trim();
    });

    if (missing.length > 0) {
      setErrorMessage(
        `Cannot finalize report: ${missing.length} parameter(s) (${missing.map((m) => m.parameter.name).join(', ')}) have no entered value. Save as draft instead.`
      );
      return;
    }

    // Save any pending values first
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
        setErrorMessage(saveRes.error || 'Failed to update results prior to finalization.');
        setIsFinalizing(false);
        return;
      }

      // Finalize report
      const finalizeRes = await window.electronAPI.results.finalizeReport({
        visitId: orderItem.visit_id,
        notes: 'Finalized via laboratory accession desk',
      });

      if (finalizeRes.success) {
        setSuccessMessage('Laboratory report finalized and locked successfully.');
        onSaved?.();
        await loadOrderDetails();
        if (onFinalized) {
          onFinalized(orderItem.visit_id);
        }
      } else {
        setErrorMessage(finalizeRes.error || 'Failed to finalize laboratory report.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error occurred during report finalization.');
    } finally {
      setIsFinalizing(false);
    }
  };

  if (!isOpen) return null;

  const ageInfo = patient ? calculateAge(patient.date_of_birth) : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full overflow-hidden flex flex-col my-auto max-h-[94vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center border border-brand-500/30">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {orderItem?.test_name_snapshot || 'Specimen Result Entry'}
              </h2>
              <p className="text-xs text-slate-400">
                Test Code: <span className="font-mono text-slate-300">{orderItem?.test_code_snapshot || '—'}</span> • Order Item #{orderItemId}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Demographics Strip */}
        {patient && orderItem && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs shrink-0">
            <div>
              <span className="text-slate-500 block">Patient Name & MRN</span>
              <span className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {patient.full_name} ({patient.patient_mrn})
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Age & Biological Sex</span>
              <span className="font-semibold text-slate-800 capitalize mt-0.5 block">
                {ageInfo ? ageInfo.formatted : 'Age unrecorded'} • {patient.gender}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Visit Number & Date</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {orderItem.visit_id ? `Visit #${orderItem.visit_id}` : '—'} • {formatDateTime(orderItem.created_at)}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Status & Locking</span>
              <div className="mt-0.5">
                {isOrderFinalized ? (
                  <Badge variant="success">Finalized & Locked</Badge>
                ) : (
                  <Badge variant="warning">In Progress / Draft</Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {errorMessage && <Alert type="error">{errorMessage}</Alert>}
          {successMessage && <Alert type="success">{successMessage}</Alert>}

          {isOrderFinalized && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold block">Immutable Finalized Record</span>
                This test order has been validated and finalized. Direct editing is locked. Any corrections require an audited formal clinical amendment.
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-brand-500" />
              <p className="text-sm font-medium">Loading test parameters & reference ranges...</p>
            </div>
          ) : parameters.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
              <p className="text-sm font-semibold text-slate-800">No Parameters Defined</p>
              <p className="text-xs text-slate-500 mt-1">
                This test catalog entry does not have any active clinical parameters configured.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-4 w-1/4">Parameter & Unit</th>
                    <th className="py-3 px-4 w-1/4">Reference Range (Age/Sex Matched)</th>
                    <th className="py-3 px-4 w-1/4">Observed Value</th>
                    <th className="py-3 px-3 w-28 text-center">Clinical Flag</th>
                    <th className="py-3 px-4">Notes / Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {parameters.map((p) => {
                    const evalRes = evaluations[p.parameter.id];
                    const currentVal = formValues[p.parameter.id]?.value || '';
                    const currentNotes = formValues[p.parameter.id]?.notes || '';
                    const resultId = p.currentResult?.id;

                    return (
                      <tr
                        key={p.parameter.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          evalRes?.flag === 'critical' ? 'bg-rose-50/50' : ''
                        }`}
                      >
                        {/* Parameter Name & Unit */}
                        <td className="py-3.5 px-4 align-top">
                          <span className="font-bold text-slate-900 block">{p.parameter.name}</span>
                          <span className="text-[11px] text-slate-500 font-mono mt-0.5 inline-block">
                            Unit: {p.parameter.unit || 'None'} • Type: {p.parameter.type}
                          </span>
                        </td>

                        {/* Reference Range Display */}
                        <td className="py-3.5 px-4 align-top text-slate-700">
                          <div className="font-medium text-slate-800">
                            {evalRes?.referenceRangeDisplay || 'Unconfigured'}
                          </div>
                          {evalRes?.matchedRangeRule && (
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              Rule: {evalRes.matchedRangeRule.gender} (
                              {Math.round(evalRes.matchedRangeRule.min_age_days / 365)} -{' '}
                              {Math.round(evalRes.matchedRangeRule.max_age_days / 365)} yrs)
                            </span>
                          )}
                        </td>

                        {/* Result Value Input */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="relative">
                            <input
                              type="text"
                              value={currentVal}
                              onChange={(e) => handleValueChange(p.parameter.id, e.target.value)}
                              disabled={isOrderFinalized}
                              placeholder={
                                p.parameter.type === 'numeric' ? '0.00' : 'Enter result...'
                              }
                              className={`w-full px-3 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-2 transition-all ${
                                isOrderFinalized
                                  ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                                  : evalRes && !evalRes.isValid && currentVal
                                  ? 'border-rose-300 ring-rose-200 text-rose-900 bg-rose-50/30'
                                  : evalRes?.flag === 'critical'
                                  ? 'border-rose-400 ring-rose-300 text-rose-900 font-bold bg-rose-50'
                                  : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/20 bg-white text-slate-900'
                              }`}
                            />
                            {p.parameter.unit && (
                              <span className="absolute right-2.5 top-2 text-[10px] font-mono text-slate-400 pointer-events-none">
                                {p.parameter.unit}
                              </span>
                            )}
                          </div>
                          {evalRes && !evalRes.isValid && currentVal && (
                            <span className="text-[10px] text-rose-600 block mt-1 font-medium">
                              {evalRes.validationError}
                            </span>
                          )}
                        </td>

                        {/* Flag Badge */}
                        <td className="py-3.5 px-3 align-top text-center">
                          {currentVal.trim().length === 0 ? (
                            <span className="text-slate-400 text-[11px]">—</span>
                          ) : evalRes?.flag === 'normal' ? (
                            <Badge variant="success">NORMAL</Badge>
                          ) : evalRes?.flag === 'low' ? (
                            <Badge variant="warning">LOW (L)</Badge>
                          ) : evalRes?.flag === 'high' ? (
                            <Badge variant="warning">HIGH (H)</Badge>
                          ) : evalRes?.flag === 'critical' ? (
                            <Badge variant="danger" className="animate-pulse font-bold">
                              CRITICAL *
                            </Badge>
                          ) : (
                            <Badge variant="outline">—</Badge>
                          )}
                        </td>

                        {/* Notes / Amendments */}
                        <td className="py-3.5 px-4 align-top">
                          {!isOrderFinalized ? (
                            <input
                              type="text"
                              value={currentNotes}
                              onChange={(e) => handleNotesChange(p.parameter.id, e.target.value)}
                              placeholder="Clinical note (optional)..."
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-slate-600 text-xs truncate max-w-[150px]">
                                {currentNotes || 'No notes recorded'}
                              </span>
                              {resultId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-[11px] px-2 py-1 h-7 border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0"
                                  onClick={() => setAmendingResultId(resultId)}
                                >
                                  <Edit3 className="w-3 h-3 mr-1" />
                                  Amend
                                </Button>
                              )}
                            </div>
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

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Values are strictly verified against validated reference ranges.</span>
          </div>

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
                  Save Draft
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkReviewed}
                  isLoading={isReviewing}
                  disabled={isLoading || parameters.length === 0}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-sky-500" />
                  Mark Reviewed
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleFinalizeReport}
                  isLoading={isFinalizing}
                  disabled={isLoading || parameters.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <FileCheck2 className="w-3.5 h-3.5 mr-1.5" />
                  Finalize Report
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Clinical Amendment Modal for Finalized Results */}
      <ResultAmendmentModal
        resultId={amendingResultId}
        isOpen={!!amendingResultId}
        onClose={() => setAmendingResultId(null)}
        onSuccess={async () => {
          setSuccessMessage('Formal amendment recorded successfully.');
          await loadOrderDetails();
          onSaved?.();
        }}
      />
    </div>
  );
};
