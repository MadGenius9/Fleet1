import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  runTransaction,
  type Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { FleetDoc, MaintenanceLog, QueuedWrite, SyncStatus, SyncErrorInfo } from '../types';
import { applyFleetMutation, AssignmentConflictError } from './fleetMutations';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// CRITICAL: Specifying firestoreDatabaseId is required by AI Studio
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Default Fleet 1 preset data with 24 stations
export const DEFAULT_STATIONS: string[] = Array.from(
  { length: 24 },
  (_, i) => `Station ${i + 1}`
);

export const DEFAULT_FLEET_DATA: FleetDoc = {
  name: 'FLEET 1 PUMP HOURS',
  stations: DEFAULT_STATIONS,
  pumps: [],
  stationPumps: {}
};

const QUEUE_STORAGE_KEY = 'fleet1_offline_write_queue_v1';

// Offline Queue helpers
export function getQueuedWrites(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY) || localStorage.getItem('fleet1_offline_write_queue_v1');
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline queue from localStorage', err);
    return [];
  }
}

export function saveQueuedWrites(queue: QueuedWrite[]) {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to persist offline queue', err);
  }
}

/**
 * Recursively removes all undefined properties from objects and arrays
 * before writing to Firestore. Preserves null, 0, false, empty strings,
 * and valid objects/arrays.
 * Omit internal UI transient properties like _pendingSync.
 */
export function sanitizeFirestoreData<T = Record<string, any>>(data: any): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => (typeof item === 'object' && item !== null ? sanitizeFirestoreData(item) : item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      // Omit local transient flags such as _pendingSync
      if (key === '_pendingSync' || key.startsWith('__')) {
        continue;
      }
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
          result[key] = sanitizeFirestoreData(value);
        } else {
          result[key] = value;
        }
      }
    }
    return result as T;
  }
  return data;
}

export function enqueueWrite(write: Omit<QueuedWrite, 'id' | 'timestamp' | 'retryCount'>): QueuedWrite {
  const queue = getQueuedWrites();
  // Ensure the queued payload is strictly sanitized with zero undefined values
  const cleanData = write.data !== undefined ? sanitizeFirestoreData(write.data) : undefined;
  const queuedItem: QueuedWrite = {
    ...write,
    data: cleanData,
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    retryCount: 0
  };
  queue.push(queuedItem);
  saveQueuedWrites(queue);
  return queuedItem;
}

export function removeQueuedWrite(id: string) {
  const queue = getQueuedWrites().filter(item => item.id !== id);
  saveQueuedWrites(queue);
}

let isFlushingQueue = false;

/**
 * Flush queued writes to Firestore
 */
export async function flushOfflineQueue(
  onProgress?: (remaining: number) => void
): Promise<{ successful: number; failed: number }> {
  if (!navigator.onLine || !auth.currentUser) {
    return { successful: 0, failed: 0 };
  }

  if (isFlushingQueue) {
    return { successful: 0, failed: 0 };
  }

  const queue = getQueuedWrites();
  if (queue.length === 0) return { successful: 0, failed: 0 };

  isFlushingQueue = true;
  let successful = 0;
  let failed = 0;
  const remainingQueue: QueuedWrite[] = [];

  try {
    for (const item of queue) {
      // Do not endlessly retry a permanent assignment conflict on automatic background sync cycles
      if ((item as any).isConflict) {
        remainingQueue.push(item);
        continue;
      }

      try {
        if (item.type === 'set' || item.type === 'update') {
          const docRef = doc(db, item.path);
          const sanitizedPayload = sanitizeFirestoreData(item.data || {});
          await setDoc(docRef, sanitizedPayload, { merge: true });
          successful++;
        } else if (item.type === 'delete') {
          const docRef = doc(db, item.path);
          await deleteDoc(docRef);
          successful++;
        } else if (item.type === 'fleet-update') {
          const docRef = doc(db, item.path);
          if (item.data?.mutation) {
            await runTransaction(db, async (tx) => {
              const sfDoc = await tx.get(docRef);
              const currentServerData: FleetDoc = sfDoc.exists()
                ? (sfDoc.data() as FleetDoc)
                : DEFAULT_FLEET_DATA;
              const merged = applyFleetMutation(currentServerData, item.data.mutation);
              tx.set(docRef, sanitizeFirestoreData(merged), { merge: true });
            });
          } else {
            const sanitizedPayload = sanitizeFirestoreData(item.data || {});
            await setDoc(docRef, sanitizedPayload, { merge: true });
          }
          successful++;
        }
      } catch (err) {
        const isConflict = err instanceof AssignmentConflictError || (err as any)?.isAssignmentConflict;
        const errMessage = err instanceof Error ? err.message : String(err);
        console.warn('Queue flush retry failed for item:', item, err);
        failed++;
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastError = errMessage;
        item.lastAttempt = Date.now();
        item.status = 'failed';
        if (isConflict) {
          // Mark as permanent conflict so transactions do not endlessly retry it
          (item as any).isConflict = true;
          (item as any).conflictDetails = {
            station: (err as any).station,
            currentPump: (err as any).currentPump,
            requestedPump: (err as any).requestedPump,
            expectedOldPump: (err as any).expectedOldPump,
          };
        }
        // NEVER drop failed queue items! Always preserve them so they remain recoverable!
        remainingQueue.push(item);
      }
      if (onProgress) {
        onProgress(remainingQueue.length);
      }
    }

    saveQueuedWrites(remainingQueue);
  } finally {
    isFlushingQueue = false;
  }

  return { successful, failed };
}

export function getSyncErrors(): SyncErrorInfo[] {
  const queue = getQueuedWrites();
  return queue
    .filter((item) => item.lastError)
    .map((item) => ({
      id: item.id,
      path: item.path,
      error: item.lastError || 'Unknown sync error',
      timestamp: item.lastAttempt || item.timestamp,
      retryCount: item.retryCount,
      isConflict: Boolean((item as any).isConflict),
      conflictDetails: (item as any).conflictDetails,
    }));
}

/**
 * Initial connection verification helper as per AI Studio guidelines
 */
export async function testConnection(): Promise<boolean> {
  try {
    const fleetRef = doc(db, 'fleets', 'fleet1');
    await getDocFromServer(fleetRef);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore client is currently offline.');
    } else {
      console.info('Initial server test reached database response state.');
    }
    return false;
  }
}
