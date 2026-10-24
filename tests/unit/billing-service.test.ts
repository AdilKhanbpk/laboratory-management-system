import { describe, it, expect } from 'vitest';
import { BillingService, BillingError } from '../../electron/services/billing-service';

describe('Unit: BillingService & Currency Calculations', () => {
  const sampleItems = [
    {
      testId: 1,
      testCode: 'CBC',
      testName: 'Complete Blood Count',
      pricePaisa: 120000, // 1200.00 PKR
      quantity: 1,
    },
    {
      testId: 2,
      testCode: 'BSF',
      testName: 'Blood Sugar Fasting',
      pricePaisa: 35000, // 350.00 PKR
      quantity: 1,
    },
  ];

  it('calculates clean subtotal with no discount and exact payment', () => {
    const result = BillingService.calculateOrderBilling(sampleItems, { type: 'none', value: 0 }, 155000);

    expect(result.subtotalPaisa).toBe(155000);
    expect(result.discountPaisa).toBe(0);
    expect(result.finalTotalPaisa).toBe(155000);
    expect(result.paidPaisa).toBe(155000);
    expect(result.balancePaisa).toBe(0);
    expect(result.paymentStatus).toBe('paid');
  });

  it('handles partial payment with correct outstanding balance', () => {
    const result = BillingService.calculateOrderBilling(sampleItems, { type: 'none', value: 0 }, 100000);

    expect(result.subtotalPaisa).toBe(155000);
    expect(result.finalTotalPaisa).toBe(155000);
    expect(result.paidPaisa).toBe(100000);
    expect(result.balancePaisa).toBe(55000);
    expect(result.paymentStatus).toBe('partially_paid');
  });

  it('handles zero payment as unpaid', () => {
    const result = BillingService.calculateOrderBilling(sampleItems, { type: 'none', value: 0 }, 0);

    expect(result.balancePaisa).toBe(155000);
    expect(result.paymentStatus).toBe('unpaid');
  });

  it('applies fixed discount correctly', () => {
    // 200 PKR discount = 20000 paisa
    const result = BillingService.calculateOrderBilling(sampleItems, { type: 'fixed', value: 20000 }, 135000);

    expect(result.subtotalPaisa).toBe(155000);
    expect(result.discountPaisa).toBe(20000);
    expect(result.finalTotalPaisa).toBe(135000);
    expect(result.paidPaisa).toBe(135000);
    expect(result.balancePaisa).toBe(0);
    expect(result.paymentStatus).toBe('paid');
  });

  it('applies percentage discount with deterministic integer rounding', () => {
    // 15% discount on 155000 paisa = 23250 paisa
    const result = BillingService.calculateOrderBilling(sampleItems, { type: 'percentage', value: 15 }, 131750);

    expect(result.discountPaisa).toBe(23250);
    expect(result.finalTotalPaisa).toBe(131750);
    expect(result.balancePaisa).toBe(0);
  });

  it('rejects fixed discount exceeding subtotal', () => {
    expect(() => {
      BillingService.calculateOrderBilling(sampleItems, { type: 'fixed', value: 200000 }, 0);
    }).toThrow(BillingError);
  });

  it('rejects percentage discount greater than 100 or less than 0', () => {
    expect(() => {
      BillingService.calculateOrderBilling(sampleItems, { type: 'percentage', value: 105 }, 0);
    }).toThrow(BillingError);

    expect(() => {
      BillingService.calculateOrderBilling(sampleItems, { type: 'percentage', value: -5 }, 0);
    }).toThrow(BillingError);
  });

  it('rejects overpayments', () => {
    expect(() => {
      BillingService.calculateOrderBilling(sampleItems, { type: 'none', value: 0 }, 160000);
    }).toThrow(/exceeds the invoice net total/);
  });

  it('rejects duplicate test selections in the same order', () => {
    const duplicateItems = [
      { testId: 1, testCode: 'CBC', testName: 'Complete Blood Count', pricePaisa: 120000, quantity: 1 },
      { testId: 1, testCode: 'CBC', testName: 'Complete Blood Count', pricePaisa: 120000, quantity: 1 },
    ];
    expect(() => {
      BillingService.calculateOrderBilling(duplicateItems, { type: 'none', value: 0 }, 0);
    }).toThrow(/Duplicate test selection detected/);
  });

  it('rejects order with no tests', () => {
    expect(() => {
      BillingService.calculateOrderBilling([], { type: 'none', value: 0 }, 0);
    }).toThrow(/at least one laboratory test/);
  });

  it('supports zero-priced promotional tests', () => {
    const promoItems = [
      { testId: 3, testCode: 'FREE', testName: 'Free Checkup', pricePaisa: 0, quantity: 1 },
    ];
    const result = BillingService.calculateOrderBilling(promoItems, { type: 'none', value: 0 }, 0);
    expect(result.subtotalPaisa).toBe(0);
    expect(result.finalTotalPaisa).toBe(0);
    expect(result.balancePaisa).toBe(0);
    expect(result.paymentStatus).toBe('paid');
  });
});

