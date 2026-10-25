import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatDateTime, calculateAge } from '../../lib/utils';
import { RangeMatcher, ParameterRangeRule, EvaluationResult } from '../../../electron/services/range-matcher';
import { OrderItem, Patient, TestResult } from '../../types';
import { ResultAmendmentModal } from './ResultAmendmentModal';
import { X, Save, CheckCircle2, FileCheck2, Loader2, AlertCircle } from 'lucide-react';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, page #F5F7FA, surface #FFFFFF,
 *   text #1F2937, muted #64748B, border #E2E8F0 (inputs #CBD5E1),
 *   warning #D97706, error #DC2626, success #15803D. Radius 8px, no decorative shadows.
 *
 * All tests of a visit are shown one below the other on a single scrolling page.
 * Results are saved per test, and the report is finalized once for the whole visit.
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

interface TestSection {
  orderItem: OrderItem;
  parameters: ParameterDetail[];
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
  /** No longer used: every test of the visit is shown on the same page. Kept so existing callers still compile. */
  onSelectTest?: (orderItemId: number) => void;
}

const FLAG_LABEL: Record<string, { text: string; cls: string }> = {
  normal: { text: 'Normal', cls: 'text-[#15803D]' },
  low: { text: 'Low', cls: 'text-[#D97706] font-semibold' },
  high: { text: 'High', cls: 'text-[#D97706] font-semibold' },
  critical: { text: 'Critical', cls: 'text-[#DC2626] font-semibold' },
};

const secondaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-[#0F766E] text-[13px] font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 ' +
  'disabled:bg-[#94A3B8] disabled:cursor-not-allowed';

const th = 'px-3 py-2.5 text-left text-xs font-medium text-[#64748B] border-r border-[#E2E8F0] last:border-r-0';
const td = 'px-3 py-2 align-top border-r border-[#E2E8F0] last:border-r-0';

const Notice: React.FC<{ tone: 'error' | 'success'; children: React.ReactNode }> = ({ tone, children }) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={`flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 bg-white px-4 py-3 ${
      tone === 'error' ? 'border-l-[#DC2626]' : 'border-l-[#15803D]'
    }`}
  >
    {tone === 'error' ? (
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" />
    ) : (
      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#15803D]" />
    )}
    <p className="text-[13px]">{children}</p>
  </div>
);

