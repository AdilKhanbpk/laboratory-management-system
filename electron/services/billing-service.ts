/**
 * Centralized Financial Billing Calculation Service
 *
 * Windows Offline Laboratory Management System
 * Guarantees integer minor currency arithmetic (Paisa), deterministic rounding,
 * and strict enforcement of financial invariants across the entire application.
 */

export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingError';
  }
}

export type DiscountType = 'none' | 'fixed' | 'percentage';

export interface DiscountConfig {
  type: DiscountType;
  value: number; // Paisa if fixed, percentage (0-100) if percentage
}

export interface BillingOrderItemInput {
  testId: number;
  testCode: string;
  testName: string;
  pricePaisa: number;
  quantity: number;
}

export interface BillingCalculationResult {
  subtotalPaisa: number;
  discountType: DiscountType;
  discountValue: number;
  discountPaisa: number;
  finalTotalPaisa: number;
  paidPaisa: number;
  balancePaisa: number;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  itemCalculations: Array<{
    testId: number;
    testCode: string;
    testName: string;
    priceSnapshotPaisa: number;
    quantity: number;
    itemSubtotalPaisa: number;
  }>;
}

export class BillingService {
  /**
   * Calculates subtotal, discount, final total, and balance with strict invariant checks.
   */
  public static calculateOrderBilling(
    items: BillingOrderItemInput[],
    discount: DiscountConfig = { type: 'none', value: 0 },
    paidAmountPaisa: number = 0
  ): BillingCalculationResult {
    if (!items || items.length === 0) {
      throw new BillingError('Order must contain at least one laboratory test.');
    }

    // Check duplicate tests
    const testIdSet = new Set<number>();
    for (const item of items) {
      if (testIdSet.has(item.testId)) {
        throw new BillingError(`Duplicate test selection detected for test ID ${item.testId}. Each test can only be ordered once per visit.`);
      }
      testIdSet.add(item.testId);
    }

    let subtotalPaisa = 0;
    const itemCalculations = items.map((item) => {
      if (!Number.isInteger(item.pricePaisa) || item.pricePaisa < 0) {
        throw new BillingError(`Invalid test price for "${item.testName}": Price must be a non-negative integer in minor units (paisa).`);
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BillingError(`Invalid quantity for "${item.testName}": Quantity must be a positive integer.`);
      }

      const itemSubtotal = item.pricePaisa * item.quantity;
      if (!Number.isSafeInteger(itemSubtotal)) {
        throw new BillingError(`Integer overflow detected calculating item subtotal for "${item.testName}".`);
      }

      subtotalPaisa += itemSubtotal;
      if (!Number.isSafeInteger(subtotalPaisa)) {
        throw new BillingError('Integer overflow detected calculating order subtotal.');
      }

      return {
        testId: item.testId,
        testCode: item.testCode,
        testName: item.testName,
        priceSnapshotPaisa: item.pricePaisa,
        quantity: item.quantity,
        itemSubtotalPaisa: itemSubtotal,
      };
    });

    // Discount Calculation
    let discountPaisa = 0;
    if (discount.type === 'fixed') {
      if (!Number.isInteger(discount.value) || discount.value < 0) {
        throw new BillingError('Fixed discount amount must be a non-negative integer in minor units (paisa).');
      }
      if (discount.value > subtotalPaisa) {
        throw new BillingError(`Fixed discount (${discount.value / 100}) cannot exceed the order subtotal (${subtotalPaisa / 100}).`);
      }
      discountPaisa = discount.value;
    } else if (discount.type === 'percentage') {
      if (typeof discount.value !== 'number' || isNaN(discount.value) || discount.value < 0 || discount.value > 100) {
        throw new BillingError('Percentage discount must be between 0% and 100%.');
      }
      // Deterministic rounding to nearest paisa
      discountPaisa = Math.round((subtotalPaisa * discount.value) / 100);
      if (discountPaisa > subtotalPaisa) {
        discountPaisa = subtotalPaisa;
      }
    } else {
      discountPaisa = 0;
    }

    const finalTotalPaisa = subtotalPaisa - discountPaisa;

    // Payment validation
    if (!Number.isInteger(paidAmountPaisa) || paidAmountPaisa < 0) {
      throw new BillingError('Paid amount must be a non-negative integer in minor units (paisa).');
    }

    if (paidAmountPaisa > finalTotalPaisa) {
      throw new BillingError(`Payment amount (${paidAmountPaisa / 100}) exceeds the invoice net total (${finalTotalPaisa / 100}). Overpayments are not permitted.`);
    }

    const balancePaisa = finalTotalPaisa - paidAmountPaisa;

    let paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
    if (finalTotalPaisa === 0 || paidAmountPaisa === finalTotalPaisa) {
      paymentStatus = 'paid';
    } else if (paidAmountPaisa > 0) {
      paymentStatus = 'partially_paid';
    } else {
      paymentStatus = 'unpaid';
    }

    return {
      subtotalPaisa,
      discountType: discount.type,
      discountValue: discount.value,
      discountPaisa,
      finalTotalPaisa,
      paidPaisa: paidAmountPaisa,
      balancePaisa,
      paymentStatus,
      itemCalculations,
    };
  }
}

