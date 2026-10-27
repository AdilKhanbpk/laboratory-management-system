import React, { useState, useEffect } from 'react';
import {
  VisitDetail,
  LabTest,
  Doctor,
  SafeUser,
  UpdateVisitOrderAndInvoiceInput,
} from '../../types';
import { formatCurrency, parseCurrencyToPaisa, calculateAge } from '../../lib/utils';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import {
  X,
  Plus,
  Trash2,
  Save,
  Search,
  FileEdit,
  Loader2,
  Stethoscope,
  Receipt,
  Coins,
  CheckCircle2,
  User,
} from 'lucide-react';

interface EditVisitOrderModalProps {
  visitId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const inputClass =
  'block w-full h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E] ' +
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:hidden';

export const EditVisitOrderModal: React.FC<EditVisitOrderModalProps> = ({
  visitId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [visitDetail, setVisitDetail] = useState<VisitDetail | null>(null);
  const [availableTests, setAvailableTests] = useState<LabTest[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  // Form State - Patient Details
  const [patientName, setPatientName] = useState<string>('');
  const [patientAge, setPatientAge] = useState<string>('');
  const [patientAgeMonths, setPatientAgeMonths] = useState<string>('');
  const [patientGender, setPatientGender] = useState<'male' | 'female' | 'other'>('male');
  const [patientPhone, setPatientPhone] = useState<string>('');

  // Form State - Visit & Doctor
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [visitNotes, setVisitNotes] = useState<string>('');
  const [selectedTests, setSelectedTests] = useState<LabTest[]>([]);
  const [discountType, setDiscountType] = useState<'none' | 'fixed' | 'percentage'>('none');
  const [discountValueInput, setDiscountValueInput] = useState<string>('0');
  const [testSearch, setTestSearch] = useState<string>('');

  // Additional Payment State
  const [additionalPaymentInput, setAdditionalPaymentInput] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'cheque' | 'other'>('cash');
  const [paymentReference, setPaymentReference] = useState<string>('');

  // Session & Security
  const [sessionUser, setSessionUser] = useState<SafeUser | null>(null);

  useEffect(() => {
    window.electronAPI.auth.getSession().then((res) => {
      if (res.success && res.data?.user) {
        setSessionUser(res.data.user);
      }
    }).catch(() => {});
  }, []);

  const isUserAdmin = sessionUser?.role === 'admin';
  const isLockedForUser = React.useMemo(() => {
    if (!visitDetail || isUserAdmin) return false;
    const v = visitDetail.visit;
    if (v.creator_role === 'admin') return true;
    if (sessionUser && v.operator_id !== sessionUser.id) return true;
    if (v.created_at) {
      const diffHours = (Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60);
      if (diffHours > 10) return true;
    }
    return false;
  }, [visitDetail, isUserAdmin, sessionUser]);

  useEffect(() => {
    if (!isOpen || !visitId) return;

    const loadData = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setAdditionalPaymentInput('0');
      setPaymentReference('');
      try {
        const [visitRes, testsRes, doctorsRes] = await Promise.all([
          window.electronAPI.visits.getById(visitId),
          window.electronAPI.tests.list({ includeInactive: false }),
          window.electronAPI.doctors.list({ includeInactive: false }),
        ]);

        if (!visitRes.success || !visitRes.data) {
          setErrorMessage(visitRes.error || 'Failed to load visit details.');
          setIsLoading(false);
          return;
        }

        const v = visitRes.data;
        setVisitDetail(v);
        setPatientName(v.patient.full_name || '');
        setPatientGender((v.patient.gender as any) || 'male');
        setPatientPhone(v.patient.phone_number || '');

        if (v.patient.date_of_birth) {
          const ageInfo = calculateAge(v.patient.date_of_birth);
          if (ageInfo) {
            setPatientAge(String(ageInfo.years));
            setPatientAgeMonths(String(ageInfo.months));
          } else {
            setPatientAge('');
            setPatientAgeMonths('');
          }
        } else {
          setPatientAge('');
          setPatientAgeMonths('');
        }

        setSelectedDoctorId(v.visit.referring_doctor_id || null);
        setVisitNotes(v.visit.notes || '');

        const allCatalog = testsRes.success && testsRes.data ? testsRes.data : [];
        setAvailableTests(allCatalog);

        const allDocs = doctorsRes.success && doctorsRes.data ? doctorsRes.data : [];
        setDoctors(allDocs);

        // Pre-select current ordered tests
        const catalogMap = new Map(allCatalog.map((t) => [t.id, t]));
        const ordered = v.orderItems
          .map((oi) => catalogMap.get(oi.test_id))
          .filter(Boolean) as LabTest[];

        // If some tests were ordered that aren't in active catalog, reconstruct them from snapshot
        v.orderItems.forEach((oi) => {
          if (!ordered.some((t) => t.id === oi.test_id)) {
            ordered.push({
              id: oi.test_id,
              test_code: oi.test_code_snapshot,
              test_name: oi.test_name_snapshot,
              price_paisa: oi.price_snapshot,
              category: 'General',
              description: null,
              is_active: 1,
              created_at: oi.created_at,
              updated_at: oi.created_at,
            });
          }
        });

        setSelectedTests(ordered);

        // Pre-fill discount
        setDiscountType(v.invoice.discount_type || 'none');
        if (v.invoice.discount_type === 'percentage') {
          setDiscountValueInput(String(v.invoice.discount_value || 0));
        } else if (v.invoice.discount_type === 'fixed') {
          setDiscountValueInput((v.invoice.discount_amount / 100).toFixed(2));
        } else {
          setDiscountValueInput('0');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Error loading visit for editing.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isOpen, visitId]);

  if (!isOpen) return null;

  // Live calculations
  const subtotalPaisa = selectedTests.reduce((sum, t) => sum + t.price_paisa, 0);

  let discountPaisa = 0;
  let parsedDiscountValue = parseFloat(discountValueInput) || 0;
  if (discountType === 'percentage') {
    parsedDiscountValue = Math.min(100, Math.max(0, parsedDiscountValue));
    discountPaisa = Math.round((subtotalPaisa * parsedDiscountValue) / 100);
  } else if (discountType === 'fixed') {
    discountPaisa = Math.min(subtotalPaisa, Math.max(0, parseCurrencyToPaisa(discountValueInput)));
  }

  const finalTotalPaisa = Math.max(0, subtotalPaisa - discountPaisa);
  const previouslyPaidPaisa = visitDetail?.invoice.paid_amount || 0;
  const unpaidBalanceBeforePayment = Math.max(0, finalTotalPaisa - previouslyPaidPaisa);

  const rawAdditionalPaisa = parseCurrencyToPaisa(additionalPaymentInput);
  const isOverpayment = rawAdditionalPaisa > unpaidBalanceBeforePayment;
  const parsedAdditionalPaymentPaisa = Math.max(0, rawAdditionalPaisa);

  const totalPaidWithNewPayment = previouslyPaidPaisa + parsedAdditionalPaymentPaisa;
  const remainingBalancePaisa = Math.max(0, finalTotalPaisa - totalPaidWithNewPayment);

  const handlePayFull = () => {
    setAdditionalPaymentInput((unpaidBalanceBeforePayment / 100).toFixed(2));
  };

  const handleClearPayment = () => {
    setAdditionalPaymentInput('0');
  };

  const handleAddTest = (test: LabTest) => {
    if (!selectedTests.some((t) => t.id === test.id)) {
      setSelectedTests((prev) => [...prev, test]);
    }
    setTestSearch('');
  };

  const handleRemoveTest = (testId: number) => {
    if (selectedTests.length <= 1) {
      setErrorMessage('An order must have at least one test.');
      return;
    }
    setSelectedTests((prev) => prev.filter((t) => t.id !== testId));
  };

  const handleSave = async () => {
    if (!visitId) return;
    if (!patientName.trim()) {
      setErrorMessage('Patient full name is required.');
      return;
    }
    if (selectedTests.length === 0) {
      setErrorMessage('Please select at least one laboratory test.');
      return;
    }

    if (isOverpayment) {
      setErrorMessage(
        `Amount received (${formatCurrency(rawAdditionalPaisa)}) cannot be greater than the test rate / remaining balance (${formatCurrency(unpaidBalanceBeforePayment)}).`
      );
      return;
    }

    const yearsNum = parseInt(patientAge.trim(), 10);
    const monthsNum = parseInt(patientAgeMonths.trim(), 10);
    const hasYears = !isNaN(yearsNum) && yearsNum >= 0 && yearsNum <= 130;
    const hasMonths = !isNaN(monthsNum) && monthsNum >= 0 && monthsNum <= 11;
    let calculatedDob: string | null = null;
    if (hasYears || hasMonths) {
      const y = hasYears ? yearsNum : 0;
      const m = hasMonths ? monthsNum : 0;
      const d = new Date();
      d.setFullYear(d.getFullYear() - y);
      d.setMonth(d.getMonth() - m);
      calculatedDob = d.toISOString().split('T')[0];
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload: UpdateVisitOrderAndInvoiceInput = {
      visitId,
      patientName: patientName.trim(),
      patientDob: calculatedDob,
      patientGender,
      patientPhone: patientPhone.trim() || null,
      referringDoctorId: selectedDoctorId || null,
      notes: visitNotes.trim() || null,
      testIds: selectedTests.map((t) => t.id),
      discountType,
      discountValue:
        discountType === 'percentage'
          ? parsedDiscountValue
          : discountType === 'fixed'
          ? discountPaisa
          : 0,
      additionalPaymentPaisa: parsedAdditionalPaymentPaisa,
      paymentMethod,
      transactionReference: paymentReference.trim() || undefined,
    };

    try {
      const res = await window.electronAPI.visits.updateOrderAndInvoice(payload);
      if (res.success) {
        setSuccessMessage('Order and invoice successfully updated!');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 800);
      } else {
        setErrorMessage(res.error || 'Failed to update order and invoice.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error occurred while saving changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredTests = availableTests
    .filter(
      (t) =>
        !selectedTests.some((st) => st.id === t.id) &&
        (t.test_name.toLowerCase().includes(testSearch.toLowerCase()) ||
          t.test_code.toLowerCase().includes(testSearch.toLowerCase()) ||
          t.category.toLowerCase().includes(testSearch.toLowerCase()))
    )
    .slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col text-[#1F2937] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center justify-between shrink-0 bg-[#F8FAFC]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center">
              <FileEdit className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                Edit Order & Invoice · Visit {visitDetail?.visit.visit_number}
              </h3>
              <p className="text-xs text-[#64748B]">
                Patient: <span className="font-medium text-slate-800">{visitDetail?.patient.full_name}</span> ({visitDetail?.patient.patient_mrn})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1F2937]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {isLockedForUser && (
            <Alert type="warning">
              🔒 Editing Locked: Bills created by an administrator or older than 10 hours cannot be modified by staff. Only administrators can edit this bill.
            </Alert>
          )}
          {errorMessage && <Alert type="error">{errorMessage}</Alert>}
          {successMessage && <Alert type="success">{successMessage}</Alert>}

          {isLoading ? (
            <div className="py-16 text-center text-[#64748B] text-xs">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#0F766E]" />
              Loading order details…
            </div>
          ) : (
            <>
              {/* Patient Details Section */}
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#0F766E]" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Patient Information
                    </span>
                  </div>
                  {visitDetail?.patient.patient_mrn && (
                    <span className="text-[11px] font-mono bg-white px-2 py-0.5 rounded border border-[#CBD5E1] text-slate-600">
                      MRN: {visitDetail.patient.patient_mrn}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Patient Name */}
                  <div className="md:col-span-2">
                    <label htmlFor="edit-patient-name" className="block text-xs font-semibold text-slate-700 mb-1">
                      Patient Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="edit-patient-name"
                      type="text"
                      required
                      placeholder="e.g. Muhammad Ali"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  {/* Gender */}
                  <div>
                    <label htmlFor="edit-patient-gender" className="block text-xs font-semibold text-slate-700 mb-1">
                      Gender
                    </label>
                    <select
                      id="edit-patient-gender"
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value as any)}
                      className={inputClass}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Phone */}
                  <div>
                    <label htmlFor="edit-patient-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      id="edit-patient-phone"
                      type="text"
                      placeholder="e.g. 0300-1234567"
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Age (Years & Months) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label htmlFor="edit-patient-age" className="block text-xs font-semibold text-slate-700 mb-1">
                      Age (Years)
                    </label>
                    <input
                      id="edit-patient-age"
                      type="number"
                      min="0"
                      max="130"
                      placeholder="Years (e.g. 28)"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-patient-age-months" className="block text-xs font-semibold text-slate-700 mb-1">
                      Age (Months)
                    </label>
                    <input
                      id="edit-patient-age-months"
                      type="number"
                      min="0"
                      max="11"
                      placeholder="Months (0 - 11)"
                      value={patientAgeMonths}
                      onChange={(e) => setPatientAgeMonths(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* Doctor and Notes Row */}
              <div className="grid mt-2 grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-doc" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-slate-500" />
                    Referring Doctor
                  </label>
                  <select
                    id="edit-doc"
                    value={selectedDoctorId || ''}
                    onChange={(e) => setSelectedDoctorId(e.target.value ? Number(e.target.value) : null)}
                    className={inputClass}
                  >
                    <option value="">Walk-in (Self)</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name} {d.specialization ? `(${d.specialization})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                    Visit Notes (Optional)
                  </label>
                  <input
                    id="edit-notes"
                    type="text"
                    placeholder="Clinical notes, fasting status, etc."
                    value={visitNotes}
                    onChange={(e) => setVisitNotes(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Tests Selection Section */}
              <div className="border border-[#E2E8F0] rounded-lg mt-2 p-4 space-y-3 bg-[#F8FAFC]/50">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Ordered Tests ({selectedTests.length})
                  </h4>
                  <span className="text-xs text-[#64748B]">Subtotal: {formatCurrency(subtotalPaisa)}</span>
                </div>

                {/* Selected Tests Table */}
                <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Code</th>
                        <th className="py-2 px-3">Test name</th>
                        <th className="py-2 px-3 text-right">Fee</th>
                        <th className="py-2 px-3 w-12 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {selectedTests.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono font-medium text-slate-700">{t.test_code}</td>
                          <td className="py-2 px-3 font-medium text-slate-900">{t.test_name}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-900">
                            {formatCurrency(t.price_paisa)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveTest(t.id)}
                              className="text-slate-400 hover:text-rose-600 p-0.5 rounded"
                              title="Remove test"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add More Tests Search */}
                <div className="relative pt-1">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Type to search and add tests to this order…"
                      value={testSearch}
                      onChange={(e) => setTestSearch(e.target.value)}
                      className={`${inputClass} pl-8`}
                    />
                  </div>

                  {testSearch.trim() && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-[#E2E8F0] rounded-md shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {filteredTests.length > 0 ? (
                        filteredTests.map((t) => (
                          <div
                            key={t.id}
                            onClick={() => handleAddTest(t)}
                            className="px-3 py-2 text-xs hover:bg-[#F0FDFA] cursor-pointer flex items-center justify-between"
                          >
                            <div>
                              <span className="font-semibold text-slate-900">{t.test_name}</span>{' '}
                              <span className="text-slate-400 font-mono">({t.test_code})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#0F766E]">{formatCurrency(t.price_paisa)}</span>
                              <Plus className="w-3.5 h-3.5 text-slate-500" />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-xs text-slate-500 text-center">No matching tests found.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Invoice & Billing Adjustment */}
              <div className="border border-[#E2E8F0] rounded-lg p-4 space-y-4 bg-[#F8FAFC]/50">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-slate-500" />
                    Invoice & Billing Adjustment
                  </h4>
                  <span className="text-xs text-slate-500 font-medium">
                    Order Total: {formatCurrency(finalTotalPaisa)}
                  </span>
                </div>

                {/* Discount Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="discount-type" className="block text-xs font-medium text-slate-600 mb-1">
                      Discount Type
                    </label>
                    <select
                      id="discount-type"
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as any)}
                      className={inputClass}
                    >
                      <option value="none">No Discount</option>
                      <option value="fixed">Fixed Amount (Rs)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                  </div>

                  {discountType !== 'none' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="discount-val" className="text-xs font-medium text-slate-600">
                          Discount Value {discountType === 'percentage' ? '(%)' : '(Rs)'}
                        </label>
                        {discountPaisa > 0 && (
                          <span className="text-[11px] font-semibold text-amber-700">
                            - {formatCurrency(discountPaisa)}
                          </span>
                        )}
                      </div>
                      <input
                        id="discount-val"
                        type="number"
                        min="0"
                        step={discountType === 'percentage' ? '1' : 'any'}
                        max={discountType === 'percentage' ? '100' : undefined}
                        value={discountValueInput}
                        onChange={(e) => setDiscountValueInput(e.target.value)}
                        placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 200'}
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>

                {/* Receive Payment Section (Active whenever there is an outstanding balance) */}
                {unpaidBalanceBeforePayment > 0 && (
                  <div className="border border-teal-200 bg-teal-50/50 rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 pb-2">
                      <div className="flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-teal-700" />
                        <span className="text-xs font-bold text-teal-950 uppercase tracking-wide">
                          Receive Payment Now
                        </span>
                        <span className="text-xs text-teal-700 ml-1">
                          (Due: {formatCurrency(unpaidBalanceBeforePayment)})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handlePayFull}
                          className="px-2.5 py-1 text-xs font-semibold rounded bg-[#0F766E] text-white hover:bg-[#115E59] shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                          title="Auto-fill the full remaining balance"
                        >
                          Pay Full ({formatCurrency(unpaidBalanceBeforePayment)})
                        </button>
                        <button
                          type="button"
                          onClick={handleClearPayment}
                          className="px-2 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                          title="Reset payment amount to zero"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="additional-payment" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Amount Received (Rs)
                        </label>
                        <input
                          id="additional-payment"
                          type="number"
                          min="0"
                          step="any"
                          value={additionalPaymentInput}
                          onChange={(e) => setAdditionalPaymentInput(e.target.value)}
                          placeholder="0.00"
                          className={`${inputClass} font-semibold tabular-nums ${
                            isOverpayment ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-500 bg-rose-50/40 text-rose-900' : ''
                          }`}
                        />
                        {isOverpayment && (
                          <p className="text-[11px] text-rose-600 font-semibold mt-1">
                            Amount received cannot be greater than the test rate / remaining balance ({formatCurrency(unpaidBalanceBeforePayment)}).
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="payment-method" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Payment Method
                        </label>
                        <select
                          id="payment-method"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as any)}
                          className={inputClass}
                        >
                          <option value="cash">Cash</option>
                          <option value="credit_card">Credit Card</option>
                          <option value="debit_card">Debit Card</option>
                          <option value="bank_transfer">Bank Transfer / Online</option>
                          <option value="cheque">Cheque</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary calculation card */}
                <div className="bg-white border border-[#CBD5E1] rounded-lg p-3.5 text-xs space-y-2">
                  <div className="flex justify-between text-slate-600">
                    <span>Order Subtotal:</span>
                    <span className="tabular-nums font-medium">{formatCurrency(subtotalPaisa)}</span>
                  </div>
                  {discountPaisa > 0 && (
                    <div className="flex justify-between text-amber-700 font-medium">
                      <span>Discount applied ({discountType === 'percentage' ? `${parsedDiscountValue}%` : 'Fixed'}):</span>
                      <span className="tabular-nums">- {formatCurrency(discountPaisa)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-200 text-sm">
                    <span>Net Final Total:</span>
                    <span className="tabular-nums">{formatCurrency(finalTotalPaisa)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Previously Paid:</span>
                    <span className="tabular-nums font-semibold text-emerald-700">{formatCurrency(previouslyPaidPaisa)}</span>
                  </div>
                  {parsedAdditionalPaymentPaisa > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50/80 px-2 py-1 rounded">
                      <span>Payment Received Now:</span>
                      <span className="tabular-nums">+ {formatCurrency(parsedAdditionalPaymentPaisa)}</span>
                    </div>
                  )}
                  <div
                    className={`flex justify-between font-bold pt-2 border-t border-slate-200 text-sm ${
                      remainingBalancePaisa === 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {remainingBalancePaisa === 0 && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      {remainingBalancePaisa === 0 ? 'Remaining Balance (Fully Paid):' : 'Remaining Balance:'}
                    </span>
                    <span className="tabular-nums">{formatCurrency(remainingBalancePaisa)}</span>
                  </div>
                  {finalTotalPaisa < previouslyPaidPaisa && (
                    <div className="flex justify-between text-amber-800 font-semibold pt-1 text-xs">
                      <span>Excess / Refund Due to Patient:</span>
                      <span className="tabular-nums">{formatCurrency(previouslyPaidPaisa - finalTotalPaisa)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2 bg-[#F8FAFC] shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={isLoading || isSaving || isOverpayment || isLockedForUser}
            className="bg-[#0F766E] hover:bg-[#115E59]"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

