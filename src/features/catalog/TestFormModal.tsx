import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, Control, UseFormRegister, UseFormSetValue, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTestSchema, CreateTestInput, LabTest } from '../../types';
import { parseCurrencyToPaisa } from '../../lib/utils';
import { Plus, Trash2, X, AlertCircle, Loader2 } from 'lucide-react';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, surface #FFFFFF, subtle surface #F8FAFC,
 *   text #1F2937, muted #64748B, border #E2E8F0 (inputs #CBD5E1),
 *   warning #D97706 (critical limits only), error #DC2626.
 */

interface TestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (test: LabTest) => void;
  testToEdit?: LabTest | null;
}

const DEFAULT_CATEGORIES = [
  'Biochemistry',
  'Hematology',
  'Clinical Pathology',
  'Serology & Immunology',
  'Microbiology',
  'Endocrinology',
  'Urinalysis',
  'Molecular Pathology',
  'General',
];

const inputClass =
  'block w-full h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

const criticalInputClass =
  'block w-full h-9 px-3 rounded-md border border-[#D97706]/50 bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#D97706] focus:ring-1 focus:ring-[#D97706]';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-[#0F766E] text-[13px] font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 ' +
  'disabled:bg-[#94A3B8] disabled:cursor-not-allowed';

const secondaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

const linkBtn =
  'inline-flex items-center gap-1 text-[13px] font-medium text-[#0F766E] hover:text-[#115E59] hover:underline ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded';

const emptyRange = () => ({
  gender: 'all' as const,
  min_age_days: 0,
  max_age_days: 47450,
  normal_low: null,
  normal_high: null,
  panic_low: null,
  panic_high: null,
  display_text: '',
});

const Label: React.FC<{ htmlFor: string; required?: boolean; optional?: boolean; children: React.ReactNode }> = ({
  htmlFor,
  required,
  optional,
  children,
}) => (
  <label htmlFor={htmlFor} className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
    {children}
    {required && <span className="text-[#DC2626] ml-0.5">*</span>}
    {optional && <span className="text-[#64748B] font-normal ml-1">(optional)</span>}
  </label>
);

/**
 * Manages multiple reference ranges per parameter:
 * gender-specific ranges, no hardcoded default range, and numeric vs text results.
 */
interface ParameterRangesEditorProps {
  control: Control<CreateTestInput>;
  paramIndex: number;
  register: UseFormRegister<CreateTestInput>;
  setValue: UseFormSetValue<CreateTestInput>;
  errors?: any;
}

const RangeItemRow: React.FC<{
  rIdx: number;
  paramIndex: number;
  paramType: string;
  unit: string;
  register: UseFormRegister<CreateTestInput>;
  control: Control<CreateTestInput>;
  setValue: UseFormSetValue<CreateTestInput>;
  remove: (index: number) => void;
  canRemove: boolean;
}> = ({
  rIdx,
  paramIndex,
  paramType,
  unit,
  register,
  control,
  setValue,
  remove,
  canRemove,
}) => {
  const minAge = useWatch({
    control,
    name: `parameters.${paramIndex}.ranges.${rIdx}.min_age_days` as const,
  });
  const maxAge = useWatch({
    control,
    name: `parameters.${paramIndex}.ranges.${rIdx}.max_age_days` as const,
  });

  let currentAgeCategory = 'all';
  if (minAge != null && minAge >= 6000) {
    currentAgeCategory = 'adult';
  } else if (maxAge != null && maxAge <= 365) {
    currentAgeCategory = 'infant';
  } else if (maxAge != null && maxAge < 6600 && (!minAge || minAge < 365)) {
    currentAgeCategory = 'child';
  }

  const handleAgeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cat = e.target.value;
    if (cat === 'adult') {
      setValue(`parameters.${paramIndex}.ranges.${rIdx}.min_age_days` as const, 6575);
      setValue(`parameters.${paramIndex}.ranges.${rIdx}.max_age_days` as const, 47450);
    } else if (cat === 'child') {
      setValue(`parameters.${paramIndex}.ranges.${rIdx}.min_age_days` as const, 0);
      setValue(`parameters.${paramIndex}.ranges.${rIdx}.max_age_days` as const, 6574);
    } else if (cat === 'infant') {
      setValue(`parameters.${paramIndex}.ranges.${rIdx}.min_age_days` as const, 0);
      setValue(`parameters.${paramIndex}.ranges.${rIdx}.max_age_days` as const, 365);
    } else {
      setValue(`parameters.${paramIndex}.ranges.${rIdx}.min_age_days` as const, 0);
      setValue(`parameters.${paramIndex}.ranges.${rIdx}.max_age_days` as const, 47450);
    }
  };

  const id = (name: string) => `p${paramIndex}-r${rIdx}-${name}`;

  return (
    <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-4">
      {/* Hidden inputs to guarantee min_age_days & max_age_days persist */}
      <input
        type="hidden"
        {...register(`parameters.${paramIndex}.ranges.${rIdx}.min_age_days` as const, { valueAsNumber: true })}
      />
      <input
        type="hidden"
        {...register(`parameters.${paramIndex}.ranges.${rIdx}.max_age_days` as const, { valueAsNumber: true })}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold text-[#1F2937]">Range {rIdx + 1}</span>

          {/* Gender Selector: Male / Female / All */}
          <div className="flex items-center gap-1.5">
            <label htmlFor={id('gender')} className="text-xs font-medium text-[#64748B]">
              Gender:
            </label>
            <select
              id={id('gender')}
              {...register(`parameters.${paramIndex}.ranges.${rIdx}.gender` as const)}
              className={`${inputClass} !h-8 !w-auto text-xs`}
            >
              <option value="all">All genders</option>
              <option value="male">Male (M)</option>
              <option value="female">Female (F)</option>
            </select>
          </div>

          {/* Age Group Selector: Adult / Child / Infant / All Ages */}
          <div className="flex items-center gap-1.5">
            <label htmlFor={id('age')} className="text-xs font-medium text-[#64748B]">
              Age:
            </label>
            <select
              id={id('age')}
              value={currentAgeCategory}
              onChange={handleAgeChange}
              className={`${inputClass} !h-8 !w-auto text-xs`}
            >
              <option value="all">All Ages</option>
              <option value="adult">Adult (Ad. ≥ 18 yrs)</option>
              <option value="child">Child (Ch. &lt; 18 yrs)</option>
              <option value="infant">Infant (&lt; 1 yr)</option>
            </select>
          </div>
        </div>

        {canRemove && (
          <button
            type="button"
            onClick={() => remove(rIdx)}
            title="Remove this range"
            aria-label={`Remove range ${rIdx + 1}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#DC2626] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {paramType === 'numeric' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label htmlFor={id('nl')}>Normal low{unit ? ` (${unit})` : ''}</Label>
              <input
                id={id('nl')}
                type="number"
                step="any"
                placeholder="13.5"
                {...register(`parameters.${paramIndex}.ranges.${rIdx}.normal_low` as const, {
                  valueAsNumber: true,
                })}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <Label htmlFor={id('nh')}>Normal high{unit ? ` (${unit})` : ''}</Label>
              <input
                id={id('nh')}
                type="number"
                step="any"
                placeholder="17.5"
                {...register(`parameters.${paramIndex}.ranges.${rIdx}.normal_high` as const, {
                  valueAsNumber: true,
                })}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <Label htmlFor={id('pl')}>Critical low</Label>
              <input
                id={id('pl')}
                type="number"
                step="any"
                placeholder="7.0"
                {...register(`parameters.${paramIndex}.ranges.${rIdx}.panic_low` as const, {
                  valueAsNumber: true,
                })}
                className={`${criticalInputClass} tabular-nums`}
              />
            </div>

            <div>
              <Label htmlFor={id('ph')}>Critical high</Label>
              <input
                id={id('ph')}
                type="number"
                step="any"
                placeholder="20.0"
                {...register(`parameters.${paramIndex}.ranges.${rIdx}.panic_high` as const, {
                  valueAsNumber: true,
                })}
                className={`${criticalInputClass} tabular-nums`}
              />
            </div>
          </div>

          <div>
            <Label htmlFor={id('text')} optional>
              Reference text on report
            </Label>
            <input
              id={id('text')}
              type="text"
              placeholder="e.g. M: 13.0 - 17.0   F: 11.5 - 15.5 (or leave blank to auto-generate)"
              {...register(`parameters.${paramIndex}.ranges.${rIdx}.display_text` as const)}
              className={inputClass}
            />
          </div>
        </div>
      ) : (
        <div>
          <Label htmlFor={id('text')} required>
            Expected normal result
          </Label>
          <input
            id={id('text')}
            type="text"
            placeholder="Negative, Non-reactive, Clear, Normal"
            {...register(`parameters.${paramIndex}.ranges.${rIdx}.display_text` as const)}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-[#64748B]">
            Printed in the reference interval column of the report.
          </p>
        </div>
      )}
    </div>
  );
};

const ParameterRangesEditor: React.FC<ParameterRangesEditorProps> = ({
  control,
  paramIndex,
  register,
  setValue,
}) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `parameters.${paramIndex}.ranges` as const,
  });

  const paramType =
    useWatch({
      control,
      name: `parameters.${paramIndex}.parameter_type` as const,
    }) || 'numeric';

  const unit =
    useWatch({
      control,
      name: `parameters.${paramIndex}.unit` as const,
    }) || '';

  const handleAddRange = () => {
    append(emptyRange());
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-semibold">
          Reference ranges <span className="font-normal text-[#64748B] tabular-nums">({fields.length})</span>
        </h4>
        {fields.length > 0 && (
          <button type="button" onClick={handleAddRange} className={linkBtn}>
            <Plus className="w-3.5 h-3.5" />
            Add range
          </button>
        )}
      </div>

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed border-[#CBD5E1] px-4 py-5 text-center">
          <p className="text-[13px] text-[#64748B]">No reference range set for this parameter.</p>
          <button type="button" onClick={handleAddRange} className={`${secondaryBtn} mt-3`}>
            <Plus className="w-4 h-4" />
            Add reference range
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((rangeField, rIdx) => (
            <RangeItemRow
              key={rangeField.id}
              rIdx={rIdx}
              paramIndex={paramIndex}
              paramType={paramType}
              unit={unit}
              register={register}
              control={control}
              setValue={setValue}
              remove={remove}
              canRemove={fields.length > 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const TestFormModal: React.FC<TestFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  testToEdit,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceInput, setPriceInput] = useState<string>('0.00');

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<CreateTestInput>({
    resolver: zodResolver(CreateTestSchema),
    defaultValues: {
      testCode: '',
      testName: '',
      category: 'Biochemistry',
      description: '',
      pricePaisa: 0,
      sampleType: 'Serum',
      collectionContainer: 'Yellow Top (SST / Gel Activator)',
      patientPreparation: 'Random / No Fasting Required',
      turnaroundTime: 'Same Day (4 - 6 Hours)',
      testMethod: 'Automated Analyzer',
      parameters: [
        {
          parameter_name: '',
          display_order: 1,
          unit: '',
          parameter_type: 'numeric',
          notes: '',
          ranges: [emptyRange()],
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'parameters',
  });

  useEffect(() => {
    if (isOpen) {
      if (testToEdit) {
        setPriceInput((testToEdit.price_paisa / 100).toFixed(2));
        const formattedParams =
          testToEdit.parameters && testToEdit.parameters.length > 0
            ? testToEdit.parameters.map((p, idx) => ({
                parameter_name: p.parameter_name,
                display_order: p.display_order ?? idx + 1,
                unit: p.unit || '',
                parameter_type: p.parameter_type || 'numeric',
                notes: p.notes || '',
                ranges:
                  p.ranges && p.ranges.length > 0
                    ? p.ranges.map((r) => ({
                        gender: r.gender || 'all',
                        min_age_days: r.min_age_days ?? 0,
                        max_age_days: r.max_age_days ?? 47450,
                        normal_low: r.normal_low,
                        normal_high: r.normal_high,
                        panic_low: r.panic_low,
                        panic_high: r.panic_high,
                        display_text: r.display_text || '',
                      }))
                    : [emptyRange()],
              }))
            : [
                {
                  parameter_name: testToEdit.test_name,
                  display_order: 1,
                  unit: '',
                  parameter_type: 'numeric' as const,
                  notes: '',
                  ranges: [emptyRange()],
                },
              ];

        reset({
          testCode: testToEdit.test_code,
          testName: testToEdit.test_name,
          category: testToEdit.category,
          description: testToEdit.description || '',
          pricePaisa: testToEdit.price_paisa,
          sampleType: testToEdit.sample_type || 'Serum',
          collectionContainer: testToEdit.collection_container || 'Yellow Top (SST / Gel Activator)',
          patientPreparation: testToEdit.patient_preparation || 'Random / No Fasting Required',
          turnaroundTime: testToEdit.turnaround_time || 'Same Day (4 - 6 Hours)',
          testMethod: testToEdit.test_method || 'Automated Analyzer',
          parameters: formattedParams as any,
        });
      } else {
        setPriceInput('0.00');
        reset({
          testCode: '',
          testName: '',
          category: 'Biochemistry',
          description: '',
          pricePaisa: 0,
          sampleType: 'Serum',
          collectionContainer: 'Yellow Top (SST / Gel Activator)',
          patientPreparation: 'Random / No Fasting Required',
          turnaroundTime: 'Same Day (4 - 6 Hours)',
          testMethod: 'Automated Analyzer',
          parameters: [
            {
              parameter_name: '',
              display_order: 1,
              unit: '',
              parameter_type: 'numeric',
              notes: '',
              ranges: [emptyRange()],
            },
          ],
        });
      }
      setServerError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, testToEdit, reset]);

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPriceInput(val);
    const paisa = parseCurrencyToPaisa(val);
    setValue('pricePaisa', Math.max(0, paisa), { shouldValidate: true });
  };

  const handleAddParameter = () => {
    append({
      parameter_name: '',
      display_order: fields.length + 1,
      unit: '',
      parameter_type: 'numeric',
      notes: '',
      ranges: [emptyRange()],
    });
  };

  if (!isOpen) return null;

  const handleSafeClose = () => {
    if (isDirty) {
      if (window.confirm('You have unsaved changes in this test configuration. Close anyway?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const onSubmit = async (data: CreateTestInput) => {
    setIsSubmitting(true);
    setServerError(null);

    // Sanitize and auto-generate display_text for ranges if left blank
    const processedParameters = data.parameters.map((param) => {
      const pName = param.parameter_name.trim() || data.testName.trim();
      const unitStr = param.unit ? ` ${param.unit.trim()}` : '';

      const ranges = (param.ranges || []).map((r) => {
        let text = r.display_text ? r.display_text.trim() : '';
        if (!text) {
          if (param.parameter_type === 'numeric') {
            let prefix = '';
            if (r.gender === 'male') prefix = 'M: ';
            else if (r.gender === 'female') prefix = 'F: ';

            if (r.min_age_days != null && r.min_age_days >= 6000) {
              prefix += 'Ad: ';
            } else if (r.max_age_days != null && r.max_age_days < 6600 && r.max_age_days > 365) {
              prefix += 'Ch: ';
            } else if (r.max_age_days != null && r.max_age_days <= 365) {
              prefix += 'Inf: ';
            }

            if (r.normal_low != null && r.normal_high != null) {
              text = `${prefix}${r.normal_low} - ${r.normal_high}${unitStr}`.trim();
            } else if (r.normal_low != null) {
              text = `${prefix}> ${r.normal_low}${unitStr}`.trim();
            } else if (r.normal_high != null) {
              text = `${prefix}< ${r.normal_high}${unitStr}`.trim();
            } else {
              text = 'Standard Reference Range';
            }
          } else {
            text = 'Negative / Normal';
          }
        }

        return {
          ...r,
          display_text: text,
          normal_low: isNaN(r.normal_low as any) ? null : r.normal_low,
          normal_high: isNaN(r.normal_high as any) ? null : r.normal_high,
          panic_low: isNaN(r.panic_low as any) ? null : r.panic_low,
          panic_high: isNaN(r.panic_high as any) ? null : r.panic_high,
        };
      });

      return {
        ...param,
        parameter_name: pName,
        ranges,
      };
    });

    const finalPayload: CreateTestInput = {
      ...data,
      parameters: processedParameters,
    };

    try {
      if (testToEdit) {
        const res = await window.electronAPI.tests.update({
          ...finalPayload,
          id: testToEdit.id,
          isActive: testToEdit.is_active,
        });
        if (!res.success || !res.data) {
          setServerError(res.error || 'Failed to update laboratory test.');
          setIsSubmitting(false);
          return;
        }
        onSuccess(res.data);
      } else {
        const res = await window.electronAPI.tests.create(finalPayload);
        if (!res.success || !res.data) {
          setServerError(res.error || 'Failed to create laboratory test.');
          setIsSubmitting(false);
          return;
        }
        onSuccess(res.data);
      }
      onClose();
    } catch (err: any) {
      setServerError(err?.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111827]/50 flex items-center justify-center p-4 sm:p-6 select-text">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-form-title"
        className="bg-white rounded-lg border border-[#E2E8F0] max-w-4xl w-full flex flex-col max-h-[94vh] text-[#1F2937]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#E2E8F0] shrink-0">
          <div>
            <h2 id="test-form-title" className="text-base font-semibold">
              {testToEdit ? `Edit test: ${testToEdit.test_code}, ${testToEdit.test_name}` : 'New test'}
            </h2>
            <p className="mt-0.5 text-[13px] text-[#64748B]">
              Code, price, parameters and reference ranges.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            aria-label="Close"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1F2937] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col min-h-0">
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto bg-[#F5F7FA] px-6 py-6 space-y-6">
            {serverError && (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#DC2626] bg-white px-4 py-3"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" />
                <div>
                  <p className="text-[13px] font-semibold">Could not save the test</p>
                  <p className="text-[13px] text-[#64748B] mt-0.5">{serverError}</p>
                </div>
              </div>
            )}

            {/* Test details */}
            <section className="bg-white border border-[#E2E8F0] rounded-lg">
              <div className="px-5 py-4 border-b border-[#E2E8F0]">
                <h3 className="text-sm font-semibold">Test details</h3>
                <p className="text-xs text-[#64748B] mt-0.5">Identification, department and price.</p>
              </div>

              <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
                <div>
                  <Label htmlFor="testCode" required>Test code</Label>
                  <input
                    id="testCode"
                    placeholder="CBC, LFT, WIDAL"
                    className={inputClass}
                    {...register('testCode')}
                  />
                  {errors.testCode?.message ? (
                    <p className="mt-1.5 text-xs text-[#DC2626]">{errors.testCode.message}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-[#64748B]">Must be unique.</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="testName" required>Test name</Label>
                  <input
                    id="testName"
                    placeholder="Complete blood picture"
                    className={inputClass}
                    {...register('testName')}
                  />
                  {errors.testName?.message && (
                    <p className="mt-1.5 text-xs text-[#DC2626]">{errors.testName.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="category" required>Department</Label>
                  <select id="category" className={inputClass} {...register('category')}>
                    {DEFAULT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {errors.category && <p className="mt-1.5 text-xs text-[#DC2626]">{errors.category.message}</p>}
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="price" required>Price (PKR)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-[13px] text-[#64748B]" aria-hidden="true">
                      Rs.
                    </span>
                    <input
                      id="price"
                      type="number"
                      step="0.50"
                      min="0"
                      value={priceInput}
                      onChange={handlePriceChange}
                      className={`${inputClass} pl-10 tabular-nums`}
                    />
                  </div>
                  {errors.pricePaisa && (
                    <p className="mt-1.5 text-xs text-[#DC2626]">{errors.pricePaisa.message}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Parameters */}
            <section className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold">
                    Parameters <span className="font-normal text-[#64748B] tabular-nums">({fields.length})</span>
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    For a CBC these would be hemoglobin, TLC, platelets and so on. Choose a result type and set the limits for each.
                  </p>
                </div>
                <button type="button" onClick={handleAddParameter} className={`${secondaryBtn} shrink-0`}>
                  <Plus className="w-4 h-4 text-[#64748B]" />
                  Add parameter
                </button>
              </div>

              {errors.parameters && typeof errors.parameters.message === 'string' && (
                <p className="text-xs text-[#DC2626]">{errors.parameters.message}</p>
              )}

              {fields.map((field, index) => (
                <div key={field.id} className="bg-white border border-[#E2E8F0] rounded-lg">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[#E2E8F0]">
                    <h4 className="text-sm font-semibold">Parameter {index + 1}</h4>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748B] hover:text-[#DC2626] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="p-5 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor={`param-${index}-name`} required>Parameter name</Label>
                        <input
                          id={`param-${index}-name`}
                          type="text"
                          placeholder="Hemoglobin"
                          {...register(`parameters.${index}.parameter_name` as const)}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <Label htmlFor={`param-${index}-type`} required>Result type</Label>
                        <select
                          id={`param-${index}-type`}
                          {...register(`parameters.${index}.parameter_type` as const)}
                          className={inputClass}
                        >
                          <option value="numeric">Numeric</option>
                          <option value="text">Text (positive, negative and so on)</option>
                          <option value="options">Options (multiple choice)</option>
                        </select>
                      </div>

                      <div>
                        <Label htmlFor={`param-${index}-unit`} optional>Unit</Label>
                        <input
                          id={`param-${index}-unit`}
                          type="text"
                          placeholder="g/dL, mg/dL, U/L, %"
                          {...register(`parameters.${index}.unit` as const)}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <ParameterRangesEditor
                      control={control}
                      paramIndex={index}
                      register={register}
                      setValue={setValue}
                      errors={errors}
                    />
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-[#E2E8F0] bg-white rounded-b-lg shrink-0">
            <button type="button" onClick={handleSafeClose} className={secondaryBtn}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Saving…' : testToEdit ? 'Save changes' : 'Save test'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};