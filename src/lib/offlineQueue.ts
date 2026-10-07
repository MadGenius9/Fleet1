import type { QueuedWrite } from '../types';

/** Drain a snapshot in order, reconciling each result with current durable storage.
 * Writes added while network requests are in flight must never be discarded.
 * A failed write blocks later writes to the same document until the next retry.
 */
export async function flushQueueBatch(
  read: () => QueuedWrite[],
  save: (queue: QueuedWrite[]) => void,
  execute: (item: QueuedWrite) => Promise<void>,
  onProgress?: (remaining: number) => void,
): Promise<{ successful: number; failed: number }> {
  const batch = [...read()];
  const blockedPaths = new Set<string>();
  let successful = 0;
  let failed = 0;
  for (const item of batch) {
    if (!read().some((current) => current.id === item.id)) continue;
    if (item.isConflict || blockedPaths.has(item.path)) {
      blockedPaths.add(item.path);
      continue;
    }
    let failure: unknown;
    try {
      await execute(item);
    } catch (err) {
      failure = err;
    }
    if (failure) {
      const err = failure as any;
      const updated: QueuedWrite = {
        ...item,
        retryCount: item.retryCount + 1,
        lastError: failure instanceof Error ? failure.message : String(failure),
        lastAttempt: Date.now(),
        status: 'failed',
        isConflict: Boolean(err?.isAssignmentConflict || err?.isWriteConflict),
        ...(err?.isAssignmentConflict ? { conflictDetails: {
          station: err.station, currentPump: err.currentPump,
          requestedPump: err.requestedPump, expectedOldPump: err.expectedOldPump,
        } } : {}),
      };
      save(read().map((current) => current.id === item.id ? updated : current));
      blockedPaths.add(item.path);
      failed++;
    } else {
      save(read().filter((current) => current.id !== item.id));
      successful++;
    }
    onProgress?.(read().length);
  }
  return { successful, failed };
}
