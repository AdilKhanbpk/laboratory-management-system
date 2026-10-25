/**
 * Clinical Reference Range Matching & Validation Engine
 *
 * Windows Offline Laboratory Management System
 * Evaluates patient age, sex, and observed values against configured reference ranges.
 * Implements strict clinical invariants:
 * - Never invents clinical ranges or medical diagnoses.
 * - Handles boundary conditions (<=, >=).
 * - Identifies Normal, Low, High, and Critical / Panic states.
 */

export type ResultFlag = 'normal' | 'low' | 'high' | 'critical' | 'unconfigured';

export interface ParameterRangeRule {
  id: number;
  parameter_id: number;
  gender: 'all' | 'male' | 'female';
  min_age_days: number;
  max_age_days: number;
  normal_low: number | null;
  normal_high: number | null;
  panic_low: number | null;
  panic_high: number | null;
  display_text: string;
}

export interface PatientDemographics {
  gender: 'male' | 'female' | 'other';
  dateOfBirth?: string | null;
  orderDate?: string;
}

export interface EvaluationResult {
  flag: ResultFlag;
  numericValue: number | null;
  formattedDisplayValue: string;
  referenceRangeDisplay: string;
  unit: string | null;
  matchedRangeRule: ParameterRangeRule | null;
  isValid: boolean;
  validationError?: string;
}

export class RangeMatcher {
  /**
   * Calculates the exact age in days between dateOfBirth and orderDate.
   */
  public static calculateAgeInDays(dateOfBirth?: string | null, referenceDateStr?: string): number {
    if (!dateOfBirth) return 365 * 30; // Default to adult (approx 30 years) if DOB unknown
    const dob = new Date(dateOfBirth);
    const ref = referenceDateStr ? new Date(referenceDateStr) : new Date();

    if (isNaN(dob.getTime()) || isNaN(ref.getTime())) {
      return 365 * 30;
    }

    const diffMs = ref.getTime() - dob.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }

  /**
   * Finds the best-matching reference range for a parameter given patient demographics.
   * Specificity hierarchy:
   * 1. Exact gender match + matching age bracket
   * 2. 'all' gender match + matching age bracket
   * 3. Any active range for the parameter
   */
  public static findMatchingRange(
    ranges: ParameterRangeRule[],
    demographics: PatientDemographics
  ): ParameterRangeRule | null {
    if (!ranges || ranges.length === 0) return null;

    const patientAgeDays = this.calculateAgeInDays(demographics.dateOfBirth, demographics.orderDate);
    const gender = demographics.gender;

    // 1. Exact gender + age bracket
    const exactGenderAndAge = ranges.find(
      (r) =>
        r.gender === gender &&
        patientAgeDays >= r.min_age_days &&
        patientAgeDays <= r.max_age_days
    );
    if (exactGenderAndAge) return exactGenderAndAge;

    // 2. 'all' gender + age bracket
    const allGenderAndAge = ranges.find(
      (r) =>
        r.gender === 'all' &&
        patientAgeDays >= r.min_age_days &&
        patientAgeDays <= r.max_age_days
    );
    if (allGenderAndAge) return allGenderAndAge;

    // 3. Fallback: Exact gender any age
    const exactGenderAnyAge = ranges.find((r) => r.gender === gender);
    if (exactGenderAnyAge) return exactGenderAnyAge;

    // 4. Fallback: 'all' gender any age
    const anyRange = ranges.find((r) => r.gender === 'all');
    if (anyRange) return anyRange;

    // 5. First available range
    return ranges[0] || null;
  }

  /**
   * Evaluates an entered result value against matched reference ranges.
   */
  public static evaluateResult(
    rawValue: string,
    parameterType: 'numeric' | 'text' | 'options',
    unit: string | null,
    ranges: ParameterRangeRule[],
    demographics: PatientDemographics
  ): EvaluationResult {
    const trimmed = rawValue ? rawValue.trim() : '';
    const matchedRule = this.findMatchingRange(ranges, demographics);
    const rangeDisplay = matchedRule?.display_text || (ranges.length > 0 ? ranges[0].display_text : 'Reference range not configured');

    if (!trimmed) {
      return {
        flag: 'unconfigured',
        numericValue: null,
        formattedDisplayValue: '',
        referenceRangeDisplay: rangeDisplay,
        unit,
        matchedRangeRule: matchedRule,
        isValid: false,
        validationError: '',
      };
    }

    if (parameterType === 'numeric') {
      // Clean possible commas in European decimals or spaces
      const normalizedStr = trimmed.replace(',', '.');
      const parsedNum = Number(normalizedStr);

      if (!Number.isFinite(parsedNum) || isNaN(parsedNum)) {
        return {
          flag: 'unconfigured',
          numericValue: null,
          formattedDisplayValue: trimmed,
          referenceRangeDisplay: rangeDisplay,
          unit,
          matchedRangeRule: matchedRule,
          isValid: false,
          validationError: 'Invalid numeric value. Must be a finite number.',
        };
      }

      let flag: ResultFlag = 'normal';

      if (!matchedRule) {
        flag = 'unconfigured';
      } else {
        // Critical / Panic bounds first
        const isPanicLow = matchedRule.panic_low !== null && parsedNum <= matchedRule.panic_low;
        const isPanicHigh = matchedRule.panic_high !== null && parsedNum >= matchedRule.panic_high;

        if (isPanicLow || isPanicHigh) {
          flag = 'critical';
        } else {
          // Normal range bounds
          const isLow = matchedRule.normal_low !== null && parsedNum < matchedRule.normal_low;
          const isHigh = matchedRule.normal_high !== null && parsedNum > matchedRule.normal_high;

          if (isLow) {
            flag = 'low';
          } else if (isHigh) {
            flag = 'high';
          } else {
            flag = 'normal';
          }
        }
      }

      return {
        flag,
        numericValue: parsedNum,
        formattedDisplayValue: normalizedStr,
        referenceRangeDisplay: rangeDisplay,
        unit,
        matchedRangeRule: matchedRule,
        isValid: true,
      };
    } else {
      // Text or options parameter
      let flag: ResultFlag = 'normal';

      if (!matchedRule) {
        flag = 'unconfigured';
      } else {
        const expected = matchedRule.display_text.trim().toLowerCase();
        const actual = trimmed.toLowerCase();

        if (expected === 'negative' && actual === 'positive') {
          flag = 'critical';
        } else if (expected === 'non-reactive' && actual === 'reactive') {
          flag = 'critical';
        } else if (expected && actual !== expected) {
          flag = 'high';
        } else {
          flag = 'normal';
        }
      }

      return {
        flag,
        numericValue: null,
        formattedDisplayValue: trimmed,
        referenceRangeDisplay: rangeDisplay,
        unit,
        matchedRangeRule: matchedRule,
        isValid: true,
      };
    }
  }
}

