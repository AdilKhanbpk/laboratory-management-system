import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats integer minor currency units (e.g., paisa for PKR) into human-readable currency.
 * 100 paisa = 1 PKR.
 */
export function formatCurrency(paisa: number, currencyCode = 'PKR'): string {
  const rupees = paisa / 100;
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Converts decimal currency string to integer minor units (paisa) without float errors.
 */
export function parseCurrencyToPaisa(val: string | number): number {
  if (typeof val === 'number') {
    return Math.round(val * 100);
  }
  const clean = val.replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Formats UTC ISO-8601 string into the computer's local timezone.
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Calculates detailed age from date of birth (YYYY-MM-DD).
 */
export function calculateAge(dobString: string | null | undefined): {
  years: number;
  months: number;
  days: number;
  formatted: string;
} | null {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  if (dob > now) return null;

  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  let days = now.getDate() - dob.getDate();

  if (days < 0) {
    months--;
    const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  let formatted = '';
  if (years > 0) {
    formatted = `${years} yr${years > 1 ? 's' : ''}${months > 0 ? ` ${months} mo` : ''}`;
  } else if (months > 0) {
    formatted = `${months} month${months > 1 ? 's' : ''}${days > 0 ? ` ${days} d` : ''}`;
  } else {
    formatted = `${days} day${days !== 1 ? 's' : ''}`;
  }

  return { years, months, days, formatted };
}
