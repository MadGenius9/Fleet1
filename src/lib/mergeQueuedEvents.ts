import type { PumpOpsEvent, QueuedWrite } from '../types';

/** Recover durable edits after reload without copying stale untouched local fields. */
export function mergeQueuedEvents(server: PumpOpsEvent[], local: PumpOpsEvent[], queue: QueuedWrite[]): PumpOpsEvent[] {
  const serverIds = new Set(server.map((event) => event.id));
  const events = new Map(server.map((event) => [event.id, { ...event }]));
  for (const event of local) {
    if (event._pendingSync && !events.has(event.id)) events.set(event.id, event);
  }
  for (const item of queue) {
    if (!item.path.includes('/pumpOpsEvents/') || !item.data || item.isConflict) continue;
    const id = item.path.split('/').pop();
    if (!id) continue;
    const existing = events.get(id);
    // An acknowledged create retry must not overwrite later server edits.
    if (item.type === 'set' && serverIds.has(id)) continue;
    if (existing || item.type === 'set') {
      events.set(id, { ...existing, ...item.data, id, _pendingSync: true } as PumpOpsEvent);
    }
  }
  return [...events.values()].sort((a, b) => b.startedAt - a.startedAt);
}
