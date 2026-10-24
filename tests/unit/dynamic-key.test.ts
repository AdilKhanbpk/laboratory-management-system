import { describe, it, expect } from 'vitest';
import {
  generateDynamicHourlyKey,
  validateDynamicHourlyKey,
  getMinutesRemainingInCurrentHour,
} from '../../electron/security/dynamic-key';

describe('Security: Dynamic Hourly 100-Digit Authorization Key', () => {
  it('generates a key of exactly 100 characters containing the user specified date/time components', () => {
    // Test on a fixed known date: October 24, 2026 at 3:00 PM (15:00)
    // Month = oct (m0='o', m1='c', m2='t')
    // Day = 24 (d0='2', d1='4')
    // Year = 2026 (y0='2', y1='0', y2='2', y3='6')
    // Hour = 3 PM (hour12=3, h1='3')
    const testDate = new Date(2026, 9, 24, 15, 0, 0); // month is 0-indexed (9 = Oct)

    const key = generateDynamicHourlyKey(testDate);

    expect(key).toHaveLength(100);

    // Matches specified start: oqjdfhd2k88429-342oo0rmtvtqmz8733uercw252146
    const expectedPart1 = 'oqjdfhd2k88429-342oo0rmtvtqmz8733uercw252146';
    expect(key.startsWith(expectedPart1)).toBe(true);
  });

  it('validates the current key successfully and rejects invalid keys', () => {
    const currentKey = generateDynamicHourlyKey();
    const resultValid = validateDynamicHourlyKey(currentKey);
    expect(resultValid.valid).toBe(true);

    const resultInvalid = validateDynamicHourlyKey('invalid-key-attempt');
    expect(resultInvalid.valid).toBe(false);
    expect(resultInvalid.error).toContain('Invalid or Expired Dynamic Authorization Key');
  });

  it('rejects keys from different hours (past or future beyond grace period)', () => {
    // Key from 4 hours ago
    const pastDate = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const expiredKey = generateDynamicHourlyKey(pastDate);

    const resultExpired = validateDynamicHourlyKey(expiredKey);
    expect(resultExpired.valid).toBe(false);
  });

  it('reports positive minutes remaining in current hour', () => {
    const minutes = getMinutesRemainingInCurrentHour();
    expect(minutes).toBeGreaterThanOrEqual(1);
    expect(minutes).toBeLessThanOrEqual(60);
  });
});

