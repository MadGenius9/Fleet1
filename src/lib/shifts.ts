import type { ShiftType, ShiftWithLegacy } from '../types';

/**
 * Frac spread shift detection:
 * Day Shift: 5:30 AM (05:30) to 5:30 PM (17:30)
 * Night Shift: 5:30 PM (17:30) to 5:30 AM (05:30 next day)
 */
export function getOperationalShift(date: Date = new Date()): ShiftType {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  // 5:30 AM = 330 minutes, 5:30 PM = 1050 minutes
  return totalMinutes >= 330 && totalMinutes < 1050 ? 'day' : 'night';
}

/**
 * Operational date for Frac Spreads:
 * An overnight Night Shift (between 12:00 AM midnight and 5:29:59 AM)
 * belongs to the date the shift started (the prior calendar day).
 */
export function getOperationalDate(date: Date = new Date()): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const d = new Date(date);
  if (totalMinutes < 330) {
    // Before 5:30 AM: This is the night shift that began yesterday at 5:30 PM
    d.setDate(d.getDate() - 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDefaultShift(date: Date = new Date()): ShiftType {
  return getOperationalShift(date);
}

export function getShiftChronologicalKey(date: string, shift?: ShiftWithLegacy): string {
  // Day shift is chronologically 1, Night shift is chronologically 2
  // Legacy or unknown records are ordered as 0 so they don't precede today's Day shift
  let order = '0';
  if (shift === 'night') order = '2';
  else if (shift === 'day') order = '1';
  return `${date}_${order}`;
}

export function getLogDocIdWithShift(
  date: string,
  shift: ShiftType,
  stationNumber: string,
  pumpNumber: string
): string {
  const sanitize = (val: string) => (val || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanShift = sanitize(shift || 'day').toLowerCase();
  return `${date}_${cleanShift}_${sanitize(stationNumber)}_${sanitize(pumpNumber)}`.slice(0, 120);
}

export function getLogDocId(date: string, shift: ShiftType, stationNumber: string, pumpNumber: string): string;
export function getLogDocId(date: string, stationNumber: string, pumpNumber: string): string;
export function getLogDocId(
  date: string,
  arg2: string,
  arg3: string,
  arg4?: string
): string {
  const sanitize = (val: string) => (val || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (arg4 !== undefined) {
    const cleanShift = sanitize(arg2 || 'day').toLowerCase();
    return `${date}_${cleanShift}_${sanitize(arg3)}_${sanitize(arg4)}`.slice(0, 120);
  }
  return `${date}_${sanitize(arg2)}_${sanitize(arg3)}`.slice(0, 120);
}

