/**
 * Fleet 1 Pump Hours Data Types
 */

export type ShiftType = 'day' | 'night';
export type ShiftWithLegacy = ShiftType | 'legacy';

export interface ShiftFinalizedInfo {
  finalized: boolean;
  finalizedAt: number;
  finalizedBy: string;
  shift?: ShiftType;
}

export type PumpOpStatus = 'RUNNING' | 'DERATED' | 'DOWN' | 'REPAIRING' | 'STANDBY';

export type PumpOpEventType =
  | 'pump_down'
  | 'repair_started'
  | 'returned_to_service'
  | 'derated'
  | 'watch_item'
  | 'pump_swap'
  | 'general_note'
  | 'spot_check';

export type SpotCheckType = 'valves_seats';
export type SpotCheckCondition = 'GOOD' | 'WATCH' | 'BAD';
export type SpotCheckPart = 'VALVE' | 'SEAT' | 'BOTH';

export interface SpotCheckHoleResult {
  hole: number; // 1 | 2 | 3 | 4 | 5
  condition: SpotCheckCondition;
  part?: SpotCheckPart;
  recheckNextStage?: boolean;
}

export interface PumpOpsEvent {
  id: string;
  date: string; // YYYY-MM-DD
  shift: ShiftType; // 'day' | 'night'
  station: string; // e.g. "Station 3"
  pump: string; // e.g. "145"
  eventType: PumpOpEventType;
  status: PumpOpStatus; // resulting pump status
  stage?: number | string | null;
  category?: string; // 'FLUID END' | 'POWER END' | 'ENGINE' etc.
  component?: string; // 'PACKING' | 'D-RINGS' etc.
  holes?: number[]; // [1, 2, 3, 4, 5]
  limitation?: string; // for DERATED
  notes?: string;
  watchNextShift?: boolean;
  startedAt: number; // timestamp when issue started
  downAt?: number | null; // timestamp when pump operational status became DOWN
  repairStartedAt?: number | null;
  resolvedAt?: number | null;
  downtimeMinutes?: number | null;
  // Spot Check fields:
  spotCheckType?: SpotCheckType;
  checks?: SpotCheckHoleResult[];
  recheckNextStage?: boolean;
  sourceSpotCheckId?: string;
  createdFromSpotCheck?: boolean;
  // For pump_swap:
  replacedPump?: string; // old pump if this is a swap
  newPump?: string;
  operator: string;
  createdAt: number;
  updatedAt: number;
  lastEditedAt?: number;
  lastEditedBy?: string;
  _pendingSync?: boolean;
}

export interface ShiftHandoffSnapshot {
  date: string;
  shift: ShiftType;
  finalizedAt: number;
  finalizedBy: string;
  incomingOperator?: string;
  outgoingOperator?: string;
  shiftNotes?: string;
  lineup: Array<{
    station: string;
    pump: string;
    status: PumpOpStatus;
    activeIssueSummary?: string;
  }>;
  activeIssues: PumpOpsEvent[];
  watchItems: PumpOpsEvent[];
  completedRepairs: PumpOpsEvent[];
  pumpSwaps: PumpOpsEvent[];
}

export interface FleetDoc {
  name: string;
  stations: string[];
  pumps: string[]; // overall list of pumps in directory
  stationPumps?: Record<string, string[]>; // mapping of station -> pump numbers
  finalizedSheets?: Record<string, ShiftFinalizedInfo>;
  currentStage?: number | string; // remembered current stage e.g. 37
  shiftNotes?: Record<string, string>; // date_shift -> general shift notes
  finalizedHandoffs?: Record<string, ShiftHandoffSnapshot>; // date_shift -> snapshot
}

export type FleetMutation =
  | { type: 'set-stage'; stage: number | string }
  | { type: 'set-shift-notes'; key: string; notes: string }
  | { type: 'finalize-handoff'; key: string; snapshot: ShiftHandoffSnapshot }
  | { type: 'finalize-sheet'; key: string; meta: ShiftFinalizedInfo }
  | { type: 'reopen-sheet'; key: string; shift?: ShiftType }
  | { type: 'add-station'; station: string }
  | { type: 'delete-station'; station: string }
  | { type: 'add-pump'; pump: string }
  | { type: 'assign-pump'; station: string; pump: string; moveFromOtherStation?: boolean; expectedOldPump?: string }
  | { type: 'swap-pump'; station: string; oldPump: string; newPump: string; expectedOldPump?: string }
  | { type: 'remove-pump-from-station'; station: string; pump: string }
  | { type: 'delete-pump'; pump: string }
  | { type: 'clear-all-pumps' }
  | { type: 'patch'; patch: Partial<FleetDoc> };

export interface AssignmentConflictInfo {
  id: string;
  station: string;
  currentPump: string;
  requestedPump: string;
  timestamp: number;
}

export interface MaintenanceLog {
  id: string;
  date: string; // YYYY-MM-DD
  shift?: ShiftWithLegacy; // 'day' | 'night' | 'legacy'
  stationNumber: string;
  pumpNumber: string;
  pumpHours: number | null;
  deckEngHours: number | null;
  notes?: string;
  // Legacy fields kept for backward compatibility with existing records
  packing?: string;
  plunger?: string;
  vs?: string;
  info?: string;
  finalized?: boolean;
  finalizedAt?: number;
  finalizedBy?: string;
  enteredBy: string;
  createdAt: number;
  updatedAt: number;
  _pendingSync?: boolean; // local offline indicator
}

export interface QueuedWrite {
  id: string;
  type: 'set' | 'update' | 'delete' | 'fleet-update' | 'event-update';
  path: string;
  data?: any;
  timestamp: number;
  retryCount: number;
  expected?: Record<string, any>;
  isConflict?: boolean;
  conflictDetails?: SyncErrorInfo['conflictDetails'];
  lastError?: string;
  lastAttempt?: number;
  status?: 'pending' | 'retrying' | 'failed';
}

export interface SyncErrorInfo {
  id: string;
  path: string;
  error: string;
  timestamp: number;
  retryCount: number;
  isConflict?: boolean;
  conflictDetails?: {
    station: string;
    currentPump: string;
    requestedPump: string;
    expectedOldPump?: string;
  };
}

export type SyncStatus = 'live' | 'connecting' | 'offline';

