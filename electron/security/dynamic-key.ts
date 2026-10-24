/**
 * Dynamic Time-Based Authorization Key Generator
 *
 * Implements an hourly deterministic 100-character security token derived from
 * current Month, Day, Year, and Hour.
 *
 * Pattern inspired by operator specification:
 * `${m0}qjdfhd${d0}k88429-34${y0}oo${y1}rmtv${m2}qmz873${h1}uercw${y2}5214${y3}...`
 */

export function generateDynamicHourlyKey(date: Date = new Date()): string {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const m = months[date.getMonth()];
  const m0 = m[0]; // e.g. 'o'
  const m1 = m[1]; // e.g. 'c'
  const m2 = m[2]; // e.g. 't'

  const dayStr = String(date.getDate()).padStart(2, '0');
  const d0 = dayStr[0]; // e.g. '2'
  const d1 = dayStr[1]; // e.g. '4'

  const yearStr = String(date.getFullYear());
  const y0 = yearStr[0]; // '2'
  const y1 = yearStr[1]; // '0'
  const y2 = yearStr[2]; // '2'
  const y3 = yearStr[3]; // '6'

  const rawHour = date.getHours();
  const hour12 = rawHour % 12 || 12;
  const hour12Str = String(hour12).padStart(2, '0');
  const h0 = hour12Str[0]; // '0' or '1'
  const h1 = hour12Str[1]; // '0'..'9'
  const ampm = rawHour >= 12 ? 'pm' : 'am';

  // Section 1: User's exact specified template pattern (45 chars)
  const part1 = `${m0}qjdfhd${d0}k88429-34${y0}oo${y1}rmtv${m2}qmz873${h1}uercw${y2}5214${y3}`;

  // Section 2: Extended date-bound salt incorporating day second digit, month middle char, and am/pm (28 chars)
  const part2 = `_x9${d1}kp7${m1}b54w210z741${ampm}y96328`;

  // Section 3: Final deterministic padding incorporating full year, day, and 2-digit hour (27 chars)
  const part3 = `_sec${y0}${y1}${y2}${y3}k789${d0}${d1}p123${h0}${h1}w`;

  const key = `${part1}${part2}${part3}`;

  // Enforce exactly 100 characters
  if (key.length > 100) return key.substring(0, 100);
  if (key.length < 100) return key.padEnd(100, 'x');
  return key;
}

/**
 * Validates a submitted authorization key against the current hour (with a 10-minute grace window).
 */
export function validateDynamicHourlyKey(submittedKey: string | undefined | null): {
  valid: boolean;
  error?: string;
} {
  if (!submittedKey || typeof submittedKey !== 'string') {
    return { valid: false, error: 'Dynamic authorization key is required.' };
  }

  const cleanKey = submittedKey.trim();
  const now = new Date();

  // Primary check: Current hour
  const currentKey = generateDynamicHourlyKey(now);
  if (cleanKey === currentKey) {
    return { valid: true };
  }

  // Grace window: Previous hour (if within first 15 minutes of the current hour)
  if (now.getMinutes() <= 15) {
    const prevHour = new Date(now.getTime() - 60 * 60 * 1000);
    const prevKey = generateDynamicHourlyKey(prevHour);
    if (cleanKey === prevKey) {
      return { valid: true };
    }
  }

  return {
    valid: false,
    error: 'Invalid or Expired Dynamic Authorization Key. Please copy the current hour key from Developer Portal.',
  };
}

/**
 * Returns remaining minutes before the current hour key expires.
 */
export function getMinutesRemainingInCurrentHour(): number {
  const now = new Date();
  return 60 - now.getMinutes();
}

