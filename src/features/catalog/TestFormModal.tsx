import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, Control, UseFormRegister, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTestSchema, CreateTestInput, LabTest } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { parseCurrencyToPaisa } from '../../lib/utils';
import {
  FlaskConical,
  Plus,
  Trash2,
  X,
  Layers,
  Sliders,
  TestTube2,
  AlertTriangle,
  Info,
} from 'lucide-react';

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

const SAMPLE_TYPE_PRESETS = [
  'Serum',
  'Whole Blood (EDTA)',
  'Plasma (Fluoride)',
  'Plasma (Citrate)',
  'Plasma (Heparin)',
  'Urine (Random)',
  'Urine (24-Hour)',
  'Stool',
  'Sputum',
  'CSF / Body Fluid',
  'Swab (Throat/Nasal)',
  'Other',
];

const CONTAINER_PRESETS = [
  'Yellow Top (SST / Gel Activator)',
  'Purple Top (K2/K3 EDTA)',
  'Red Top (Plain / Clot Activator)',
  'Grey Top (Sodium Fluoride)',
  'Blue Top (Sodium Citrate 3.2%)',
  'Green Top (Lithium Heparin)',
  'Sterile Urine Container',
  'Stool Container',
  'Swab Transport Tube',
  'Other Container',
];

const PREPARATION_PRESETS = [
  'Random / No Fasting Required',
  '10 - 12 Hours Overnight Fasting',
  '8 Hours Fasting',
  'First Morning Midstream Urine',
  '2 Hours Post-Prandial (After Meal)',
  'Discontinue Antibiotics Prior to Sample',
  'Other / Clinical Discretion',
];

const TAT_PRESETS = [
  '2 Hours (Stat / Urgent)',
  'Same Day (4 - 6 Hours)',
  'Same Day (Evening)',
  '24 Hours (Next Day)',
  '48 Hours',
  '3 - 5 Days',
];

const METHOD_PRESETS = [
  'Automated Analyzer',
  'Spectrophotometry / Photometric',
  'Automated Cell Counter (Impedance/Flow)',
  'Chemiluminescence (CLIA / ECLIA)',
  'ELISA / Microplate',
  'Microscopy & Staining',
  'Immunochromatography (Rapid Card)',
  'Turbidimetry',
  'Manual / Wet Chemistry',
];

/**
 * Sub-component to manage multiple reference ranges per parameter.
 * Solves Issue 1 (Multiple ranges: Male, Female, Age-specific),
 * Issue 2 (No hardcoded 70-100 default), and Issue 3 (Result type: numeric vs text/qualitative).
 */
interface ParameterRangesEditorProps {
  control: Control<CreateTestInput>;
  paramIndex: number;
  register: UseFormRegister<CreateTestInput>;
  errors: any;
}

