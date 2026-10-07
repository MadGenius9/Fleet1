import type { PumpOpsEvent } from '../types';

export class WriteConflictError extends Error {
  readonly isWriteConflict = true;
  constructor() {
    super('ISSUE CHANGED ON ANOTHER DEVICE. Review the latest issue before applying the edit again; queued conflicts remain stored.');
    this.name = 'WriteConflictError';
  }
}

const editableFields = new Set([
  'category', 'component', 'holes', 'limitation', 'notes', 'watchNextShift',
  'status', 'eventType', 'downAt', 'repairStartedAt', 'resolvedAt',
  'downtimeMinutes', 'checks', 'lastEditedAt', 'lastEditedBy',
]);
const metadataFields = new Set(['updatedAt', 'lastEditedAt', 'lastEditedBy']);
const equal = (key: string, a: unknown, b: unknown) => {
  const normalize = (value: unknown) => key === 'watchNextShift' ? Boolean(value) : value === '' ? null : value ?? null;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
};

/** Never resend untouched cached fields or allow edits to identity/opened time. */
export function buildEventPatch(existing: PumpOpsEvent, updates: Partial<PumpOpsEvent>, now: number) {
  const patch: Record<string, any> = {};
  const expected: Record<string, any> = { resolvedAt: existing.resolvedAt ?? null };
  for (const [key, value] of Object.entries(updates)) {
    if (!editableFields.has(key) || value === undefined || equal(key, existing[key as keyof PumpOpsEvent], value)) continue;
    patch[key] = value;
    if (!metadataFields.has(key)) expected[key] = existing[key as keyof PumpOpsEvent] ?? null;
  }
  patch.updatedAt = now;
  return { patch, expected };
}

/** Compare only changed fields so independent device edits remain independent. */
export function validateEventPatch(
  current: Record<string, any>, patch: Record<string, any>, expected: Record<string, any>,
): void {
  for (const [key, original] of Object.entries(expected)) {
    if (!equal(key, current[key], original) && !(key in patch && equal(key, current[key], patch[key]))) {
      throw new WriteConflictError();
    }
  }
}

export function getResolvedDowntime(event: PumpOpsEvent, now: number): number {
  const start = event.downAt ?? (['DOWN', 'REPAIRING'].includes(event.status) ? event.startedAt : null);
  return start === null ? 0 : Math.max(0, Math.round((now - start) / 60000));
}

export function getIssueStatusPatch(
  event: PumpOpsEvent, selected: 'DOWN' | 'REPAIRING' | 'DERATED' | 'WATCH', now: number,
): Partial<PumpOpsEvent> {
  const wasDown = event.status === 'DOWN' || event.status === 'REPAIRING';
  if (selected === 'DOWN' || selected === 'REPAIRING') {
    return {
      status: selected,
      eventType: event.eventType === 'spot_check' ? 'spot_check' : selected === 'DOWN' ? 'pump_down' : 'repair_started',
      downAt: wasDown ? event.downAt ?? event.startedAt : now,
      repairStartedAt: selected === 'REPAIRING' ? event.repairStartedAt ?? now : event.repairStartedAt,
    };
  }
  if (selected === 'DERATED') {
    return { status: 'DERATED', eventType: 'derated', downAt: wasDown ? event.downAt ?? event.startedAt : null };
  }
  return { status: 'RUNNING', eventType: 'watch_item', downAt: null };
}

export function getClearWatchPatch(event: PumpOpsEvent, now: number): Partial<PumpOpsEvent> {
  const watchOnly = !['DOWN', 'REPAIRING', 'DERATED'].includes(event.status);
  return { watchNextShift: false, ...(watchOnly ? { resolvedAt: now } : {}) };
}
