import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Doctor,
  LabTest,
  HospitalSettings,
  VisitDetail,
} from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { Badge } from '../../components/common/Badge';
import { ReceiptPrintModal } from './ReceiptPrintModal';
import { formatCurrency, parseCurrencyToPaisa } from '../../lib/utils';
import {
  Search,
  CheckCircle2,
  Trash2,
  Receipt,
  RotateCcw,
  Stethoscope,
  Plus,
  Coins,
  ShieldAlert,
} from 'lucide-react';

interface NewVisitViewProps {
  hospitalSettings: HospitalSettings | null;
  onVisitCreated?: (detail: VisitDetail) => void;
}

export const NewVisitView: React.FC<NewVisitViewProps> = ({
  hospitalSettings,
  onVisitCreated,
}) => {
  // --- Patient Details (Entered Directly at Bill Creation) ---
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState<'male' | 'female' | 'other'>('male');
  const [patientPhone, setPatientPhone] = useState('');

  // --- Doctor State (Optional) ---
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);

  // --- Tests Catalogue & Order Items ---
  const [tests, setTests] = useState<LabTest[]>([]);
  const [testSearch, setTestSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedTests, setSelectedTests] = useState<LabTest[]>([]);

  // --- Billing & Financials ---
  const [discountType, setDiscountType] = useState<'none' | 'fixed' | 'percentage'>('none');
  const [discountValueInput, setDiscountValueInput] = useState('0');
  const [paidAmountInput, setPaidAmountInput] = useState('0.00');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'cheque' | 'other'>('cash');
  const [notes, setNotes] = useState('');

  // --- Submission & Modals ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdVisitDetail, setCreatedVisitDetail] = useState<VisitDetail | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Load Active Doctors and Test Catalogue on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [docRes, testRes, catRes] = await Promise.all([
          window.electronAPI.doctors.list({ includeInactive: false }),
          window.electronAPI.tests.list({ includeInactive: false }),
          window.electronAPI.tests.getCategories(),
        ]);

        if (docRes.success && docRes.data) setDoctors(docRes.data);
        if (testRes.success && testRes.data) setTests(testRes.data);
        if (catRes.success && catRes.data) setCategories(catRes.data);
      } catch (err) {
        console.error('Failed to load initial master data for visit order form:', err);
      }
    };

    loadInitialData();
  }, []);

  // Add / Remove Tests
  const handleAddTest = (test: LabTest) => {
    if (selectedTests.some((t) => t.id === test.id)) return;
    setSelectedTests((prev) => [...prev, test]);
  };

  const handleRemoveTest = (testId: number) => {
    setSelectedTests((prev) => prev.filter((t) => t.id !== testId));
  };

  // Filtered available tests
  const filteredAvailableTests = useMemo(() => {
    return tests.filter((t) => {
      const matchesSearch =
        t.test_name.toLowerCase().includes(testSearch.toLowerCase()) ||
        t.test_code.toLowerCase().includes(testSearch.toLowerCase());
      const matchesCat = selectedCategory === 'all' || t.category === selectedCategory;
      const notAlreadySelected = !selectedTests.some((st) => st.id === t.id);
      return matchesSearch && matchesCat && notAlreadySelected;
    });
  }, [tests, testSearch, selectedCategory, selectedTests]);

  // --- Financial Calculations (Preview) ---
  const subtotalPaisa = useMemo(() => {
    return selectedTests.reduce((acc, t) => acc + t.price_paisa, 0);
  }, [selectedTests]);

  const discountPaisa = useMemo(() => {
    if (discountType === 'fixed') {
      const valPaisa = parseCurrencyToPaisa(discountValueInput);
      return Math.min(valPaisa, subtotalPaisa);
    } else if (discountType === 'percentage') {
      const pct = parseFloat(discountValueInput) || 0;
      const clampedPct = Math.min(Math.max(0, pct), 100);
      return Math.round((subtotalPaisa * clampedPct) / 100);
    }
    return 0;
  }, [subtotalPaisa, discountType, discountValueInput]);

  const finalTotalPaisa = Math.max(0, subtotalPaisa - discountPaisa);
  const paidPaisa = useMemo(() => parseCurrencyToPaisa(paidAmountInput), [paidAmountInput]);
  const balancePaisa = Math.max(0, finalTotalPaisa - paidPaisa);

  // Quick Payment buttons
  const handleQuickPayExact = () => {
    setPaidAmountInput((finalTotalPaisa / 100).toFixed(2));
  };

  const handleQuickPayZero = () => {
    setPaidAmountInput('0.00');
  };

  // Reset Form
  const handleResetForm = useCallback(() => {
    setPatientName('');
    setPatientAge('');
    setPatientGender('male');
    setPatientPhone('');
    setSelectedDoctorId(null);
    setSelectedTests([]);
    setDiscountType('none');
    setDiscountValueInput('0');
    setPaidAmountInput('0.00');
    setNotes('');
    setServerError(null);
  }, []);

  // Form Submission
  const handleSaveOrder = async () => {
    setServerError(null);

    // Validation
    if (!patientName.trim()) {
      setServerError('Please enter the patient full name.');
      return;
    }

    if (selectedTests.length === 0) {
      setServerError('Please select at least one laboratory test for this visit.');
      return;
    }

    if (paidPaisa > finalTotalPaisa) {
      setServerError(`Payment amount (${formatCurrency(paidPaisa)}) exceeds net total (${formatCurrency(finalTotalPaisa)}). Overpayments are not permitted.`);
      return;
    }

    setIsSubmitting(true);
    try {
      let calculatedDob: string | undefined = undefined;
      const ageNum = parseInt(patientAge.trim(), 10);
      if (!isNaN(ageNum) && ageNum >= 0 && ageNum <= 130) {
        const d = new Date();
        d.setFullYear(d.getFullYear() - ageNum);
        calculatedDob = d.toISOString().split('T')[0];
      }

      const payload: any = {
        referringDoctorId: selectedDoctorId || undefined,
        testIds: selectedTests.map((t) => t.id),
        discountType,
        discountValue: discountType === 'fixed' ? parseCurrencyToPaisa(discountValueInput) : parseFloat(discountValueInput) || 0,
        paidAmountPaisa: paidPaisa,
        paymentMethod,
        notes: notes.trim() || undefined,
        newPatient: {
          fullName: patientName.trim(),
          gender: patientGender,
          dateOfBirth: calculatedDob,
          phoneNumber: patientPhone.trim() || undefined,
        },
      };

      const res = await window.electronAPI.visits.create(payload);

      if (res.success && res.data) {
        setCreatedVisitDetail(res.data);
        setIsReceiptModalOpen(true);
        if (onVisitCreated) onVisitCreated(res.data);
      } else {
        setServerError(res.error || 'Failed to register visit and create invoice.');
      }
    } catch (err: any) {
      setServerError(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 select-text">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-brand-600" />
            New Patient Visit & Billing Desk
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Register patient visits, assign referring doctors, order lab tests, and issue official financial invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleResetForm}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Clear Form
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleSaveOrder}
            isLoading={isSubmitting}
            disabled={selectedTests.length === 0}
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Save Order & Issue Bill
          </Button>
        </div>
      </div>

      {serverError && <Alert type="error">{serverError}</Alert>}

      {/* Grid: Left Column (Patient, Doctor, Test Selection) & Right Column (Billing Summary) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: 7 Columns */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Patient Details Card */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Patient Information</h3>
                <p className="text-[11px] text-slate-500">Enter patient name, age, and biological sex for this visit</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Patient Full Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="e.g. Muhammad Usman"
                    required
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Age (Years) <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="125"
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    placeholder="e.g. 28"
                    required
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Biological Sex <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={patientGender}
                    onChange={(e) => setPatientGender(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 font-medium h-[38px]"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <Input
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="e.g. +92-300-XXXXXXX"
                />
              </div>
            </div>
          </Card>

          {/* 2. Referring Doctor Card */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-3">
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Referring Doctor <span className="text-slate-400 font-normal text-xs">(Optional)</span>
              </h3>
            </div>

            <div>
              <select
                value={selectedDoctorId || ''}
                onChange={(e) => setSelectedDoctorId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 font-medium"
              >
                <option value="">Self / Walk-in / Direct Patient (No Doctor)</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name} {d.specialization ? `— ${d.specialization}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Optional: Select referring physician if requested by the patient, or leave as Self/Walk-in.
              </p>
            </div>
          </Card>

          {/* 3. Test Catalogue Selector Card */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Select Laboratory Tests</h3>
              </div>
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                {selectedTests.length} Selected
              </span>
            </div>

            {/* Filter Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={testSearch}
                  onChange={(e) => setTestSearch(e.target.value)}
                  placeholder="Filter tests by name or code..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Available Tests Chips / Grid */}
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50/50 space-y-1">
              {filteredAvailableTests.length > 0 ? (
                filteredAvailableTests.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/80 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900">{t.test_name}</span>
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">
                          {t.test_code}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">{t.category}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-800">
                        {formatCurrency(t.price_paisa)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddTest(t)}
                        className="p-1 rounded-md bg-brand-50 hover:bg-brand-500 hover:text-white text-brand-600 transition-colors"
                        title="Add to order"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-4 text-xs text-slate-400">
                  {tests.length === 0 ? 'No active lab tests in catalogue.' : 'No matching tests found.'}
                </p>
              )}
            </div>

            {/* Selected Tests Table */}
            {selectedTests.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-200">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Order Line Items
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Test</th>
                        <th className="py-2 px-3">Code</th>
                        <th className="py-2 px-3 text-right">Price</th>
                        <th className="py-2 px-2 text-center w-10">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {selectedTests.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-semibold text-slate-900">{t.test_name}</td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{t.test_code}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                            {formatCurrency(t.price_paisa)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveTest(t.id)}
                              className="text-red-500 hover:text-red-700 p-1"
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
              </div>
            )}
          </Card>
        </div>

        {/* Right Side: 5 Columns (Live Billing Summary & Checkout) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-6 bg-slate-900 text-white rounded-2xl shadow-xl sticky top-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">Billing & Checkout</h3>
              </div>
              <Badge variant="info" className="font-mono text-xs">
                {selectedTests.length} Tests
              </Badge>
            </div>

            {/* Financial Calculations */}
            <div className="space-y-3 text-xs mb-5">
              <div className="flex justify-between text-slate-300">
                <span>Gross Subtotal:</span>
                <span className="font-mono font-bold text-white text-sm">
                  {formatCurrency(subtotalPaisa)}
                </span>
              </div>

              {/* Discount Section */}
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-200">Discount:</span>
                  <div className="flex bg-slate-900 rounded p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setDiscountType('none')}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        discountType === 'none' ? 'bg-brand-500 text-white' : 'text-slate-400'
                      }`}
                    >
                      None
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType('fixed')}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        discountType === 'fixed' ? 'bg-brand-500 text-white' : 'text-slate-400'
                      }`}
                    >
                      Fixed (PKR)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType('percentage')}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        discountType === 'percentage' ? 'bg-brand-500 text-white' : 'text-slate-400'
                      }`}
                    >
                      Percent (%)
                    </button>
                  </div>
                </div>

                {discountType !== 'none' && (
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <Input
                      type="number"
                      step={discountType === 'fixed' ? '1' : '0.5'}
                      min="0"
                      max={discountType === 'percentage' ? '100' : (subtotalPaisa / 100).toString()}
                      value={discountValueInput}
                      onChange={(e) => setDiscountValueInput(e.target.value)}
                      className="bg-slate-900 border-slate-700 text-white text-xs py-1"
                      placeholder={discountType === 'fixed' ? 'Paisa/Rupees' : 'Percentage'}
                    />
                    <span className="font-mono font-semibold text-emerald-400 shrink-0">
                      -{formatCurrency(discountPaisa)}
                    </span>
                  </div>
                )}
              </div>

              {/* Net Invoice Total */}
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                <span className="text-sm font-bold text-slate-200">Net Invoice Total:</span>
                <span className="font-mono text-xl font-black text-amber-400">
                  {formatCurrency(finalTotalPaisa)}
                </span>
              </div>

              {/* Payment Section */}
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-200">Amount Received:</span>
                  <div className="flex gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={handleQuickPayExact}
                      className="px-2 py-0.5 rounded bg-brand-500 text-white font-medium hover:bg-brand-600"
                    >
                      Pay Full
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickPayZero}
                      className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-medium hover:bg-slate-600"
                    >
                      Unpaid
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={(finalTotalPaisa / 100).toFixed(2)}
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white text-xs py-1"
                    placeholder="0.00"
                  />

                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    <option value="cash">Cash</option>
                    <option value="credit_card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              {/* Remaining Balance */}
              <div
                className={`flex justify-between items-baseline pt-1 font-bold ${
                  balancePaisa > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                <span>Outstanding Balance:</span>
                <span className="font-mono text-base">{formatCurrency(balancePaisa)}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="mb-5">
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Clinical / Visit Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Fasting status, special specimen handling, or urgent report request..."
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            {/* Final Action Button */}
            <Button
              size="lg"
              variant="primary"
              onClick={handleSaveOrder}
              isLoading={isSubmitting}
              disabled={selectedTests.length === 0}
              className="w-full text-sm font-bold bg-brand-500 hover:bg-brand-600 shadow-lg shadow-brand-500/20"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Save Order & Issue Official Bill
            </Button>

            <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <ShieldAlert className="w-3.5 h-3.5 text-brand-400" />
              <span>Atomic SQLite Transaction • Integer Minor Units (Paisa)</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      <ReceiptPrintModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          handleResetForm();
        }}
        visitDetail={createdVisitDetail}
        hospital={hospitalSettings}
      />
    </div>
  );
};