const ParameterRangesEditor: React.FC<ParameterRangesEditorProps> = ({
  control,
  paramIndex,
  register,
}) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `parameters.${paramIndex}.ranges` as const,
  });

  const paramType = useWatch({
    control,
    name: `parameters.${paramIndex}.parameter_type` as const,
  }) || 'numeric';

  const unit = useWatch({
    control,
    name: `parameters.${paramIndex}.unit` as const,
  }) || '';

  const handleAddRange = () => {
    append({
      gender: 'all',
      min_age_days: 0,
      max_age_days: 47450,
      normal_low: null,
      normal_high: null,
      panic_low: null,
      panic_high: null,
      display_text: '',
    });
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-brand-600" />
          Clinical Reference Ranges & Critical (Panic) Limits ({fields.length})
        </label>
        <button
          type="button"
          onClick={handleAddRange}
          className="text-[11px] text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 hover:underline"
        >
          <Plus className="w-3 h-3" />
          Add Another Range (e.g. Male / Female)
        </button>
      </div>

      {fields.length === 0 ? (
        <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center">
          <p className="text-xs text-slate-500 mb-2">No reference range configured for this parameter.</p>
          <Button type="button" size="sm" variant="outline" onClick={handleAddRange} className="text-xs">
            <Plus className="w-3 h-3 mr-1" />
            Add Reference Range
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((rangeField, rIdx) => (
            <div
              key={rangeField.id}
              className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2.5 relative text-xs"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-xs">
                    Range #{rIdx + 1}
                  </span>
                  {/* Gender Selector */}
                  <div className="flex items-center gap-1">
                    <label className="text-[11px] text-slate-500 font-medium">Applies to:</label>
                    <select
                      {...register(`parameters.${paramIndex}.ranges.${rIdx}.gender` as const)}
                      className="px-2 py-0.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                    >
                      <option value="all">All Genders</option>
                      <option value="male">Male Only</option>
                      <option value="female">Female Only</option>
                    </select>
                  </div>
                </div>

                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(rIdx)}
                    className="text-slate-400 hover:text-red-600 transition-colors p-1"
                    title="Remove this range"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {paramType === 'numeric' ? (
                /* Numeric / Quantitative Configuration */
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Normal Low {unit ? `(${unit})` : ''}
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 13.5"
                        {...register(`parameters.${paramIndex}.ranges.${rIdx}.normal_low` as const, {
                          valueAsNumber: true,
                        })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Normal High {unit ? `(${unit})` : ''}
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 17.5"
                        {...register(`parameters.${paramIndex}.ranges.${rIdx}.normal_high` as const, {
                          valueAsNumber: true,
                        })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-amber-700 mb-0.5 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        Panic Low (Critical)
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 7.0"
                        {...register(`parameters.${paramIndex}.ranges.${rIdx}.panic_low` as const, {
                          valueAsNumber: true,
                        })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50/40 font-mono text-xs text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-amber-700 mb-0.5 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        Panic High (Critical)
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 20.0"
                        {...register(`parameters.${paramIndex}.ranges.${rIdx}.panic_high` as const, {
                          valueAsNumber: true,
                        })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50/40 font-mono text-xs text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Display Reference Text Printed on Patient Reports <span className="text-slate-400 font-normal">(Auto-generated if left blank)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 13.5 - 17.5 g/dL (or leave blank for automatic format)"
                      {...register(`parameters.${paramIndex}.ranges.${rIdx}.display_text` as const)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              ) : (
                /* Qualitative / Text / Options Configuration */
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                      Expected Normal / Reference Clinical Text <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Negative, Non-Reactive, Clear, Normal"
                      {...register(`parameters.${paramIndex}.ranges.${rIdx}.display_text` as const)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      This expected normal value will be printed in the Reference Interval column of the laboratory report.
                    </p>
                  </div>
                </div>
              )}
            </div>
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
          ranges: [
            {
              gender: 'all',
              min_age_days: 0,
              max_age_days: 47450,
              normal_low: null,
              normal_high: null,
              panic_low: null,
              panic_high: null,
              display_text: '',
            },
          ],
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
        const formattedParams = testToEdit.parameters && testToEdit.parameters.length > 0
          ? testToEdit.parameters.map((p, idx) => ({
              parameter_name: p.parameter_name,
              display_order: p.display_order ?? idx + 1,
              unit: p.unit || '',
              parameter_type: p.parameter_type || 'numeric',
              notes: p.notes || '',
              ranges: p.ranges && p.ranges.length > 0
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
                : [
                    {
                      gender: 'all' as const,
                      min_age_days: 0,
                      max_age_days: 47450,
                      normal_low: null,
                      normal_high: null,
                      panic_low: null,
                      panic_high: null,
                      display_text: '',
                    },
                  ],
            }))
          : [
              {
                parameter_name: testToEdit.test_name,
                display_order: 1,
                unit: '',
                parameter_type: 'numeric' as const,
                notes: '',
                ranges: [
                  {
                    gender: 'all' as const,
                    min_age_days: 0,
                    max_age_days: 47450,
                    normal_low: null,
                    normal_high: null,
                    panic_low: null,
                    panic_high: null,
                    display_text: '',
                  },
                ],
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
              ranges: [
                {
                  gender: 'all',
                  min_age_days: 0,
                  max_age_days: 47450,
                  normal_low: null,
                  normal_high: null,
                  panic_low: null,
                  panic_high: null,
                  display_text: '',
                },
              ],
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
      ranges: [
        {
          gender: 'all',
          min_age_days: 0,
          max_age_days: 47450,
          normal_low: null,
          normal_high: null,
          panic_low: null,
          panic_high: null,
          display_text: '',
        },
      ],
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
            if (r.normal_low != null && r.normal_high != null) {
              text = `${r.normal_low} - ${r.normal_high}${unitStr}`;
            } else if (r.normal_low != null) {
              text = `> ${r.normal_low}${unitStr}`;
            } else if (r.normal_high != null) {
              text = `< ${r.normal_high}${unitStr}`;
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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 select-text overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full overflow-hidden flex flex-col my-auto max-h-[94vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/30 border border-brand-400/40 flex items-center justify-center text-brand-300">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {testToEdit ? `Edit Test: ${testToEdit.test_code} — ${testToEdit.test_name}` : 'Register New Diagnostic Test'}
              </h2>
              <p className="text-xs text-slate-300">
                WHO Quality Standard Profile: Specimen, Turnaround, Method & Reference Ranges
              </p>
            </div>
          </div>
          <button
            onClick={handleSafeClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 overflow-y-auto space-y-6">
          {serverError && (
            <Alert type="error" title="Configuration Error">
              {serverError}
            </Alert>
          )}

          {/* Section 1: General Test Details */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-brand-600" />
              1. Test Identification & Billing
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Input
                  label="Test Code (Unique)"
                  required
                  placeholder="e.g. CBC, BSF, LFT, WIDAL"
                  error={errors.testCode?.message}
                  {...register('testCode')}
                />
              </div>

              <div className="sm:col-span-2">
                <Input
                  label="Full Diagnostic Test Name"
                  required
                  placeholder="e.g. Complete Blood Picture or Fasting Blood Sugar"
                  error={errors.testName?.message}
                  {...register('testName')}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Laboratory Department <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 font-medium h-[38px]"
                  {...register('category')}
                >
                  {DEFAULT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {errors.category && <p className="mt-1 text-xs text-red-600 font-medium">{errors.category.message}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Test Price (Rupees) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">Rs.</span>
                  <input
                    type="number"
                    step="0.50"
                    min="0"
                    value={priceInput}
                    onChange={handlePriceChange}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-brand-400 font-bold"
                  />
                </div>
                {errors.pricePaisa && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{errors.pricePaisa.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: WHO Specimen, Collection & Operational Standards */}
          <div className="p-4 rounded-xl bg-sky-50/40 border border-sky-100 space-y-4">
            <h3 className="text-xs font-bold text-sky-900 uppercase tracking-wider flex items-center gap-1.5">
              <TestTube2 className="w-3.5 h-3.5 text-sky-600" />
              2. Specimen, Container & Patient Preparation (WHO Standards)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sample / Specimen Type
                </label>
                <input
                  type="text"
                  list="sample-type-presets"
                  placeholder="e.g. Whole Blood (EDTA), Serum, Urine"
                  {...register('sampleType')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <datalist id="sample-type-presets">
                  {SAMPLE_TYPE_PRESETS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Collection Container / Tube
                </label>
                <input
                  type="text"
                  list="container-presets"
                  placeholder="e.g. Purple Top (EDTA), Yellow Top (Gel)"
                  {...register('collectionContainer')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <datalist id="container-presets">
                  {CONTAINER_PRESETS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Patient Preparation / Fasting Instruction
                </label>
                <input
                  type="text"
                  list="preparation-presets"
                  placeholder="e.g. 10 - 12 Hours Fasting or Random"
                  {...register('patientPreparation')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <datalist id="preparation-presets">
                  {PREPARATION_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Turnaround Time (TAT)
                </label>
                <input
                  type="text"
                  list="tat-presets"
                  placeholder="e.g. 2 Hours or Same Day"
                  {...register('turnaroundTime')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <datalist id="tat-presets">
                  {TAT_PRESETS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Test Analytical Method / Principle
                </label>
                <input
                  type="text"
                  list="method-presets"
                  placeholder="e.g. Automated Analyzer, Chemiluminescence, Spectrophotometry"
                  {...register('testMethod')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <datalist id="method-presets">
                  {METHOD_PRESETS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* Section 3: Test Parameters & Clinical Reference Ranges */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-brand-600" />
                  3. Test Parameters, Result Types & Reference Intervals ({fields.length})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Define parameters (e.g. Hemoglobin, TLC, Platelets for CBC), select Numeric or Qualitative result type, and set normal limits.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={handleAddParameter}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Parameter
              </Button>
            </div>

            {errors.parameters && typeof errors.parameters.message === 'string' && (
              <p className="text-xs text-red-600 font-medium">{errors.parameters.message}</p>
            )}

            <div className="space-y-4">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px]">
                        {index + 1}
                      </span>
                      Parameter #{index + 1}
                    </span>

                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors text-xs flex items-center gap-1 font-medium"
                        title="Remove Parameter"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Parameter
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Parameter Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Hemoglobin or Serum Creatinine"
                        {...register(`parameters.${index}.parameter_name` as const)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Result Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        {...register(`parameters.${index}.parameter_type` as const)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium h-[34px]"
                      >
                        <option value="numeric">Numeric (Quantitative Numbers)</option>
                        <option value="text">Qualitative / Text (Positive, Negative, etc.)</option>
                        <option value="options">Options (Multi-Choice)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Measurement Unit <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. g/dL, mg/dL, U/L, %"
                        {...register(`parameters.${index}.unit` as const)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Multiple Reference Ranges & Panic Limits Sub-Editor */}
                  <ParameterRangesEditor
                    control={control}
                    paramIndex={index}
                    register={register}
                    errors={errors}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleSafeClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {testToEdit ? 'Save Changes' : 'Save Test to Catalog'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
