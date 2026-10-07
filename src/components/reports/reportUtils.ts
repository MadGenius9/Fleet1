/**
 * Helper utilities for Fleet 1 Print Reports
 */

import type { PumpOpsEvent, PumpOpStatus, ShiftType, SpotCheckHoleResult } from '../../types';
import { extractStationNumber } from '../../context/FleetContext';

export type IssueDisplayStatus = 'SPOT CHECK' | 'DOWN' | 'REPAIRING' | 'DERATED' | 'WATCH' | 'RUNNING';

/**
 * Shared helper to resolve user-facing display status label across all screens.
 * When eventType === 'spot_check' and not resolved, returns 'SPOT CHECK'.
 */
export function getIssueDisplayStatus(event?: {
  eventType?: string;
  status?: string;
  resolvedAt?: number | null;
} | null): IssueDisplayStatus {
  if (!event) return 'RUNNING';
  if (event.eventType === 'spot_check' && !event.resolvedAt) {
    return 'SPOT CHECK';
  }
  return (event.status as IssueDisplayStatus) || 'RUNNING';
}

export interface DownEquipmentItem {
  id: string;
  station: string;
  stationNumberOnly: string | number;
  pump: string;
  status: 'DOWN' | 'REPAIRING' | 'DERATED' | 'WATCH';
  displayStatus: IssueDisplayStatus;
  startedAt: number;
  downtimeMinutes: number;
  compactDowntime: string;
  startTimeStr: string;
  issue: string;
  category?: string;
  component?: string;
  holes?: number[];
  limitation?: string;
  stage?: number | string | null;
  date?: string;
  shift?: ShiftType;
  rawNotes: string;
  notes: string; // compact / truncated for 1-page fit
  rawEvent?: PumpOpsEvent;
  _pendingSync?: boolean;
}

/**
 * Truncate long notes gracefully for print layout
 */
