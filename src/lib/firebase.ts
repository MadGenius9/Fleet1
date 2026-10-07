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
import { flushQueueBatch } from './offlineQueue';
import { validateEventPatch, WriteConflictError } from './eventMutations';
import { firebaseConfig } from './firebaseConfig';
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
    throw new Error('Cannot read the offline queue. Do not clear browser storage; recover the saved readings first.', { cause: err });
  }
}

export function saveQueuedWrites(queue: QueuedWrite[]) {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    throw new Error('Cannot save the offline queue. This change is not safely stored; free browser storage and retry.', { cause: err });
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

  isFlushingQueue = true;
  try {
    return await flushQueueBatch(getQueuedWrites, saveQueuedWrites, async (item) => {
      const docRef = doc(db, item.path);
      if (item.type === 'event-update') {
        await runTransaction(db, async (tx) => {
          const snapshot = await tx.get(docRef);
          if (!snapshot.exists()) throw new WriteConflictError();
          validateEventPatch(snapshot.data(), item.data, item.expected || {});
          tx.update(docRef, sanitizeFirestoreData(item.data));
        });
      } else if (item.type === 'set' && item.path.includes('/pumpOpsEvents/')) {
        // Stable event IDs make create retries safe without overwriting later edits.
        await runTransaction(db, async (tx) => {
          const snapshot = await tx.get(docRef);
          if (!snapshot.exists()) tx.set(docRef, sanitizeFirestoreData(item.data));
        });
      } else if (item.type === 'set' || item.type === 'update') {
        await setDoc(docRef, sanitizeFirestoreData(item.data || {}), { merge: true });
      } else if (item.type === 'delete') {
        await deleteDoc(docRef);
      } else if (item.type === 'fleet-update') {
        if (item.data?.mutation) {
          await runTransaction(db, async (tx) => {
            const snapshot = await tx.get(docRef);
            const current = snapshot.exists() ? snapshot.data() as FleetDoc : DEFAULT_FLEET_DATA;
            tx.set(docRef, sanitizeFirestoreData(applyFleetMutation(current, item.data.mutation)));
          });
        } else {
          // Preserve old queued writes; new operations always use targeted mutations.
          await setDoc(docRef, sanitizeFirestoreData(item.data || {}), { merge: true });
        }
      } else {
        throw new Error('Unknown queued write type; retained for recovery.');
      }
    }, onProgress);
  } finally {
    isFlushingQueue = false;
  }
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
