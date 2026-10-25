import { describe, it, expect } from 'vitest';
import { RangeMatcher, ParameterRangeRule } from '../../electron/services/range-matcher';

describe('Unit: Clinical Range Matcher & Precision Engine', () => {
  const sampleHemoglobinRanges: ParameterRangeRule[] = [
    {
      id: 1,
      parameter_id: 10,
      gender: 'male',
      min_age_days: 365 * 15, // > 15 years
      max_age_days: 47450,
      normal_low: 13.0,
      normal_high: 17.5,
      panic_low: 7.0,
      panic_high: 20.0,
      display_text: '13.0 - 17.5 g/dL',
    },
    {
      id: 2,
      parameter_id: 10,
      gender: 'female',
      min_age_days: 365 * 15,
      max_age_days: 47450,
      normal_low: 12.0,
      normal_high: 15.5,
      panic_low: 7.0,
      panic_high: 19.0,
      display_text: '12.0 - 15.5 g/dL',
    },
    {
      id: 3,
      parameter_id: 10,
      gender: 'all',
      min_age_days: 0,
      max_age_days: 365 * 15 - 1, // Children
      normal_low: 11.5,
      normal_high: 14.5,
      panic_low: 6.5,
      panic_high: 18.0,
      display_text: '11.5 - 14.5 g/dL',
    },
  ];

  it('matches male adult reference range and flags normal result', () => {
    const evalRes = RangeMatcher.evaluateResult(
      '14.5',
      'numeric',
      'g/dL',
      sampleHemoglobinRanges,
      {
        gender: 'male',
        dateOfBirth: '1990-01-01',
        orderDate: '2026-10-22',
      }
    );

    expect(evalRes.isValid).toBe(true);
    expect(evalRes.flag).toBe('normal');
    expect(evalRes.numericValue).toBe(14.5);
    expect(evalRes.referenceRangeDisplay).toBe('13.0 - 17.5 g/dL');
  });

  it('flags low value when below normal_low', () => {
    const evalRes = RangeMatcher.evaluateResult(
      '10.2',
      'numeric',
      'g/dL',
      sampleHemoglobinRanges,
      {
        gender: 'male',
        dateOfBirth: '1990-01-01',
        orderDate: '2026-10-22',
      }
    );

    expect(evalRes.flag).toBe('low');
    expect(evalRes.numericValue).toBe(10.2);
  });

  it('flags high value when above normal_high', () => {
    const evalRes = RangeMatcher.evaluateResult(
      '18.2',
      'numeric',
      'g/dL',
      sampleHemoglobinRanges,
      {
        gender: 'male',
        dateOfBirth: '1990-01-01',
        orderDate: '2026-10-22',
      }
    );

    expect(evalRes.flag).toBe('high');
    expect(evalRes.numericValue).toBe(18.2);
  });

  it('flags critical / panic value when <= panic_low or >= panic_high', () => {
    const evalResPanicLow = RangeMatcher.evaluateResult(
      '6.8',
      'numeric',
      'g/dL',
      sampleHemoglobinRanges,
      {
        gender: 'male',
        dateOfBirth: '1990-01-01',
        orderDate: '2026-10-22',
      }
    );
    expect(evalResPanicLow.flag).toBe('critical');

    const evalResPanicHigh = RangeMatcher.evaluateResult(
      '20.5',
      'numeric',
      'g/dL',
      sampleHemoglobinRanges,
      {
        gender: 'male',
        dateOfBirth: '1990-01-01',
        orderDate: '2026-10-22',
      }
    );
    expect(evalResPanicHigh.flag).toBe('critical');
  });

  it('matches female adult range for female patient', () => {
    const evalRes = RangeMatcher.evaluateResult(
      '12.5',
      'numeric',
      'g/dL',
      sampleHemoglobinRanges,
      {
        gender: 'female',
        dateOfBirth: '1995-05-20',
        orderDate: '2026-10-22',
      }
    );

    expect(evalRes.referenceRangeDisplay).toBe('12.0 - 15.5 g/dL');
    expect(evalRes.flag).toBe('normal');
  });

  it('matches pediatric range for child under 15', () => {
    const evalRes = RangeMatcher.evaluateResult(
      '12.0',
      'numeric',
      'g/dL',
      sampleHemoglobinRanges,
      {
        gender: 'male',
        dateOfBirth: '2020-01-01', // ~6 years old
        orderDate: '2026-10-22',
      }
    );

    expect(evalRes.referenceRangeDisplay).toBe('11.5 - 14.5 g/dL');
    expect(evalRes.flag).toBe('normal');
  });

  it('handles boundary conditions properly (equal to boundary is normal)', () => {
    const evalResMin = RangeMatcher.evaluateResult(
      '13.0',
      'numeric',
      'g/dL',
      sampleHemoglobinRanges,
      { gender: 'male', dateOfBirth: '1990-01-01' }
    );
    expect(evalResMin.flag).toBe('normal');

    const evalResMax = RangeMatcher.evaluateResult(
      '17.5',
      'numeric',
      'g/dL',
      sampleHemoglobinRanges,
      { gender: 'male', dateOfBirth: '1990-01-01' }
    );
    expect(evalResMax.flag).toBe('normal');
  });

  it('rejects NaN, infinity, and invalid numeric input', () => {
    const evalResNaN = RangeMatcher.evaluateResult('abc', 'numeric', 'g/dL', sampleHemoglobinRanges, { gender: 'male' });
    expect(evalResNaN.isValid).toBe(false);
    expect(evalResNaN.validationError).toMatch(/Invalid numeric value/);

    const evalResInf = RangeMatcher.evaluateResult('Infinity', 'numeric', 'g/dL', sampleHemoglobinRanges, { gender: 'male' });
    expect(evalResInf.isValid).toBe(false);
  });

  it('handles unconfigured reference ranges gracefully', () => {
    const evalRes = RangeMatcher.evaluateResult('55.0', 'numeric', 'U/L', [], { gender: 'male' });
    expect(evalRes.flag).toBe('unconfigured');
    expect(evalRes.referenceRangeDisplay).toBe('Reference range not configured');
    expect(evalRes.isValid).toBe(true);
  });

  it('displays the configured reference range immediately even when value is empty', () => {
    const emptyEval = RangeMatcher.evaluateResult('', 'numeric', 'g/dL', sampleHemoglobinRanges, {
      gender: 'male',
      dateOfBirth: '1995-01-01',
    });
    expect(emptyEval.referenceRangeDisplay).toBe('13.0 - 17.5 g/dL');
    expect(emptyEval.matchedRangeRule).not.toBeNull();
    expect(emptyEval.flag).toBe('unconfigured');
  });

  it('evaluates text / qualitative parameters (e.g. Negative vs Positive)', () => {
    const textRanges: ParameterRangeRule[] = [
      {
        id: 99,
        parameter_id: 50,
        gender: 'all',
        min_age_days: 0,
        max_age_days: 47450,
        normal_low: null,
        normal_high: null,
        panic_low: null,
        panic_high: null,
        display_text: 'Negative',
      },
    ];

    const evalNegative = RangeMatcher.evaluateResult('Negative', 'text', null, textRanges, { gender: 'male' });
    expect(evalNegative.flag).toBe('normal');

    const evalPositive = RangeMatcher.evaluateResult('Positive', 'text', null, textRanges, { gender: 'male' });
    expect(evalPositive.flag).toBe('critical');
  });
});

