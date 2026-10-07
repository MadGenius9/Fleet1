import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flushQueueBatch } from './lib/offlineQueue';
import { buildEventPatch, validateEventPatch, WriteConflictError, getIssueStatusPatch, getClearWatchPatch, getResolvedDowntime } from './lib/eventMutations';
import { applyFleetMutation, AssignmentConflictError } from './lib/fleetMutations';
import { findPreviousReading } from './lib/readings';
import { extractActiveEquipmentIssues, getIssueDisplayStatus } from './components/reports/reportUtils';
import type { QueuedWrite, PumpOpsEvent, MaintenanceLog, FleetDoc } from './types';

const event = (overrides: Partial<PumpOpsEvent> = {}): PumpOpsEvent => ({
  id: 'issue-95', pump: '95', station: 'Station 4', date: '2026-10-06', shift: 'night',
  eventType: 'derated', status: 'DERATED', startedAt: 1000, createdAt: 1000, updatedAt: 1000,
  operator: 'Operator', notes: 'Original', resolvedAt: null, ...overrides,
});
const write = (id: string, path = 'fleets/fleet1/logs/log1'): QueuedWrite => ({
  id, path, type: 'set', timestamp: 1, retryCount: 0, data: { pumpHours: 100 },
});

test('flush preserves writes enqueued while network requests are in flight', async () => {
  let queue = [write('first')];
  const result = await flushQueueBatch(() => queue, (next) => { queue = next; }, async () => {
    queue.push(write('new'));
  });
  assert.deepEqual(result, { successful: 1, failed: 0 });
  assert.deepEqual(queue.map((q) => q.id), ['new']);
});

test('failed write blocks later writes to its path but allows independent records', async () => {
  let queue = [write('first'), write('later'), write('independent', 'fleets/fleet1/logs/log2')];
  const executed: string[] = [];
  const result = await flushQueueBatch(() => queue, (next) => { queue = next; }, async (item) => {
    executed.push(item.id);
    if (item.id === 'first') throw new Error('network timeout');
  });
  assert.deepEqual(executed, ['first', 'independent']);
  assert.deepEqual(result, { successful: 1, failed: 1 });
  assert.equal(queue[0].lastError, 'network timeout');
  assert.equal(queue.length, 2);
  await flushQueueBatch(() => queue, (next) => { queue = next; }, async () => {});
  assert.equal(queue.length, 0);
});

test('permanent conflicts stay recoverable and are not automatically retried', async () => {
  let queue = [write('conflict')];
  await flushQueueBatch(() => queue, (next) => { queue = next; }, async () => { throw new WriteConflictError(); });
  assert.equal(queue[0].isConflict, true);
  assert.equal(queue[0].retryCount, 1);
  await flushQueueBatch(() => queue, (next) => { queue = next; }, async () => { assert.fail('must not retry conflict'); });
  assert.equal(queue.length, 1);
});

test('storage failure surfaces instead of claiming writes are safely saved', async () => {
  const queue = [write('first')];
  await assert.rejects(flushQueueBatch(() => queue, () => { throw new Error('storage full'); }, async () => {}), /storage full/);
  assert.equal(queue.length, 1);
});

test('issue patches preserve identity and omit unchanged cached fields', () => {
  const original = event();
  const { patch } = buildEventPatch(original, { ...original, notes: 'Edited', id: 'bad', createdAt: 999, startedAt: 999 }, 2000);
  assert.deepEqual(patch, { notes: 'Edited', updatedAt: 2000 });
});

test('independent issue edits preserve newer server status and reject same-field conflicts', () => {
  const { patch, expected } = buildEventPatch(event(), { notes: 'Edited' }, 2000);
  validateEventPatch({ ...event(), status: 'DOWN', downAt: 1500 }, patch, expected);
  assert.throws(() => validateEventPatch({ ...event(), notes: 'Another edit' }, patch, expected), WriteConflictError);
  assert.throws(() => validateEventPatch({ ...event(), resolvedAt: 1800 }, patch, expected), WriteConflictError);
  validateEventPatch({ ...event(), ...patch }, patch, expected); // retry after ambiguous success
});

test('DERATED and WATCH transition to DOWN at actual transition time', () => {
  for (const original of [event(), event({ status: 'RUNNING', eventType: 'watch_item' })]) {
    const patch = getIssueStatusPatch(original, 'DOWN', 2000);
    assert.equal(patch.downAt, 2000);
    assert.equal(patch.status, 'DOWN');
    assert.equal({ ...original, ...patch }.id, original.id);
  }
  assert.equal(getIssueStatusPatch(event({ status: 'DOWN', downAt: 1500 }), 'REPAIRING', 2000).downAt, 1500);
});

test('clearing Watch resolves only Watch-only items', () => {
  for (const status of ['DOWN', 'REPAIRING', 'DERATED'] as const) {
    const patch = getClearWatchPatch(event({ status, watchNextShift: true }), 2000);
    assert.equal(patch.watchNextShift, false);
    assert.equal(patch.resolvedAt, undefined);
  }
  assert.equal(getClearWatchPatch(event({ status: 'RUNNING', eventType: 'watch_item' }), 2000).resolvedAt, 2000);
});

