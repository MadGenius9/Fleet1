import type { MaintenanceLog, ShiftType } from '../types';
import { getShiftChronologicalKey } from './shifts';

export function findPreviousReading(logs: MaintenanceLog[], pumpNumber: string, beforeDate: string, beforeShift: ShiftType) {
  if (!pumpNumber) return null;
  const cleanPump = pumpNumber.trim().toLowerCase();
  const targetKey = getShiftChronologicalKey(beforeDate, beforeShift);

  // Filter all logs for this pump with date+shift strictly < targetKey that have at least one reading
  const matching = logs.filter((l) => {
    if (l.pumpNumber.trim().toLowerCase() !== cleanPump) return false;
    const logKey = getShiftChronologicalKey(l.date, l.shift);
    if (logKey >= targetKey) return false;
    return l.pumpHours !== null || l.deckEngHours !== null;
  });

  if (matching.length === 0) return null;

  // Sort descending by chronological key, then updatedAt
  matching.sort((a, b) => {
    const keyA = getShiftChronologicalKey(a.date, a.shift);
    const keyB = getShiftChronologicalKey(b.date, b.shift);
    const comp = keyB.localeCompare(keyA);
    if (comp !== 0) return comp;
    return b.updatedAt - a.updatedAt;
  });

  // Independently find the most recent valid previous pumpHours reading
  const latestPumpLog = matching.find((l) => l.pumpHours !== null && l.pumpHours !== undefined);

  // Independently find the most recent valid previous deckEngHours reading
  const latestDeckLog = matching.find((l) => l.deckEngHours !== null && l.deckEngHours !== undefined);

  if (!latestPumpLog && !latestDeckLog) return null;

  return {
    pumpHours: latestPumpLog ? latestPumpLog.pumpHours : null,
    deckEngHours: latestDeckLog ? latestDeckLog.deckEngHours : null,
    date: latestPumpLog?.date || latestDeckLog?.date || beforeDate,
    shift: latestPumpLog?.shift || latestDeckLog?.shift || beforeShift,
  };
}
