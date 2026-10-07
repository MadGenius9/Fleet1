import { mergeQueuedEvents } from '../lib/mergeQueuedEvents';
import { findPreviousReading } from '../lib/readings';
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  auth,
  db,
  DEFAULT_FLEET_DATA,
  DEFAULT_STATIONS,
  OperationType,
  handleFirestoreError,
  enqueueWrite,
  getQueuedWrites,
  flushOfflineQueue,
  testConnection,
  sanitizeFirestoreData,
  getSyncErrors
} from '../lib/firebase';
import {
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import type {
  FleetDoc,
  FleetMutation,
  MaintenanceLog,
  SyncStatus,
  SyncErrorInfo,
  ShiftType,
  ShiftWithLegacy,
  ShiftFinalizedInfo,
  PumpOpsEvent,
  PumpOpStatus,
  PumpOpEventType,
  ShiftHandoffSnapshot,
  AssignmentConflictInfo
} from '../types';
import { buildEventPatch, validateEventPatch, WriteConflictError, getResolvedDowntime, getIssueStatusPatch } from '../lib/eventMutations';
import { applyFleetMutation, AssignmentConflictError } from '../lib/fleetMutations';

import { getOperationalShift, getOperationalDate, getDefaultShift, getShiftChronologicalKey, getLogDocIdWithShift, getLogDocId } from '../lib/shifts';
export { getOperationalShift, getOperationalDate, getDefaultShift, getShiftChronologicalKey, getLogDocIdWithShift, getLogDocId } from '../lib/shifts';

function parseHour(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

import { extractStationNumber, sortStations } from '../lib/fleetMutations';
export { extractStationNumber, sortStations } from '../lib/fleetMutations';

export function sortPumpList(pumps: string[]): string[] {
  return [...pumps].sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

interface FleetContextValue {
  user: User | null;
  authLoading: boolean;
  anonDisabled: boolean;
  syncStatus: SyncStatus;
  queuedCount: number;
  syncErrors: SyncErrorInfo[];
  retrySyncErrors: () => Promise<void>;
  fleet: FleetDoc;
  allLogs: MaintenanceLog[];
  todayLogs: MaintenanceLog[];
  allTodayLogs: MaintenanceLog[];
  todayDateStr: string;
  activeShift: ShiftType;
  setActiveShift: (shift: ShiftType) => void;
  technicianName: string;
  setTechnicianName: (name: string) => void;
  // Core Hours Logging & Readings
  saveSingleReading: (reading: {
    date: string;
    shift?: ShiftType;
    stationNumber: string;
    pumpNumber: string;
    pumpHours: number | null;
    deckEngHours: number | null;
    notes?: string;
  }) => Promise<{ success: boolean; status: 'saved' | 'queued' }>;
  getPreviousReading: (
    pumpNumber: string,
    beforeDate: string,
    beforeShift?: ShiftType
  ) => {
    pumpHours: number | null;
    deckEngHours: number | null;
    date: string;
    shift?: ShiftWithLegacy;
  } | null;
  finalizeDailySheet: (dateStr: string, shift?: ShiftType) => Promise<void>;
  reopenDailySheet: (dateStr: string, shift?: ShiftType) => Promise<void>;
  isSheetFinalized: (dateStr: string, shift?: ShiftType) => {
    finalized: boolean;
    finalizedAt?: number;
    finalizedBy?: string;
    shift?: ShiftType;
  };
  getLogsForDateAndShift: (date: string, shift: ShiftType) => MaintenanceLog[];
  // Lineup / Station Management
  addStation: (stationName: string) => Promise<void>;
  deleteStation: (stationName: string) => Promise<void>;
  addPumpToDirectory: (pumpName: string) => Promise<void>;
  assignPumpToStation: (stationName: string, pumpName: string, moveFromOtherStation?: boolean, expectedOldPump?: string) => Promise<void>;
  swapPumpOnStation: (stationName: string, oldPump: string, newPump: string, notes?: string) => Promise<void>;
  moveReadingPump: (params: {
    date: string;
    shift?: ShiftType;
    stationNumber: string;
    oldPumpNumber: string;
    newPumpNumber: string;
    customReadings?: {
      pumpHours: number | null;
      deckEngHours: number | null;
      notes?: string;
    };
  }) => Promise<void>;
  removePumpFromStation: (stationName: string, pumpName: string) => Promise<void>;
  deletePumpFromFleet: (pumpName: string) => Promise<void>;
  clearAllPumps: () => Promise<void>;
  getPumpsForStation: (stationName: string) => string[];
  getStationForPump: (pumpName: string) => string | null;
  // Pump Ops Operational System
  pumpOpsEvents: PumpOpsEvent[];
  currentStage: number | string;
  setCurrentStage: (stage: number | string) => Promise<void>;
  recordPumpOpEvent: (eventData: Omit<PumpOpsEvent, 'id' | 'createdAt' | 'updatedAt' | '_pendingSync'>) => Promise<PumpOpsEvent>;
  updatePumpOpEvent: (id: string, updates: Partial<PumpOpsEvent>, expectedEvent?: PumpOpsEvent) => Promise<void>;
  startRepair: (eventId: string, notes?: string) => Promise<void>;
  returnToService: (eventId: string, notes?: string) => Promise<void>;
  markDerated: (params: {
    station: string;
    pump: string;
    date: string;
    shift: ShiftType;
    reason: string;
    limitation?: string;
    notes?: string;
    stage?: number | string;
  }) => Promise<PumpOpsEvent>;
  recordWatchItem: (params: {
    station: string;
    pump: string;
    date: string;
    shift: ShiftType;
    category?: string;
    component?: string;
    holes?: number[];
    notes?: string;
    stage?: number | string;
  }) => Promise<PumpOpsEvent>;
  getPumpCurrentStatus: (
    pumpNumber: string,
    date?: string,
    shift?: ShiftType
  ) => {
    status: PumpOpStatus;
    activeEvent?: PumpOpsEvent;
    activeEvents: PumpOpsEvent[];
    watchEvent?: PumpOpsEvent;
    watchEvents: PumpOpsEvent[];
    downtimeMinutes?: number;
  };
  shiftNotes: Record<string, string>;
  setShiftNotes: (date: string, shift: ShiftType, notes: string) => Promise<void>;
  finalizeShiftHandoff: (snapshot: ShiftHandoffSnapshot) => Promise<void>;
  // Legacy support for backward compatibility
  saveLog: (logData: Omit<MaintenanceLog, 'id' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  saveBatchLogs: (batch: Array<{ date: string; shift?: ShiftType; stationNumber: string; pumpNumber: string; pumpHours: number | null; deckEngHours: number | null; notes?: string; existingId?: string }>) => Promise<void>;
  deleteLog: (logId: string) => Promise<void>;
  flushQueue: () => Promise<void>;
  retryAnonymousAuth: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  // Shift Transitions
  isShiftTransitionAvailable: boolean;
  detectedShift: ShiftType;
  detectedOpDate: string;
  acceptShiftTransition: () => void;
  dismissShiftTransition: () => void;
  // Concurrent Assignment Conflict Warning & Management
  assignmentConflicts: AssignmentConflictInfo[];
  dismissAssignmentConflict: (conflictId: string) => void;
}

const FleetContext = createContext<FleetContextValue | null>(null);

const CACHE_FLEET_KEY = 'fleet1_cached_fleet_doc_v1';
const CACHE_LOGS_KEY = 'fleet1_cached_logs_v1';
const CACHE_EVENTS_KEY = 'fleet1_cached_pump_ops_events_v1';

export const FleetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [anonDisabled, setAnonDisabled] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [queuedCount, setQueuedCount] = useState<number>(() => getQueuedWrites().length);
  const [syncErrors, setSyncErrors] = useState<SyncErrorInfo[]>(() => getSyncErrors());

  const [fleet, setFleet] = useState<FleetDoc>(() => {
    try {
      const raw = localStorage.getItem(CACHE_FLEET_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_FLEET_DATA;
    } catch {
      return DEFAULT_FLEET_DATA;
    }
  });

  const [allLogs, setAllLogs] = useState<MaintenanceLog[]>(() => {
    try {
      const raw = localStorage.getItem(CACHE_LOGS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [activeShift, setActiveShiftState] = useState<ShiftType>(() => {
    const saved = localStorage.getItem('fleet1_active_shift');
    if (saved === 'day' || saved === 'night') return saved;
    return getOperationalShift();
  });

  const [technicianName, setTechnicianNameState] = useState<string>(() => {
    return localStorage.getItem('fleet1_tech_name') || '';
  });

  const [pumpOpsEvents, setPumpOpsEvents] = useState<PumpOpsEvent[]>(() => {
    try {
      const raw = localStorage.getItem(CACHE_EVENTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [currentStageState, setCurrentStageState] = useState<number | string>(() => {
    return localStorage.getItem('fleet1_current_stage') || '37';
  });

  // Reactive operational date that updates smoothly across shift boundaries without interrupting active forms
  const [todayDateStr, setTodayDateStr] = useState<string>(() => getOperationalDate());
  // Shift transition detection for 5:30 AM / 5:30 PM boundaries
  const [detectedShift, setDetectedShift] = useState<ShiftType>(() => getOperationalShift());
  const [detectedOpDate, setDetectedOpDate] = useState<string>(() => getOperationalDate());
  const [dismissedShiftTransition, setDismissedShiftTransition] = useState<string | null>(null);

  useEffect(() => {
    const checkShiftBoundary = () => {
      const nextOpDate = getOperationalDate();
      const nextShift = getOperationalShift();
      setDetectedOpDate(nextOpDate);
      setDetectedShift(nextShift);
      setTodayDateStr((prev) => (prev !== nextOpDate ? nextOpDate : prev));
    };
    checkShiftBoundary();
    const timer = setInterval(checkShiftBoundary, 10000);
    return () => clearInterval(timer);
  }, []);

  const transitionKey = `${detectedOpDate}_${detectedShift}`;
  const isShiftTransitionAvailable =
    (detectedShift !== activeShift || (detectedShift === 'day' && detectedOpDate !== todayDateStr)) &&
    dismissedShiftTransition !== transitionKey;

  const acceptShiftTransition = useCallback(() => {
    setActiveShiftState(detectedShift);
    try {
      localStorage.setItem('fleet1_active_shift', detectedShift);
    } catch {}
    setTodayDateStr(detectedOpDate);
    setDismissedShiftTransition(transitionKey);
  }, [detectedShift, detectedOpDate, transitionKey]);

  const dismissShiftTransition = useCallback(() => {
    setDismissedShiftTransition(transitionKey);
  }, [transitionKey]);

  // Concurrent assignment conflicts
  const [assignmentConflicts, setAssignmentConflicts] = useState<AssignmentConflictInfo[]>(() => {
    try {
      const raw = localStorage.getItem('fleet1_assignment_conflicts_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const recordAssignmentConflict = useCallback(
    (conflict: Omit<AssignmentConflictInfo, 'id' | 'timestamp'>) => {
      const newConflict: AssignmentConflictInfo = {
        ...conflict,
        id: `conf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: Date.now(),
      };
      setAssignmentConflicts((prev) => {
        // Prevent duplicate notices for exact same station and requested pump
        const filtered = prev.filter(
          (c) => !(c.station === newConflict.station && c.requestedPump === newConflict.requestedPump)
        );
        const updated = [newConflict, ...filtered];
        try {
          localStorage.setItem('fleet1_assignment_conflicts_v1', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    },
    []
  );

  const dismissAssignmentConflict = useCallback((conflictId: string) => {
    setAssignmentConflicts((prev) => {
      const updated = prev.filter((c) => c.id !== conflictId);
      try {
        localStorage.setItem('fleet1_assignment_conflicts_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Save caches to localStorage for complete preservation across browser restarts
  useEffect(() => {
    try {
      localStorage.setItem(CACHE_FLEET_KEY, JSON.stringify(fleet));
    } catch {}
  }, [fleet]);

  useEffect(() => {
    try {
      localStorage.setItem(CACHE_LOGS_KEY, JSON.stringify(allLogs));
    } catch {}
  }, [allLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(CACHE_EVENTS_KEY, JSON.stringify(pumpOpsEvents));
    } catch {}
  }, [pumpOpsEvents]);

  const setActiveShift = useCallback((s: ShiftType) => {
    setActiveShiftState(s);
    try {
      localStorage.setItem('fleet1_active_shift', s);
    } catch (err) {
      console.warn('Could not save active shift preference', err);
    }
  }, []);

  const setTechnicianName = useCallback((name: string) => {
    const trimmed = name.trim();
    setTechnicianNameState(trimmed);
    try {
      if (trimmed) {
        localStorage.setItem('fleet1_tech_name', trimmed);
      } else {
        localStorage.removeItem('fleet1_tech_name');
      }
    } catch (e) {
      console.warn('Could not save technician name', e);
    }
  }, []);

  // 1. Initial Authentication & Anonymous Sign-in
  const attemptAnonymousAuth = useCallback(async () => {
    try {
      setAuthLoading(true);
      await signInAnonymously(auth);
      setAnonDisabled(false);
    } catch (err: any) {
      console.warn('Anonymous auth failed:', err);
      const errCode = err?.code || '';
      const errMsg = err?.message || '';
      if (
        errCode === 'auth/operation-not-allowed' ||
        errCode === 'auth/admin-restricted-operation' ||
        errMsg.includes('operation-not-allowed') ||
        errMsg.includes('admin-restricted-operation')
      ) {
        setAnonDisabled(true);
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signInGoogle = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setAnonDisabled(false);
    } catch (err) {
      console.error('Google sign in error:', err);
      throw err;
    }
  }, []);

  // Central queue flush trigger
  const triggerQueueFlush = useCallback(async () => {
    if (!navigator.onLine || !auth.currentUser) {
      setSyncErrors(getSyncErrors());
      return;
    }
    const initialQueue = getQueuedWrites();
    if (initialQueue.length === 0) {
      setQueuedCount(0);
      setSyncErrors([]);
      return;
    }
    const { successful, failed } = await flushOfflineQueue();
    const remaining = getQueuedWrites().length;
    setQueuedCount(remaining);
    const errors = getSyncErrors();
    setSyncErrors(errors);

    // If any queued writes had an assignment conflict, record them for UI notice
    errors.forEach((err) => {
      if (err.isConflict && err.conflictDetails) {
        recordAssignmentConflict({
          station: err.conflictDetails.station,
          currentPump: err.conflictDetails.currentPump,
          requestedPump: err.conflictDetails.requestedPump,
        });
      }
    });

    if (successful > 0) {
      console.info(`Flushed ${successful} offline queued writes (${remaining} remaining, ${failed} failed)`);
    }
    if (remaining === 0 && navigator.onLine) {
      setSyncStatus('live');
    }
  }, [recordAssignmentConflict]);

  const retrySyncErrors = useCallback(async () => {
    await triggerQueueFlush();
    setSyncErrors(getSyncErrors());
  }, [triggerQueueFlush]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAnonDisabled(false);
        setAuthLoading(false);
        setSyncStatus('connecting');
        // Flush queue on successful authentication
        triggerQueueFlush();
      } else {
        attemptAnonymousAuth();
      }
    });

    return () => unsubscribe();
  }, [attemptAnonymousAuth, triggerQueueFlush]);

  // Online / Offline window listeners and periodic safe retry
  useEffect(() => {
    const handleOnline = () => {
      triggerQueueFlush();
    };

    const handleOffline = () => {
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    testConnection();

    // Flush shortly after app startup
    const startupTimer = setTimeout(() => {
      triggerQueueFlush();
    }, 2000);

    // Periodically retry queued writes while online (conservative 20s interval)
    const periodicTimer = setInterval(() => {
      if (navigator.onLine && getQueuedWrites().length > 0) {
        triggerQueueFlush();
      }
    }, 20000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(startupTimer);
      clearInterval(periodicTimer);
    };
  }, [triggerQueueFlush]);

  // 2. Realtime listener for Fleet 1 Doc (/fleets/fleet1)
  useEffect(() => {
    if (!user) return;

    const fleetDocRef = doc(db, 'fleets', 'fleet1');
    const unsubscribe = onSnapshot(
      fleetDocRef,
      { includeMetadataChanges: true },
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as FleetDoc;
          const rawPumps = Array.isArray(data.pumps) ? data.pumps : [];
          const existingStations = Array.isArray(data.stations) ? data.stations : [];
          
          // Ensure at least 24 stations (Station 1 through Station 24) are available in lineup
          const mergedStationsMap = new Set([...DEFAULT_STATIONS, ...existingStations]);
          const mergedStations = sortStations(Array.from(mergedStationsMap));
          const rawStationPumps = (data.stationPumps && typeof data.stationPumps === 'object') ? data.stationPumps : {};
          const rawFinalized = (data.finalizedSheets && typeof data.finalizedSheets === 'object') ? data.finalizedSheets : {};

          setFleet({
            name: data.name || DEFAULT_FLEET_DATA.name,
            stations: mergedStations,
            pumps: rawPumps,
            stationPumps: rawStationPumps,
            finalizedSheets: rawFinalized,
            currentStage: data.currentStage,
            shiftNotes: (data.shiftNotes && typeof data.shiftNotes === 'object') ? data.shiftNotes : {},
            finalizedHandoffs: (data.finalizedHandoffs && typeof data.finalizedHandoffs === 'object') ? data.finalizedHandoffs : {},
          });

          if (data.currentStage) {
            setCurrentStageState(data.currentStage);
          }

        } else if (!snapshot.metadata.fromCache) {
          // Initialize only after a confirmed server absence, without racing another client.
          try {
            await runTransaction(db, async (tx) => {
              const latest = await tx.get(fleetDocRef);
              if (!latest.exists()) tx.set(fleetDocRef, DEFAULT_FLEET_DATA);
            });
          } catch (err) {
            console.warn('Could not auto-initialize fleet1 doc on server:', err);
          }
        }
      },
      (error) => {
        console.warn('Fleet 1 onSnapshot listener error:', error);
        handleFirestoreError(error, OperationType.GET, 'fleets/fleet1');
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 3. Realtime listener for Logs (/fleets/fleet1/logs)
  useEffect(() => {
    if (!user) {
      if (!authLoading && anonDisabled) {
        setSyncStatus('offline');
      }
      return;
    }

    const logsCol = collection(db, 'fleets', 'fleet1', 'logs');
    const logsQuery = query(logsCol, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(
      logsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const docs: MaintenanceLog[] = [];
        snapshot.forEach((item) => {
          const data = item.data();
          const rawShift = data.shift;
          let shiftVal: ShiftWithLegacy = 'legacy';
          if (rawShift === 'day' || rawShift === 'night') {
            shiftVal = rawShift;
          } else if (item.id.includes('_day_')) {
            shiftVal = 'day';
          } else if (item.id.includes('_night_')) {
            shiftVal = 'night';
          } else {
            shiftVal = 'legacy';
          }

          docs.push({
            id: item.id,
            date: data.date || getOperationalDate(),
            shift: shiftVal,
            stationNumber: data.stationNumber || 'Station 1',
            pumpNumber: data.pumpNumber || '',
            pumpHours: parseHour(data.pumpHours),
            deckEngHours: parseHour(data.deckEngHours),
            notes: typeof data.notes === 'string' ? data.notes : (data.info || ''),
            packing: data.packing || '',
            plunger: data.plunger || '',
            vs: data.vs || '',
            info: data.info || '',
            finalized: Boolean(data.finalized),
            finalizedAt: data.finalizedAt ? Number(data.finalizedAt) : undefined,
            finalizedBy: data.finalizedBy || undefined,
            enteredBy: data.enteredBy || 'Technician',
            createdAt: Number(data.createdAt) || Date.now(),
            updatedAt: Number(data.updatedAt) || Date.now(),
            _pendingSync: item.metadata.hasPendingWrites,
          });
        });

        setAllLogs(docs);

        if (!navigator.onLine) {
          setSyncStatus('offline');
        } else if (snapshot.metadata.hasPendingWrites) {
          setSyncStatus('connecting');
        } else {
          setSyncStatus('live');
        }

        setQueuedCount(getQueuedWrites().length);
      },
      (error) => {
        console.warn('Logs onSnapshot listener error:', error);
        setSyncStatus('offline');
        handleFirestoreError(error, OperationType.LIST, 'fleets/fleet1/logs');
      }
    );

    return () => unsubscribe();
  }, [user, authLoading, anonDisabled]);

  // 4. Realtime listener for Operational Events (/fleets/fleet1/pumpOpsEvents)
  useEffect(() => {
    if (!user) return;

    const opsCol = collection(db, 'fleets', 'fleet1', 'pumpOpsEvents');

    const unsubscribe = onSnapshot(
      opsCol,
      { includeMetadataChanges: true },
      (snapshot) => {
        const events: PumpOpsEvent[] = [];
        const queuedItems = getQueuedWrites();
        const queuedEventIds = new Set(
          queuedItems
            .filter((q) => q.path.includes('/pumpOpsEvents/'))
            .map((q) => q.path.split('/').pop())
        );

        snapshot.forEach((item) => {
          const data = item.data();
          const startedAt = Number(data.startedAt) || Number(data.createdAt) || Date.now();
          const isPending = item.metadata.hasPendingWrites || queuedEventIds.has(item.id);

          events.push({
            id: item.id,
            date: data.date || getOperationalDate(),
            shift: (data.shift === 'night' ? 'night' : 'day') as ShiftType,
            station: data.station || '',
            pump: data.pump || '',
            eventType: (data.eventType as PumpOpEventType) || 'pump_down',
            status: (data.status as PumpOpStatus) || 'RUNNING',
            category: data.category || undefined,
            component: data.component || undefined,
            holes: Array.isArray(data.holes) ? data.holes : undefined,
            limitation: data.limitation || undefined,
            notes: data.notes || undefined,
            watchNextShift: Boolean(data.watchNextShift),
            startedAt,
            downAt: data.downAt !== undefined && data.downAt !== null ? Number(data.downAt) : null,
            repairStartedAt: data.repairStartedAt ? Number(data.repairStartedAt) : null,
            resolvedAt: data.resolvedAt ? Number(data.resolvedAt) : null,
            downtimeMinutes: data.downtimeMinutes !== undefined && data.downtimeMinutes !== null ? Number(data.downtimeMinutes) : null,
            spotCheckType: data.spotCheckType || undefined,
            checks: Array.isArray(data.checks) ? data.checks : undefined,
            recheckNextStage: data.recheckNextStage ? Boolean(data.recheckNextStage) : undefined,
            sourceSpotCheckId: data.sourceSpotCheckId || undefined,
            createdFromSpotCheck: data.createdFromSpotCheck ? Boolean(data.createdFromSpotCheck) : undefined,
            replacedPump: data.replacedPump || undefined,
            newPump: data.newPump || undefined,
            operator: data.operator || 'Operator',
            createdAt: Number(data.createdAt) || startedAt,
            updatedAt: Number(data.updatedAt) || startedAt,
            lastEditedAt: data.lastEditedAt ? Number(data.lastEditedAt) : undefined,
            lastEditedBy: data.lastEditedBy || undefined,
            _pendingSync: isPending,
          });
        });

        setPumpOpsEvents((previous) => mergeQueuedEvents(events, previous, queuedItems));
      },
      (error) => {
        console.warn('pumpOpsEvents listener error:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Helper to safely perform concurrent updates on the shared FleetDoc using Firestore transactions and targeted mutations
  const updateFleetWithTransaction = useCallback(
    async (
      updaterOrMutation: FleetMutation | ((current: FleetDoc) => Partial<FleetDoc>),
      explicitMutation?: FleetMutation
    ) => {
      let mutation: FleetMutation;
      if (typeof updaterOrMutation === 'function') {
        const patch = updaterOrMutation(fleet);
        mutation = explicitMutation || { type: 'patch', patch };
      } else {
        mutation = updaterOrMutation;
      }

      // 1. Optimistic local state update using pure mutation applier
      setFleet((prev) => {
        const next = applyFleetMutation(prev, mutation);
        try {
          localStorage.setItem(CACHE_FLEET_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });

      const docPath = 'fleets/fleet1';

      if (!navigator.onLine || !user) {
        // Enqueue safe, targeted mutation operation instead of complete snapshot
        enqueueWrite({
          type: 'fleet-update',
          path: docPath,
          data: { mutation },
        });
        setQueuedCount(getQueuedWrites().length);
        return;
      }

      let confirmedFleet: FleetDoc | undefined;
      try {
        const fleetDocRef = doc(db, 'fleets', 'fleet1');
        await runTransaction(db, async (tx) => {
          const sfDoc = await tx.get(fleetDocRef);
          const currentServerData: FleetDoc = sfDoc.exists()
            ? (sfDoc.data() as FleetDoc)
            : DEFAULT_FLEET_DATA;
          confirmedFleet = currentServerData;
          const merged = applyFleetMutation(currentServerData, mutation);
          tx.set(fleetDocRef, sanitizeFirestoreData(merged));
        });
      } catch (err) {
        if (err instanceof AssignmentConflictError || (err as any)?.isAssignmentConflict) {
          console.warn('Assignment conflict detected during transaction:', err);
          // Revert optimistic fleet update to preserve confirmed server state
          if (confirmedFleet) setFleet(confirmedFleet);
          recordAssignmentConflict({
            station: (err as any).station,
            currentPump: (err as any).currentPump,
            requestedPump: (err as any).requestedPump,
          });
          // Do not treat as successful, propagate error so caller knows conflict occurred
          throw err;
        }

        console.warn('Transaction failed, saving targeted mutation to offline queue:', err);
        enqueueWrite({
          type: 'fleet-update',
          path: docPath,
          data: { mutation },
        });
        setQueuedCount(getQueuedWrites().length);
      }
    },
    [fleet, user, recordAssignmentConflict]
  );

  const setCurrentStage = useCallback(
    async (stage: number | string) => {
      setCurrentStageState(stage);
      try {
        localStorage.setItem('fleet1_current_stage', String(stage));
      } catch (e) {}

      await updateFleetWithTransaction({ type: 'set-stage', stage });
    },
    [updateFleetWithTransaction]
  );

  const setShiftNotes = useCallback(
    async (date: string, shift: ShiftType, notes: string) => {
      const key = `${date}_${shift}`;
      await updateFleetWithTransaction({ type: 'set-shift-notes', key, notes });
    },
    [updateFleetWithTransaction]
  );

  const finalizeShiftHandoff = useCallback(
    async (snapshot: ShiftHandoffSnapshot) => {
      const key = `${snapshot.date}_${snapshot.shift}`;
      await updateFleetWithTransaction({ type: 'finalize-handoff', key, snapshot });
    },
    [updateFleetWithTransaction]
  );

  const recordPumpOpEvent = useCallback(
    async (
      eventData: Omit<PumpOpsEvent, 'id' | 'createdAt' | 'updatedAt' | '_pendingSync'>
    ): Promise<PumpOpsEvent> => {
      const now = Date.now();
      const id = `po_${now}_${Math.random().toString(36).slice(2, 7)}`;
      const startedAt = Number(eventData.startedAt) || now;

      // Ensure all required fields exist and are valid for firestore.rules
      const cleanEvent: PumpOpsEvent = {
        id,
        date: eventData.date || todayDateStr,
        shift: (eventData.shift === 'night' ? 'night' : 'day') as ShiftType,
        station: eventData.station || '',
        pump: eventData.pump || '',
        eventType: eventData.eventType || 'pump_down',
        status: eventData.status || 'RUNNING',
        category: eventData.category?.trim() || undefined,
        component: eventData.component?.trim() || undefined,
        holes: Array.isArray(eventData.holes) && eventData.holes.length > 0 ? eventData.holes : undefined,
        limitation: eventData.limitation?.trim() || undefined,
        notes: eventData.notes?.trim() || undefined,
        watchNextShift: Boolean(eventData.watchNextShift),
        startedAt,
        downAt:
          eventData.downAt !== undefined
            ? eventData.downAt
              ? Number(eventData.downAt)
              : null
            : eventData.status === 'DOWN' || eventData.status === 'REPAIRING'
            ? startedAt
            : null,
        repairStartedAt: eventData.repairStartedAt ? Number(eventData.repairStartedAt) : null,
        resolvedAt: eventData.resolvedAt ? Number(eventData.resolvedAt) : null,
        downtimeMinutes: eventData.downtimeMinutes !== undefined && eventData.downtimeMinutes !== null ? Number(eventData.downtimeMinutes) : null,
        spotCheckType: eventData.spotCheckType || undefined,
        checks: Array.isArray(eventData.checks) ? eventData.checks : undefined,
        recheckNextStage: eventData.recheckNextStage ? Boolean(eventData.recheckNextStage) : undefined,
        sourceSpotCheckId: eventData.sourceSpotCheckId?.trim() || undefined,
        createdFromSpotCheck: eventData.createdFromSpotCheck ? Boolean(eventData.createdFromSpotCheck) : undefined,
        replacedPump: eventData.replacedPump?.trim() || undefined,
        newPump: eventData.newPump?.trim() || undefined,
        operator: eventData.operator?.trim() || technicianName || 'Operator',
        createdAt: now,
        updatedAt: now,
        _pendingSync: true,
      };

      // Optimistic local state update
      setPumpOpsEvents((prev) => [cleanEvent, ...prev.filter((e) => e.id !== id)]);

      // Strictly sanitize: strips all undefined fields, removes _pendingSync
      const firestorePayload = sanitizeFirestoreData(cleanEvent);
      const docPath = `fleets/fleet1/pumpOpsEvents/${id}`;

      if (!navigator.onLine || !user) {
        enqueueWrite({
          type: 'set',
          path: docPath,
          data: firestorePayload,
        });
        setQueuedCount(getQueuedWrites().length);
        return cleanEvent;
      }

      try {
        const eventRef = doc(db, 'fleets', 'fleet1', 'pumpOpsEvents', id);
        await setDoc(eventRef, firestorePayload, { merge: true });

        // Confirmed saved and synced!
        cleanEvent._pendingSync = false;
        setPumpOpsEvents((prev) =>
          prev.map((e) => (e.id === id ? { ...e, _pendingSync: false } : e))
        );
      } catch (err) {
        const errCode = (err as any)?.code || 'unknown';
        const errMessage = err instanceof Error ? err.message : String(err);
        console.warn(
          `Failed to direct-write pumpOpsEvent [${id}], queueing for offline sync:`,
          {
            id,
            pump: cleanEvent.pump,
            station: cleanEvent.station,
            eventType: cleanEvent.eventType,
            errorCode: errCode,
            errorMessage: errMessage,
            error: err
          }
        );

        enqueueWrite({
          type: 'set',
          path: docPath,
          data: firestorePayload,
        });
        setQueuedCount(getQueuedWrites().length);

        // Safely trigger queue retry shortly in background
        setTimeout(() => {
          triggerQueueFlush();
        }, 1500);
      }

      return cleanEvent;
    },
    [user, todayDateStr, activeShift, currentStageState, technicianName, triggerQueueFlush]
  );

  const updatePumpOpEvent = useCallback(
    async (id: string, updates: Partial<PumpOpsEvent>, expectedEvent?: PumpOpsEvent) => {
      const now = Date.now();
      const existing = pumpOpsEvents.find((e) => e.id === id);
      if (!existing) throw new Error('Issue not found. Reload the latest data before editing.');
      const { patch, expected } = buildEventPatch(expectedEvent || existing, updates, now);

      const mergedUpdates: Partial<PumpOpsEvent> = {
        ...patch,
        _pendingSync: true,
      };

      // Optimistic update
      setPumpOpsEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...mergedUpdates } : e))
      );

      // Send only changed fields; rules validate the resulting merged document.
      const firestorePayload = sanitizeFirestoreData(patch);
      const docPath = `fleets/fleet1/pumpOpsEvents/${id}`;

      if (!navigator.onLine || !user || getQueuedWrites().some((q) => q.path === docPath)) {
        enqueueWrite({
          type: 'event-update',
          expected,
          path: docPath,
          data: firestorePayload,
        });
        setQueuedCount(getQueuedWrites().length);
        return;
      }

      try {
        const eventRef = doc(db, 'fleets', 'fleet1', 'pumpOpsEvents', id);
        await runTransaction(db, async (tx) => {
          const snapshot = await tx.get(eventRef);
          if (!snapshot.exists()) throw new WriteConflictError();
          validateEventPatch(snapshot.data(), firestorePayload, expected);
          tx.update(eventRef, firestorePayload);
        });

        // Confirmed saved and synced!
        setPumpOpsEvents((prev) =>
          prev.map((e) => (e.id === id ? { ...e, _pendingSync: false } : e))
        );
      } catch (err) {
        if (err instanceof WriteConflictError) {
          setPumpOpsEvents((prev) => prev.map((e) => e.id === id ? existing : e));
          throw err;
        }
        const errCode = (err as any)?.code || 'unknown';
        const errMessage = err instanceof Error ? err.message : String(err);
        console.warn(
          `Failed to direct-update pumpOpsEvent [${id}], queueing for offline sync:`,
          {
            id,
            updates: firestorePayload,
            errorCode: errCode,
            errorMessage: errMessage,
            error: err
          }
        );

        enqueueWrite({
          type: 'event-update',
          expected,
          path: docPath,
          data: firestorePayload,
        });
        setQueuedCount(getQueuedWrites().length);

        setTimeout(() => {
          triggerQueueFlush();
        }, 1500);
      }
    },
    [user, pumpOpsEvents, triggerQueueFlush]
  );

  const startRepair = useCallback(
    async (eventId: string, notes?: string) => {
      const ev = pumpOpsEvents.find((e) => e.id === eventId);
      if (!ev) return;
      const now = Date.now();
      const updates: Partial<PumpOpsEvent> = {
        ...getIssueStatusPatch(ev, 'REPAIRING', now),
        updatedAt: now,
        notes: notes?.trim() ? (ev.notes ? `${ev.notes} • ${notes.trim()}` : notes.trim()) : ev.notes,
      };
      await updatePumpOpEvent(eventId, updates);
    },
    [pumpOpsEvents, updatePumpOpEvent]
  );

  const returnToService = useCallback(
    async (eventId: string, notes?: string) => {
      const ev = pumpOpsEvents.find((e) => e.id === eventId);
      if (!ev) return;
      const now = Date.now();
      const downtime = getResolvedDowntime(ev, now);
      const updates: Partial<PumpOpsEvent> = {
        status: 'RUNNING',
        resolvedAt: now,
        downtimeMinutes: downtime,
        updatedAt: now,
        notes: notes?.trim() ? (ev.notes ? `${ev.notes} • ${notes.trim()}` : notes.trim()) : ev.notes,
      };
      await updatePumpOpEvent(eventId, updates);
    },
    [pumpOpsEvents, updatePumpOpEvent]
  );

  const markDerated = useCallback(
    async (params: {
      station: string;
      pump: string;
      date: string;
      shift: ShiftType;
      reason: string;
      limitation?: string;
      notes?: string;
      stage?: number | string;
    }) => {
      return await recordPumpOpEvent({
        date: params.date,
        shift: params.shift,
        station: params.station,
        pump: params.pump,
        eventType: 'derated',
        status: 'DERATED',
        category: 'DERATED',
        component: params.reason,
        limitation: params.limitation?.trim() || undefined,
        notes: params.notes?.trim() || undefined,
        operator: technicianName || 'Operator',
        startedAt: Date.now(),
      });
    },
    [currentStageState, recordPumpOpEvent, technicianName]
  );

  const recordWatchItem = useCallback(
    async (params: {
      station: string;
      pump: string;
      date: string;
      shift: ShiftType;
      category?: string;
      component?: string;
      holes?: number[];
      notes?: string;
      stage?: number | string;
    }) => {
      return await recordPumpOpEvent({
        date: params.date,
        shift: params.shift,
        station: params.station,
        pump: params.pump,
        eventType: 'watch_item',
        status: 'RUNNING',
        category: params.category?.trim() || 'FLUID END',
        component: params.component?.trim() || 'WATCH',
        holes: params.holes && params.holes.length > 0 ? params.holes : undefined,
        notes: params.notes?.trim() || undefined,
        watchNextShift: true,
        operator: technicianName || 'Operator',
        startedAt: Date.now(),
      });
    },
    [currentStageState, recordPumpOpEvent, technicianName]
  );

  const getPumpCurrentStatus = useCallback(
    (pumpNumber: string, _date?: string, _shift?: ShiftType) => {
      const cleanPump = (pumpNumber || '').trim().toLowerCase();
      if (!cleanPump) {
        return {
          status: 'STANDBY' as PumpOpStatus,
          activeEvents: [],
          watchEvents: [],
        };
      }

      // Check unresolved events for this pump
      const openEvents = pumpOpsEvents.filter((ev) => {
        const isMatch = (ev.pump || '').trim().toLowerCase() === cleanPump;
        return isMatch && !ev.resolvedAt && ev.eventType !== 'returned_to_service';
      });

      const downEvents = openEvents.filter((e) => e.status === 'DOWN');
      const repairingEvents = openEvents.filter((e) => e.status === 'REPAIRING');
      const deratedEvents = openEvents.filter((e) => e.status === 'DERATED');
      const watchEvents = openEvents.filter((e) => Boolean(e.watchNextShift));

      const activeEvents = [...downEvents, ...repairingEvents, ...deratedEvents];

      let status: PumpOpStatus = 'RUNNING';
      let downtimeMinutes: number | undefined = undefined;

      if (downEvents.length > 0) {
        status = 'DOWN';
        const earliest = [...downEvents].sort(
          (a, b) => (a.downAt || a.startedAt) - (b.downAt || b.startedAt)
        )[0];
        const downStart = earliest.downAt || earliest.startedAt;
        downtimeMinutes = Math.max(1, Math.round((Date.now() - downStart) / 60000));
      } else if (repairingEvents.length > 0) {
        status = 'REPAIRING';
        const earliest = [...repairingEvents].sort(
          (a, b) => (a.downAt || a.startedAt) - (b.downAt || b.startedAt)
        )[0];
        const downStart = earliest.downAt || earliest.startedAt;
        downtimeMinutes = Math.max(1, Math.round((Date.now() - downStart) / 60000));
      } else if (deratedEvents.length > 0) {
        status = 'DERATED';
      } else {
        const isAssigned = Object.values(fleet.stationPumps || {}).some((pumps) =>
          Array.isArray(pumps) && pumps.some((p) => p.trim().toLowerCase() === cleanPump)
        );
        status = isAssigned ? 'RUNNING' : 'STANDBY';
      }

      const activeEvent = downEvents[0] || repairingEvents[0] || deratedEvents[0];
      const watchEvent = watchEvents[0];

      return {
        status,
        activeEvent,
        activeEvents,
        watchEvent,
        watchEvents,
        downtimeMinutes,
      };
    },
    [fleet.stationPumps, pumpOpsEvents]
  );

  // All logs for today across all shifts
  const allTodayLogs = useMemo(() => {
    return allLogs.filter((log) => log.date === todayDateStr);
  }, [allLogs, todayDateStr]);

  // Today's logs for the active shift (with fallback for legacy logs if activeShift is 'day')
  const todayLogs = useMemo(() => {
    return allLogs.filter((log) => {
      if (log.date !== todayDateStr) return false;
      if (log.shift === activeShift) return true;
      if ((!log.shift || log.shift === 'legacy') && activeShift === 'day') return true;
      return false;
    });
  }, [allLogs, todayDateStr, activeShift]);

  const getLogsForDateAndShift = useCallback(
    (targetDate: string, targetShift: ShiftType): MaintenanceLog[] => {
      return allLogs.filter((log) => {
        if (log.date !== targetDate) return false;
        if (log.shift === targetShift) return true;
        if ((!log.shift || log.shift === 'legacy') && targetShift === 'day') return true;
        return false;
      });
    },
    [allLogs]
  );

  // Helper to query pumps assigned to a given station
  const getPumpsForStation = useCallback(
    (stationName: string): string[] => {
      if (!stationName) return [];
      const assigned = fleet.stationPumps?.[stationName];
      if (Array.isArray(assigned)) {
        return assigned;
      }
      return [];
    },
    [fleet.stationPumps]
  );

  // Helper to find which station a pump is currently actively assigned to
  const getStationForPump = useCallback(
    (pumpName: string): string | null => {
      if (!pumpName || !fleet.stationPumps) return null;
      const cleanPump = pumpName.trim().toLowerCase();
      for (const [station, pumps] of Object.entries(fleet.stationPumps)) {
        if (Array.isArray(pumps) && pumps.some((p) => p.trim().toLowerCase() === cleanPump)) {
          return station;
        }
      }
      return null;
    },
    [fleet.stationPumps]
  );

  // Previous reading lookup for a pump before a specific date and shift (respects shift chronology)
  const getPreviousReading = useCallback(
    (
      pumpNumber: string,
      beforeDate: string,
      beforeShift: ShiftType = activeShift
    ): {
      pumpHours: number | null;
      deckEngHours: number | null;
      date: string;
      shift?: ShiftWithLegacy;
    } | null => {
      return findPreviousReading(allLogs, pumpNumber, beforeDate, beforeShift);
    },
    [allLogs, activeShift]
  );

  // Core Autosave: Save Single Reading per Station & Pump for a specific Shift
  const saveSingleReading = useCallback(
    async (reading: {
      date: string;
      shift?: ShiftType;
      stationNumber: string;
      pumpNumber: string;
      pumpHours: number | null;
      deckEngHours: number | null;
      notes?: string;
    }): Promise<{ success: boolean; status: 'saved' | 'queued' }> => {
      const now = Date.now();
      const effectiveShift = reading.shift || activeShift;
      const logId = getLogDocIdWithShift(reading.date, effectiveShift, reading.stationNumber, reading.pumpNumber);
      const docPath = `fleets/fleet1/logs/${logId}`;

      const existing = allLogs.find((l) => l.id === logId);

      const parsedPumpHours = reading.pumpHours === null || reading.pumpHours === undefined ? null : Number(reading.pumpHours);
      const parsedDeckHours = reading.deckEngHours === null || reading.deckEngHours === undefined ? null : Number(reading.deckEngHours);

      const payload: Record<string, any> = {
        date: reading.date,
        shift: effectiveShift,
        stationNumber: reading.stationNumber,
        pumpNumber: reading.pumpNumber,
        pumpHours: parsedPumpHours,
        deckEngHours: parsedDeckHours,
        notes: (reading.notes || '').slice(0, 1000),
        enteredBy: (technicianName || 'Technician').slice(0, 100),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };

      const fullLog: MaintenanceLog = {
        id: logId,
        date: reading.date,
        shift: effectiveShift,
        stationNumber: reading.stationNumber,
        pumpNumber: reading.pumpNumber,
        pumpHours: parsedPumpHours,
        deckEngHours: parsedDeckHours,
        notes: reading.notes || '',
        enteredBy: (technicianName || 'Technician').slice(0, 100),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
        _pendingSync: !navigator.onLine || !user,
      };

      // Optimistic instant state update
      setAllLogs((prev) => {
        const filtered = prev.filter((l) => l.id !== logId);
        return [fullLog, ...filtered];
      });

      if (!navigator.onLine || !user) {
        enqueueWrite({
          type: 'set',
          path: docPath,
          data: payload,
        });
        setQueuedCount(getQueuedWrites().length);
        return { success: true, status: 'queued' };
      }

      try {
        const logRef = doc(db, docPath);
        await setDoc(logRef, payload, { merge: true });
        return { success: true, status: 'saved' };
      } catch (err) {
        console.warn('Direct Firestore save failed, queueing offline:', err);
        enqueueWrite({
          type: 'set',
          path: docPath,
          data: payload,
        });
        setQueuedCount(getQueuedWrites().length);
        return { success: true, status: 'queued' };
      }
    },
    [allLogs, activeShift, technicianName, user]
  );

  // Finalize Daily Sheet for a specific Shift
  // Finalize Daily Sheet for a specific Shift
  const finalizeDailySheet = useCallback(
    async (dateStr: string, shift: ShiftType = activeShift) => {
      const now = Date.now();
      const tech = technicianName || 'Technician';
      const sheetKey = `${dateStr}_${shift}`;

      await updateFleetWithTransaction({
        type: 'finalize-sheet',
        key: sheetKey,
        meta: {
          finalized: true,
          finalizedAt: now,
          finalizedBy: tech,
          shift,
        },
      });
    },
    [activeShift, technicianName, updateFleetWithTransaction]
  );

  // Reopen Daily Sheet for a specific Shift
  const reopenDailySheet = useCallback(
    async (dateStr: string, shift: ShiftType = activeShift) => {
      const sheetKey = `${dateStr}_${shift}`;
      await updateFleetWithTransaction({
        type: 'reopen-sheet',
        key: sheetKey,
        shift,
      });
    },
    [activeShift, updateFleetWithTransaction]
  );

  // Check if a specific date and shift is finalized
  const isSheetFinalized = useCallback(
    (dateStr: string, shift: ShiftType = activeShift) => {
      const sheetKey = `${dateStr}_${shift}`;
      const meta =
        fleet.finalizedSheets?.[sheetKey] ||
        (shift === 'day' ? fleet.finalizedSheets?.[dateStr] : undefined);
      if (meta && meta.finalized) {
        return {
          finalized: true,
          finalizedAt: meta.finalizedAt,
          finalizedBy: meta.finalizedBy,
          shift: meta.shift || shift,
        };
      }
      return { finalized: false };
    },
    [fleet.finalizedSheets, activeShift]
  );

  // Add station to Fleet 1 doc
  const addStation = useCallback(
    async (stationName: string) => {
      const trimmed = stationName.trim();
      if (!trimmed) return;

      await updateFleetWithTransaction({
        type: 'add-station',
        station: trimmed,
      });
    },
    [updateFleetWithTransaction]
  );

  // Delete station from Fleet 1 doc
  const deleteStation = useCallback(
    async (stationName: string) => {
      await updateFleetWithTransaction({
        type: 'delete-station',
        station: stationName,
      });
    },
    [updateFleetWithTransaction]
  );

  // 1. Add Pump to Directory - saves the number to the directory (pumps).
  const addPumpToDirectory = useCallback(
    async (pumpName: string) => {
      const cleanPump = pumpName.trim();
      if (!cleanPump) return;

      await updateFleetWithTransaction({
        type: 'add-pump',
        pump: cleanPump,
      });
    },
    [updateFleetWithTransaction]
  );

  // 2. Assign to Station - handles moving from other station if requested to prevent duplicates
  const assignPumpToStation = useCallback(
    async (
      stationName: string,
      pumpName: string,
      moveFromOtherStation = true,
      expectedOldPump?: string
    ) => {
      const cleanStation = stationName.trim();
      const cleanPump = pumpName.trim();
      if (!cleanStation || !cleanPump) return;

      const currentPumps = fleet.stationPumps?.[cleanStation] || [];
      const expectedOld = expectedOldPump ?? (currentPumps[0] || '');

      await updateFleetWithTransaction({
        type: 'assign-pump',
        station: cleanStation,
        pump: cleanPump,
        moveFromOtherStation,
        expectedOldPump: expectedOld,
      });
    },
    [fleet.stationPumps, updateFleetWithTransaction]
  );

  // 3. Swap Pump on Station workflow: replaces oldPump with newPump on stationName
  const swapPumpOnStation = useCallback(
    async (stationName: string, oldPump: string, newPump: string, notes?: string) => {
      const cleanStation = stationName.trim();
      const cleanOld = oldPump.trim();
      const cleanNew = newPump.trim();
      if (!cleanStation || !cleanNew) return;

      await updateFleetWithTransaction({
        type: 'swap-pump',
        station: cleanStation,
        oldPump: cleanOld,
        newPump: cleanNew,
        expectedOldPump: cleanOld,
      });

      // Auto-record operational event for Pump Swap
      if (cleanOld && cleanNew && cleanOld !== cleanNew) {
        const swapNoteText = notes?.trim()
          ? notes.trim()
          : `Swapped ${cleanStation}: Pump ${cleanOld} → Pump ${cleanNew}`;

        recordPumpOpEvent({
          date: todayDateStr,
          shift: activeShift,
          station: cleanStation,
          pump: cleanNew,
          replacedPump: cleanOld,
          eventType: 'pump_swap',
          status: 'RUNNING',
          operator: technicianName || 'Operator',
          startedAt: Date.now(),
          resolvedAt: Date.now(),
          notes: swapNoteText,
        }).catch((err) => console.warn('Could not auto-record pump swap event:', err));
      }
    },
    [activeShift, recordPumpOpEvent, technicianName, todayDateStr, updateFleetWithTransaction]
  );

  // Delete log from Fleet 1
  const deleteLog = useCallback(
    async (logId: string) => {
      const docPath = `fleets/fleet1/logs/${logId}`;

      setAllLogs((prev) => prev.filter((l) => l.id !== logId));

      if (!navigator.onLine || !user) {
        enqueueWrite({
          type: 'delete',
          path: docPath,
        });
        setQueuedCount(getQueuedWrites().length);
        return;
      }

      try {
        const logRef = doc(db, docPath);
        await deleteDoc(logRef);
      } catch (err) {
        console.warn('Direct Firestore delete failed, queueing delete:', err);
        enqueueWrite({
          type: 'delete',
          path: docPath,
        });
        setQueuedCount(getQueuedWrites().length);
      }
    },
    [user]
  );

  // Move today's reading from oldPump to newPump and swap station assignment for a specific Shift
  const moveReadingPump = useCallback(
    async (params: {
      date: string;
      shift?: ShiftType;
      stationNumber: string;
      oldPumpNumber: string;
      newPumpNumber: string;
      customReadings?: {
        pumpHours: number | null;
        deckEngHours: number | null;
        notes?: string;
      };
    }) => {
      const { date, stationNumber, oldPumpNumber, newPumpNumber, customReadings } = params;
      const effectiveShift = params.shift || activeShift;
      const cleanStation = stationNumber.trim();
      const cleanOld = oldPumpNumber.trim();
      const cleanNew = newPumpNumber.trim();

      // 1. Swap pump on station
      await swapPumpOnStation(cleanStation, cleanOld, cleanNew);

      // 2. Locate any existing log for (date, shift, station, oldPump)
      const oldLogId = getLogDocIdWithShift(date, effectiveShift, cleanStation, cleanOld);
      const newLogId = getLogDocIdWithShift(date, effectiveShift, cleanStation, cleanNew);
      const existingLog = allLogs.find((l) => l.id === oldLogId);

      const pumpHours = customReadings ? customReadings.pumpHours : (existingLog ? existingLog.pumpHours : null);
      const deckEngHours = customReadings ? customReadings.deckEngHours : (existingLog ? existingLog.deckEngHours : null);
      const notes = customReadings?.notes ?? existingLog?.notes ?? '';

      // Only move/create record if there's actual data
      if (pumpHours !== null || deckEngHours !== null || (notes && notes.trim() !== '')) {
        const now = Date.now();
        const payload = {
          date,
          shift: effectiveShift,
          stationNumber: cleanStation,
          pumpNumber: cleanNew,
          pumpHours,
          deckEngHours,
          notes: (notes || '').slice(0, 1000),
          enteredBy: (existingLog?.enteredBy || technicianName || 'Technician').slice(0, 100),
          createdAt: existingLog ? existingLog.createdAt : now,
          updatedAt: now,
        };

        const newFullLog: MaintenanceLog = {
          id: newLogId,
          ...payload,
          _pendingSync: !navigator.onLine || !user,
        };

        // Optimistically update allLogs: remove oldLogId and replace/add newLogId
        setAllLogs((prev) => {
          const filtered = prev.filter((l) => l.id !== oldLogId && l.id !== newLogId);
          return [newFullLog, ...filtered];
        });

        const newDocPath = `fleets/fleet1/logs/${newLogId}`;
        const oldDocPath = `fleets/fleet1/logs/${oldLogId}`;

        if (!navigator.onLine || !user) {
          enqueueWrite({ type: 'set', path: newDocPath, data: payload });
          if (existingLog && oldLogId !== newLogId) {
            enqueueWrite({ type: 'delete', path: oldDocPath });
          }
          setQueuedCount(getQueuedWrites().length);
        } else {
          try {
            const newRef = doc(db, newDocPath);
            await setDoc(newRef, payload, { merge: true });
            if (existingLog && oldLogId !== newLogId) {
              const oldRef = doc(db, oldDocPath);
              await deleteDoc(oldRef);
            }
          } catch (err) {
            console.warn('Firestore move reading failed, queueing offline:', err);
            enqueueWrite({ type: 'set', path: newDocPath, data: payload });
            if (existingLog && oldLogId !== newLogId) {
              enqueueWrite({ type: 'delete', path: oldDocPath });
            }
            setQueuedCount(getQueuedWrites().length);
          }
        }
      } else if (existingLog && oldLogId !== newLogId) {
        await deleteLog(oldLogId);
      }
    },
    [activeShift, allLogs, swapPumpOnStation, technicianName, user, deleteLog]
  );

  // 4. Remove pump from one station only - does NOT delete from directory
  const removePumpFromStation = useCallback(
    async (stationName: string, pumpName: string) => {
      const cleanStation = stationName.trim();
      const cleanPump = pumpName.trim();
      if (!cleanStation || !cleanPump) return;

      await updateFleetWithTransaction({
        type: 'remove-pump-from-station',
        station: cleanStation,
        pump: cleanPump,
      });
    },
    [updateFleetWithTransaction]
  );

  // 5. Delete from fleet - removes that pump from directory and from every station. Old hour logs stay.
  const deletePumpFromFleet = useCallback(
    async (pumpName: string) => {
      const cleanPump = pumpName.trim();
      if (!cleanPump) return;

      await updateFleetWithTransaction({
        type: 'delete-pump',
        pump: cleanPump,
      });
    },
    [updateFleetWithTransaction]
  );

  // Clear all pumps from Fleet 1 doc
  const clearAllPumps = useCallback(async () => {
    await updateFleetWithTransaction({
      type: 'clear-all-pumps',
    });
  }, [updateFleetWithTransaction]);

  // Save Single Maintenance Log (Legacy/compatibility)
  const saveLog = useCallback(
    async (
      logData: Omit<MaintenanceLog, 'id' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const res = await saveSingleReading({
        date: logData.date,
        stationNumber: logData.stationNumber,
        pumpNumber: logData.pumpNumber,
        pumpHours: logData.pumpHours,
        deckEngHours: logData.deckEngHours,
        notes: logData.notes || logData.info,
      });
      return existingId || getLogDocId(logData.date, logData.stationNumber, logData.pumpNumber);
    },
    [saveSingleReading]
  );

  // Save Batch Logs (Legacy/compatibility)
  const saveBatchLogs = useCallback(
    async (
      batch: Array<{
        date: string;
        stationNumber: string;
        pumpNumber: string;
        pumpHours: number | null;
        deckEngHours: number | null;
        notes?: string;
        existingId?: string;
      }>
    ): Promise<void> => {
      for (const item of batch) {
        await saveSingleReading(item);
      }
    },
    [saveSingleReading]
  );

  // Manual Flush Queue
  const flushQueue = useCallback(async () => {
    setSyncStatus('connecting');
    const { successful } = await flushOfflineQueue();
    const currentQueue = getQueuedWrites();
    setQueuedCount(currentQueue.length);
    if (currentQueue.length === 0 && navigator.onLine) {
      setSyncStatus('live');
    }
  }, []);

  const value: FleetContextValue = {
    user,
    authLoading,
    anonDisabled,
    syncStatus,
    queuedCount,
    syncErrors,
    retrySyncErrors,
    fleet,
    allLogs,
    todayLogs,
    allTodayLogs,
    todayDateStr,
    activeShift,
    setActiveShift,
    technicianName,
    setTechnicianName,
    saveSingleReading,
    getPreviousReading,
    finalizeDailySheet,
    reopenDailySheet,
    isSheetFinalized,
    getLogsForDateAndShift,
    saveLog,
    saveBatchLogs,
    deleteLog,
    addStation,
    deleteStation,
    addPumpToDirectory,
    assignPumpToStation,
    swapPumpOnStation,
    moveReadingPump,
    removePumpFromStation,
    deletePumpFromFleet,
    clearAllPumps,
    getPumpsForStation,
    getStationForPump,
    pumpOpsEvents,
    currentStage: currentStageState,
    setCurrentStage,
    recordPumpOpEvent,
    updatePumpOpEvent,
    startRepair,
    returnToService,
    markDerated,
    recordWatchItem,
    getPumpCurrentStatus,
    shiftNotes: fleet.shiftNotes || {},
    setShiftNotes,
    finalizeShiftHandoff,
    flushQueue,
    retryAnonymousAuth: attemptAnonymousAuth,
    signInGoogle,
    // Shift Transitions
    isShiftTransitionAvailable,
    detectedShift,
    detectedOpDate,
    acceptShiftTransition,
    dismissShiftTransition,
    // Concurrent Assignment Conflict Warning & Management
    assignmentConflicts,
    dismissAssignmentConflict,
  };

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
};

export const useFleet = (): FleetContextValue => {
  const context = useContext(FleetContext);
  if (!context) {
    throw new Error('useFleet must be used within a FleetProvider');
  }
  return context;
};