export function truncatePrintNote(note: string | undefined | null, maxChars = 85): string {
  if (!note) return '—';
  const trimmed = note.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.substring(0, maxChars - 1).trim()}…`;
}

/**
 * Compact downtime formatter: "12m", "47m", "1h 14m", "2h"
 */
export function formatCompactDowntime(startedAt?: number | null, now = Date.now()): {
  duration: string;
  startTime: string;
  minutes: number;
} {
  if (!startedAt) return { duration: '—', startTime: '', minutes: 0 };
  const minutes = Math.max(1, Math.round((now - startedAt) / 60000));

  let duration = '';
  if (minutes < 60) {
    duration = `${minutes}m`;
  } else {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    duration = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  const d = new Date(startedAt);
  const startTime = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return { duration, startTime, minutes };
}

/**
 * Compact issue description formatter
 * Examples:
 * - Fluid End Packing Hole 3 -> "Packing — H3"
 * - Fluid End D-Rings Holes 3, 5 -> "D-Rings — H3, H5"
 * - Derated with limitation -> "RPM issue (Limited output)" or "RPM issue"
 */
export function formatCompactIssue(ev: {
  category?: string;
  component?: string;
  holes?: number[];
  limitation?: string;
  eventType?: string;
  checks?: SpotCheckHoleResult[];
  notes?: string;
}): string {
  if (ev.eventType === 'spot_check') {
    if (ev.checks && ev.checks.length > 0) {
      const findings = ev.checks
        .filter((c) => c.condition !== 'GOOD')
        .map((c) => {
          const cond = c.condition === 'WATCH' ? 'Watch' : 'Bad';
          const part = c.part ? ` — ${c.part === 'VALVE' ? 'Valve' : c.part === 'SEAT' ? 'Seat' : 'V&S'}` : '';
          return `H${c.hole} ${cond}${part}`;
        });
      if (findings.length > 0) {
        return `V&S — ${findings.join(', ')}`;
      }
      return 'V&S — All Good';
    }
    return 'V&S — Results Pending';
  }

  const cat = (ev.category || '').toUpperCase().trim();
  const comp = (ev.component || '').trim();
  const holesStr =
    ev.holes && ev.holes.length > 0
      ? ev.holes.length === 1
        ? `H${ev.holes[0]}`
        : `H${ev.holes.join(', H')}`
      : '';

  const formatTitle = (str: string) => {
    if (!str) return '';
    return str
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .replace(/D-rings/i, 'D-Rings')
      .replace(/V&s/i, 'V&S')
      .replace(/Valve\s*\/\s*seat/i, 'Valve / Seat');
  };

  const niceComp = formatTitle(comp);

  if (cat === 'FLUID END' || (!cat && comp)) {
    if (niceComp && holesStr) {
      return `${niceComp} — ${holesStr}`;
    }
    if (niceComp) return niceComp;
    if (holesStr) return `Fluid End — ${holesStr}`;
    return 'Fluid End Issue';
  }

  if (cat === 'POWER END') {
    return niceComp ? `Power End — ${niceComp}` : 'Power End Issue';
  }

  if (cat.includes('ENGINE')) {
    if (niceComp && niceComp.toLowerCase() !== 'other') {
      return `Engine — ${niceComp}`;
    }
    if (cat.includes('OTHER') || (niceComp && niceComp.toLowerCase() === 'other')) {
      return 'Engine / Other';
    }
    if (ev.limitation) return `Engine — ${ev.limitation}`;
    return 'Engine Issue';
  }

  if (cat === 'TRANSMISSION') {
    return niceComp ? `Transmission — ${niceComp}` : 'Transmission Issue';
  }

  if (ev.limitation) {
    return niceComp ? `${niceComp} (${ev.limitation})` : ev.limitation;
  }

  if (niceComp) return niceComp;
  if (cat) return formatTitle(cat);
  return 'Active Issue';
}

/**
 * Priority sort order for abnormal equipment:
 * 1. DOWN
 * 2. REPAIRING
 * 3. DERATED
 * 4. WATCH
 *
 * Within the same status: longest active downtime first (greatest minutes first).
 */
export function sortDownEquipmentByPriority(items: DownEquipmentItem[]): DownEquipmentItem[] {
  const priorityMap: Record<DownEquipmentItem['status'], number> = {
    DOWN: 1,
    REPAIRING: 2,
    DERATED: 3,
    WATCH: 4,
  };

  return [...items].sort((a, b) => {
    const prioA = priorityMap[a.status] || 99;
    const prioB = priorityMap[b.status] || 99;

    if (prioA !== prioB) {
      return prioA - prioB;
    }

    // Within same status, sort by longest downtime first
    return b.downtimeMinutes - a.downtimeMinutes;
  });
}

export interface ActiveEquipmentExtractOptions {
  filterDate?: string;
  filterShift?: ShiftType;
}

/**
 * Common derivation function for active abnormal equipment issues
 * Used by:
 * - MechanicsView
 * - DownEquipmentPrintReport
 * - PrintView
 */
export function extractActiveEquipmentIssues(
  pumpOpsEvents: PumpOpsEvent[],
  getStationForPump: (pumpName: string) => string | null,
  options?: ActiveEquipmentExtractOptions
): DownEquipmentItem[] {
  // Sort all pumpOpsEvents chronologically
  let events = [...pumpOpsEvents].sort((a, b) => a.startedAt - b.startedAt);

  // If specific date/shift filter is requested
  if (options?.filterDate && options?.filterShift) {
    events = events.filter(
      (ev) => ev.date === options.filterDate && ev.shift === options.filterShift
    );
  }

  // Map eventId -> active issue event (supports multiple independent issues per pump)
  const activeEventsMap = new Map<string, PumpOpsEvent>();
  // Map eventId -> active watch event
  const watchEventsMap = new Map<string, PumpOpsEvent>();

  events.forEach((ev) => {
    if (!ev.id) return;

    const isResolved = Boolean(ev.resolvedAt || ev.eventType === 'returned_to_service');
    if (isResolved) {
      activeEventsMap.delete(ev.id);
      watchEventsMap.delete(ev.id);
    } else if (ev.status === 'DOWN' || ev.status === 'REPAIRING' || ev.status === 'DERATED') {
      activeEventsMap.set(ev.id, ev);
      watchEventsMap.delete(ev.id);
    } else if (ev.watchNextShift) {
      if (!activeEventsMap.has(ev.id)) {
        watchEventsMap.set(ev.id, ev);
      }
    } else {
      activeEventsMap.delete(ev.id);
      watchEventsMap.delete(ev.id);
    }
  });

  const items: DownEquipmentItem[] = [];

  activeEventsMap.forEach((ev) => {
    const stationRaw = ev.station || getStationForPump(ev.pump) || 'Standby';
    const stationNum = extractStationNumber(stationRaw);
    const stationDisplay = stationNum !== 9999 ? stationNum : stationRaw.replace(/^Station\s*/i, '');
    const downStart = ev.downAt || ev.startedAt;
    const dt = formatCompactDowntime(downStart);
    const issueStr = formatCompactIssue(ev);
    const notesRaw = ev.notes || '';
    const notesTruncated = truncatePrintNote(notesRaw, 110);

    const displayStatus = getIssueDisplayStatus(ev);

    items.push({
      id: ev.id,
      station: stationRaw,
      stationNumberOnly: stationDisplay,
      pump: ev.pump,
      status: ev.status as 'DOWN' | 'REPAIRING' | 'DERATED',
      displayStatus,
      startedAt: downStart,
      downtimeMinutes: dt.minutes,
      compactDowntime: dt.duration,
      startTimeStr: dt.startTime,
      issue: issueStr,
      category: ev.category,
      component: ev.component,
      holes: ev.holes,
      limitation: ev.limitation,
      stage: ev.stage,
      date: ev.date,
      shift: ev.shift,
      rawNotes: notesRaw,
      notes: notesTruncated,
      rawEvent: ev,
      _pendingSync: Boolean(ev._pendingSync),
    });
  });

  watchEventsMap.forEach((ev) => {
    const stationRaw = ev.station || getStationForPump(ev.pump) || 'Standby';
    const stationNum = extractStationNumber(stationRaw);
    const stationDisplay = stationNum !== 9999 ? stationNum : stationRaw.replace(/^Station\s*/i, '');
    const downStart = ev.downAt || ev.startedAt;
    const dt = formatCompactDowntime(downStart);
    const issueStr = formatCompactIssue(ev);
    const notesRaw = ev.notes || '';
    const notesTruncated = truncatePrintNote(notesRaw, 110);
    const displayStatus = getIssueDisplayStatus(ev);

    items.push({
      id: ev.id,
      station: stationRaw,
      stationNumberOnly: stationDisplay,
      pump: ev.pump,
      status: 'WATCH',
      displayStatus,
      startedAt: downStart,
      downtimeMinutes: dt.minutes,
      compactDowntime: dt.duration,
      startTimeStr: dt.startTime,
      issue: issueStr,
      category: ev.category,
      component: ev.component,
      holes: ev.holes,
      limitation: ev.limitation,
      stage: ev.stage,
      date: ev.date,
      shift: ev.shift,
      rawNotes: notesRaw,
      notes: notesTruncated,
      rawEvent: ev,
      _pendingSync: Boolean(ev._pendingSync),
    });
  });

  return sortDownEquipmentByPriority(items);
}

/**
 * Injects a temporary <style> tag to enforce print orientation & margins
 */
export function applyPrintPageStyle(orientation: 'portrait' | 'landscape') {
  const styleId = 'fleet-print-page-orientation-style';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  if (orientation === 'landscape') {
    styleEl.innerHTML = `
      @media print {
        @page {
          size: Letter landscape !important;
          margin: 0.35in !important;
        }
      }
    `;
  } else {
    styleEl.innerHTML = `
      @media print {
        @page {
          size: Letter portrait !important;
          margin: 0.3in 0.35in !important;
        }
      }
    `;
  }
}