export const ResultEntryModal: React.FC<ResultEntryModalProps> = ({
  orderItemId,
  visitTests,
  isOpen,
  onClose,
  onSaved,
  onFinalized,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const isSubmitting = isSaving || isFinalizing;

  const [sections, setSections] = useState<TestSection[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);

  // Parameter ids are unique, so one map holds the values for every test on the page
  const [formValues, setFormValues] = useState<Record<number, { value: string; notes: string }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [amendingResultId, setAmendingResultId] = useState<number | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);

  // Every test of the visit, or just the one that was opened
  const testIds = useMemo<number[]>(() => {
    if (visitTests && visitTests.length > 0) return visitTests.map((t) => t.orderItemId);
    return orderItemId ? [orderItemId] : [];
  }, [visitTests, orderItemId]);
  // A string key keeps the effect below from reloading when the parent passes a new array with the same tests
  const testIdsKey = testIds.join(',');

  const loadAll = async (ids: number[]) => {
    if (ids.length === 0) return;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const responses = await Promise.all(ids.map((id) => window.electronAPI.results.getForOrderItem(id)));

      const loaded: TestSection[] = [];
      const initialForm: Record<number, { value: string; notes: string }> = {};
      let firstPatient: Patient | null = null;
      let firstError: string | null = null;

      for (const res of responses) {
        if (res.success && res.data) {
          loaded.push({ orderItem: res.data.orderItem, parameters: res.data.parameters });
          if (!firstPatient) firstPatient = res.data.patient;
          for (const p of res.data.parameters) {
            initialForm[p.parameter.id] = {
              value: p.currentResult?.result_value || '',
              notes: p.currentResult?.result_notes || '',
            };
          }
        } else if (!firstError) {
          firstError = res.error || 'Could not load the test parameters.';
        }
      }

      setSections(loaded);
      setPatient(firstPatient);
      setFormValues(initialForm);
      if (firstError) setErrorMessage(firstError);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not reach the laboratory database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && testIds.length > 0) {
      loadAll(testIds);
    } else if (!isOpen) {
      setSections([]);
      setPatient(null);
      setFormValues({});
      setErrorMessage(null);
      setSuccessMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, testIdsKey]);

  const allFinalized = sections.length > 0 && sections.every((s) => s.orderItem.status === 'completed');
  const visitId = sections[0]?.orderItem.visit_id;
  const totalParameters = sections.reduce((sum, s) => sum + s.parameters.length, 0);
  const totalFilled = sections.reduce(
    (sum, s) => sum + s.parameters.filter((p) => (formValues[p.parameter.id]?.value || '').trim()).length,
    0
  );

  // Scroll to the test that was clicked and put the cursor in its first empty result box
  useEffect(() => {
    if (isLoading || sections.length === 0) return;
    const root = bodyRef.current;
    if (!root) return;

    const target =
      (orderItemId && root.querySelector<HTMLElement>(`[data-section="${orderItemId}"]`)) ||
      root.querySelector<HTMLElement>('[data-section]');
    if (!target) return;

    target.scrollIntoView({ block: 'start' });
    if (allFinalized) return;

    const inputs = Array.from(target.querySelectorAll<HTMLInputElement>('input[data-result]'));
    const firstEmpty = inputs.find((i) => !i.value) || inputs[0];
    firstEmpty?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, sections.length, testIdsKey]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !amendingResultId) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, amendingResultId]);

  const evaluations = useMemo(() => {
    const evals: Record<number, EvaluationResult> = {};
    if (!patient) return evals;
    for (const section of sections) {
      for (const p of section.parameters) {
        const val = formValues[p.parameter.id]?.value || '';
        evals[p.parameter.id] = RangeMatcher.evaluateResult(
          val,
          p.parameter.type,
          p.parameter.unit,
          p.ranges,
          {
            gender: patient.gender,
            dateOfBirth: patient.date_of_birth,
            orderDate: section.orderItem.created_at,
          }
        );
      }
    }
    return evals;
  }, [patient, sections, formValues]);

  const handleValueChange = (parameterId: number, value: string) => {
    setFormValues((prev) => ({ ...prev, [parameterId]: { ...prev[parameterId], value } }));
  };

  const handleNotesChange = (parameterId: number, notes: string) => {
    setFormValues((prev) => ({ ...prev, [parameterId]: { ...prev[parameterId], notes } }));
  };

  // Enter moves to the next result box, continuing into the next test on the page
  const handleResultKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const inputs = Array.from(bodyRef.current?.querySelectorAll<HTMLInputElement>('input[data-result]') || []);
    const idx = inputs.indexOf(e.currentTarget);
    const next = inputs[idx + 1];
    if (next) {
      next.focus();
      next.select();
    }
  };

  // The results that have a value, for one test
  const collectResults = (section: TestSection) =>
    section.parameters
      .filter((p) => {
        const val = formValues[p.parameter.id]?.value;
        return val !== undefined && val.trim().length > 0;
      })
      .map((p) => ({
        parameterId: p.parameter.id,
        resultValue: formValues[p.parameter.id].value.trim(),
        resultNotes: formValues[p.parameter.id].notes?.trim() || undefined,
      }));

  const handleSaveDraft = async () => {
    if (sections.length === 0) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const toSave = sections
        .map((s) => ({ orderItemId: s.orderItem.id, results: collectResults(s) }))
        .filter((s) => s.results.length > 0);

      if (toSave.length === 0) {
        setErrorMessage('Enter at least one result before saving a draft.');
        setIsSaving(false);
        return;
      }

      for (const item of toSave) {
        const res = await window.electronAPI.results.saveDraft(item);
        if (!res.success) {
          setErrorMessage(res.error || 'Could not save the draft.');
          setIsSaving(false);
          return;
        }
      }

      setSuccessMessage(toSave.length > 1 ? `Draft saved for ${toSave.length} tests.` : 'Draft saved.');
      onSaved?.();
      await loadAll(testIds);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Something went wrong while saving the draft.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalizeReport = async () => {
    if (sections.length === 0 || !visitId) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFinalizing(true);

    try {
      // Save every test first, then finalize the visit once
      for (const s of sections) {
        const saveRes = await window.electronAPI.results.saveDraft({
          orderItemId: s.orderItem.id,
          results: collectResults(s),
        });
        if (!saveRes.success) {
          setErrorMessage(
            `${saveRes.error || 'Could not save results before finalizing.'} (${s.orderItem.test_name_snapshot})`
          );
          setIsFinalizing(false);
          return;
        }
      }

      const finalizeRes = await window.electronAPI.results.finalizeReport({
        visitId,
        notes: allFinalized ? 'Updated report' : 'Finalized via laboratory accession desk',
      });

      if (finalizeRes.success) {
        setSuccessMessage(allFinalized ? 'Report updated.' : 'Report finalized.');
        onSaved?.();
        await loadAll(testIds);
        if (onFinalized) onFinalized(visitId);
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
  const multiple = sections.length > 1;
  const firstItem = sections[0]?.orderItem;

  const renderTable = (section: TestSection) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
          <tr>
            <th scope="col" className={`${th} w-[26%]`}>Parameter</th>
            <th scope="col" className={`${th} w-[26%]`}>Result</th>
            <th scope="col" className={`${th} w-[20%]`}>Reference range</th>
            <th scope="col" className={`${th} w-[10%]`}>Flag</th>
            <th scope="col" className={th}>
              Note <span className="font-normal text-[#64748B]">(optional)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {section.parameters.map((p) => {
            const id = p.parameter.id;
            const evalRes = evaluations[id];
            const currentVal = formValues[id]?.value || '';
            const currentNotes = formValues[id]?.notes || '';
            const hasValue = currentVal.trim().length > 0;
            const invalid = !!evalRes && !evalRes.isValid && hasValue;
            const critical = evalRes?.flag === 'critical';
            const flag = hasValue && evalRes?.flag ? FLAG_LABEL[evalRes.flag] : null;

            const rule = evalRes?.matchedRangeRule;
            const ruleHint = rule
              ? `${rule.gender}, ${Math.round(rule.min_age_days / 365)} to ${Math.round(rule.max_age_days / 365)} years`
              : undefined;

            return (
              <tr
                key={id}
                className={`border-b border-[#E2E8F0] last:border-b-0 ${critical ? 'bg-[#FEF2F2]' : ''}`}
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
                      disabled={isSubmitting}
                      aria-invalid={invalid}
                      className={`h-8 w-full min-w-0 px-2.5 rounded-md border bg-white text-[13px] tabular-nums focus:outline-none focus:ring-1 ${
                        invalid || critical
                          ? 'border-[#DC2626] focus:ring-[#DC2626]'
                          : 'border-[#CBD5E1] focus:border-[#0F766E] focus:ring-[#0F766E]'
                      }`}
                    />
                    <span className="text-xs text-[#64748B] w-14 shrink-0">{p.parameter.unit || ''}</span>
                  </div>
                  {invalid && <p className="text-xs text-[#DC2626] mt-1">{evalRes?.validationError}</p>}
                </td>

                <td className={`${td} text-[#64748B]`} title={ruleHint}>
                  <span className="block pt-1.5">
                    {evalRes?.referenceRangeDisplay ||
                      (p.ranges && p.ranges.length > 0 ? p.ranges[0].display_text : 'Not configured')}
                  </span>
                </td>

                <td className={td}>
                  <span className={`block pt-1.5 ${flag ? flag.cls : 'text-[#64748B]'}`}>
                    {flag ? flag.text : '–'}
                  </span>
                </td>

                <td className={td}>
                  <input
                    type="text"
                    value={currentNotes}
                    onChange={(e) => handleNotesChange(id, e.target.value)}
                    placeholder="Note"
                    aria-label={`Note for ${p.parameter.name}`}
                    className="h-8 w-full min-w-0 px-2.5 rounded-md border border-[#CBD5E1] text-[13px] bg-white text-[#1F2937] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-[#111827]/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Enter test results"
    >
      <div className="bg-white rounded-lg border border-[#E2E8F0] w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-[#1F2937]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6 truncate">
              {multiple ? 'Enter results' : firstItem?.test_name_snapshot || 'Enter results'}
            </h2>
            <p className="text-[13px] text-[#64748B] truncate">
              {multiple
                ? `${sections.length} tests: ${sections.map((s) => s.orderItem.test_code_snapshot).join(', ')}`
                : firstItem?.test_code_snapshot || ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1F2937] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Patient line, shown once for the whole visit */}
        {patient && firstItem && (
          <div className="px-5 py-2.5 border-b border-[#E2E8F0] flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] shrink-0">
            <span>
              <span className="font-semibold">{patient.full_name}</span>
              <span className="text-[#64748B]">, {patient.patient_mrn}</span>
            </span>
            <span className="text-[#64748B] capitalize">
              {ageInfo ? ageInfo.formatted : 'Age not recorded'}, {patient.gender}
            </span>
            <span className="text-[#64748B]">
              {firstItem.visit_id ? `Visit ${firstItem.visit_id}, ` : ''}
              {formatDateTime(firstItem.created_at)}
            </span>
            <span className={`sm:ml-auto font-medium ${allFinalized ? 'text-[#15803D]' : 'text-[#64748B]'}`}>
              {allFinalized ? 'Finalized' : 'Draft'}
            </span>
          </div>
        )}

        {/* Body: every test on one page */}
        <div ref={bodyRef} className="px-5 py-4 overflow-y-auto flex-1 space-y-4 bg-[#F5F7FA]">
          {errorMessage && <Notice tone="error">{errorMessage}</Notice>}
          {successMessage && <Notice tone="success">{successMessage}</Notice>}

          {allFinalized && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-white border border-[#E2E8F0] border-l-4 border-l-[#15803D] rounded-lg text-[13px]">
              <CheckCircle2 className="w-4 h-4 text-[#15803D] mt-0.5 shrink-0" />
              <p>
                <span className="font-semibold">This report is finalized.</span>{' '}
                <span className="text-[#64748B]">
                  You can still edit results or notes, then choose Update finalized report to save the changes with
                  the current date and time.
                </span>
              </p>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center text-[#64748B] text-[13px]">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#0F766E]" />
              Loading parameters and reference ranges…
            </div>
          ) : sections.length === 0 ? (
            <div className="py-14 text-center bg-white border border-[#E2E8F0] rounded-lg">
              <p className="font-medium text-[13px]">Nothing to show</p>
              <p className="text-[13px] text-[#64748B] mt-0.5">The tests for this visit could not be loaded.</p>
            </div>
          ) : (
            sections.map((section) => {
              const filled = section.parameters.filter((p) =>
                (formValues[p.parameter.id]?.value || '').trim()
              ).length;
              const done = section.orderItem.status === 'completed';

              return (
                <section
                  key={section.orderItem.id}
                  data-section={section.orderItem.id}
                  className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden scroll-mt-2"
                >
                  {multiple && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[#E2E8F0]">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{section.orderItem.test_name_snapshot}</h3>
                        <p className="text-xs text-[#64748B]">{section.orderItem.test_code_snapshot}</p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-[13px]">
                        <span className="text-[#64748B] tabular-nums">
                          {filled} of {section.parameters.length} entered
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${done ? 'bg-[#15803D]' : 'bg-[#94A3B8]'}`}
                            aria-hidden="true"
                          />
                          {done ? 'Finalized' : 'Draft'}
                        </span>
                      </div>
                    </div>
                  )}

                  {section.parameters.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="font-medium text-[13px]">This test has no parameters</p>
                      <p className="text-[13px] text-[#64748B] mt-0.5">
                        Add parameters to it in the test catalog, then come back to enter results.
                      </p>
                    </div>
                  ) : (
                    renderTable(section)
                  )}
                </section>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className="text-[13px] text-[#64748B] tabular-nums">
            {totalParameters > 0 && !isLoading
              ? `${totalFilled} of ${totalParameters} results entered${multiple ? ` across ${sections.length} tests` : ''}`
              : ' '}
            {!allFinalized && totalParameters > 0 && !isLoading && (
              <span className="ml-3 text-xs">Press Enter to move to the next result</span>
            )}
          </p>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>
              Close
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isLoading || isSubmitting || totalParameters === 0}
              className={secondaryBtn}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4 text-[#64748B]" />
              )}
              Save draft
            </button>

            <button
              type="button"
              onClick={handleFinalizeReport}
              disabled={isLoading || isSubmitting || totalParameters === 0}
              className={primaryBtn}
            >
              {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
              {allFinalized ? 'Update finalized report' : 'Finalize report'}
            </button>
          </div>
        </div>
      </div>

      <ResultAmendmentModal
        resultId={amendingResultId}
        isOpen={!!amendingResultId}
        onClose={() => setAmendingResultId(null)}
        onSuccess={async () => {
          setSuccessMessage('Amendment recorded.');
          await loadAll(testIds);
          onSaved?.();
        }}
      />
    </div>
  );
};