test('Spot Check is active immediately; results update same event without restarting downtime', () => {
  const original = event({ eventType: 'spot_check', status: 'DOWN', downAt: 1000, checks: [] });
  assert.equal(getIssueDisplayStatus(original), 'SPOT CHECK');
  assert.equal(extractActiveEquipmentIssues([original], () => 'Station 4').length, 1);
  const { patch } = buildEventPatch(original, { checks: [{ hole: 3, condition: 'BAD', part: 'SEAT' }] }, 2000);
  const updated = { ...original, ...patch };
  assert.equal(updated.id, original.id);
  assert.equal(updated.downAt, 1000);
  assert.equal(getIssueStatusPatch(original, 'DOWN', 2000).eventType, 'spot_check');
  const resolved = { ...updated, status: 'RUNNING' as const, resolvedAt: 121000 };
  assert.equal(getResolvedDowntime(original, 121000), 2);
  assert.equal(extractActiveEquipmentIssues([resolved], () => 'Station 4').length, 0);
});

test('return to service uses downAt; never-down DERATED has zero downtime', () => {
  assert.equal(getResolvedDowntime(event({ status: 'DOWN', downAt: 61000 }), 121000), 1);
  assert.equal(getResolvedDowntime(event(), 121000), 0);
});

const fleet: FleetDoc = { name: 'Fleet 1', stations: ['Station 6'], pumps: ['155', '184', '196'], stationPumps: { 'Station 6': ['155'] } };
test('stale swap conflicts and a retry of an already-applied swap is idempotent', () => {
  const swap = { type: 'swap-pump' as const, station: 'Station 6', oldPump: '155', newPump: '184' };
  const current = applyFleetMutation(fleet, swap);
  assert.deepEqual(current.stationPumps?.['Station 6'], ['184']);
  assert.deepEqual(applyFleetMutation(current, swap), current);
  assert.throws(() => applyFleetMutation(current, { ...swap, newPump: '196' }), AssignmentConflictError);
  assert.deepEqual(current.stationPumps?.['Station 6'], ['184']);
});

test('offline assignment to a previously empty station rejects a newer server assignment', () => {
  assert.throws(() => applyFleetMutation(fleet, { type: 'assign-pump', station: 'Station 6', pump: '196', expectedOldPump: '' }), AssignmentConflictError);
});

test('previous Pump and Deck readings are independent and zero remains valid', () => {
  const log = (date: string, pumpHours: number | null, deckEngHours: number | null): MaintenanceLog => ({
    id: date, date, shift: 'day', stationNumber: 'Station 6', pumpNumber: '155', pumpHours, deckEngHours,
    enteredBy: 'Operator', createdAt: 1, updatedAt: 1,
  });
  const result = findPreviousReading([log('2026-10-04', 90, 500), log('2026-10-05', 0, null)], '155', '2026-10-06', 'day');
  assert.equal(result?.pumpHours, 0);
  assert.equal(result?.deckEngHours, 500);
});

test('server snapshots retain independent fields while recovering queued patches', async () => {
  const { mergeQueuedEvents } = await import('./lib/mergeQueuedEvents');
  const old = event({ _pendingSync: true });
  const server = event({ status: 'DOWN', downAt: 1500 });
  const queue = [{ ...write('edit', `fleets/fleet1/pumpOpsEvents/${old.id}`), type: 'event-update' as const, data: { notes: 'Edited' } }];
  const merged = mergeQueuedEvents([server], [old], queue)[0];
  assert.equal(merged.status, 'DOWN');
  assert.equal(merged.downAt, 1500);
  assert.equal(merged.notes, 'Edited');
  const conflicted = mergeQueuedEvents([server], [old], [{ ...queue[0], isConflict: true }])[0];
  assert.equal(conflicted.notes, server.notes);
  const createRetry = mergeQueuedEvents([server], [old], [{ ...queue[0], type: 'set', data: old }])[0];
  assert.equal(createRetry.status, 'DOWN');
});

test('cleared optional fields and legacy missing Watch flags do not cause false conflicts', () => {
  const original = event({ notes: undefined, watchNextShift: false });
  const { patch, expected } = buildEventPatch(original, { notes: 'New note', watchNextShift: true }, 2000);
  validateEventPatch({ ...original, notes: '', watchNextShift: undefined }, patch, expected);
});

test('Spot Check conversion changes same event type and preserves original downtime', () => {
  const original = event({ eventType: 'spot_check', status: 'DOWN', downAt: 1000 });
  const converted = { ...original, eventType: 'pump_down' as const, holes: [5] };
  const updates = { ...getIssueStatusPatch(converted, 'DOWN', 2000), holes: [5] };
  const { patch, expected } = buildEventPatch(original, updates, 2000);
  validateEventPatch(original, patch, expected);
  assert.equal(patch.eventType, 'pump_down');
  assert.equal({ ...original, ...patch }.downAt, 1000);
  assert.equal({ ...original, ...patch }.id, original.id);
});

test('Watch-only issues display WATCH, not RUNNING, in Mechanics and reports', () => {
  const watch = event({ eventType: 'watch_item', status: 'RUNNING', watchNextShift: true });
  assert.equal(getIssueDisplayStatus(watch), 'WATCH');
  assert.equal(extractActiveEquipmentIssues([watch], () => 'Station 4')[0].displayStatus, 'WATCH');
});
