import type { FleetDoc, FleetMutation } from '../types';

export function extractStationNumber(stationName: string): number {
  const match = (stationName || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : 9999;
}

export function sortStations(stations: string[]): string[] {
  return [...stations].sort((a, b) => {
    const numA = extractStationNumber(a);
    const numB = extractStationNumber(b);
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export class AssignmentConflictError extends Error {
  public station: string;
  public currentPump: string;
  public requestedPump: string;
  public expectedOldPump: string;
  public isAssignmentConflict = true;

  constructor(station: string, currentPump: string, requestedPump: string, expectedOldPump: string) {
    super(
      `STATION ASSIGNMENT CHANGED: Station "${station}" currently has Pump "${currentPump}", but expected Pump "${expectedOldPump}". Request to assign "${requestedPump}" was rejected.`
    );
    this.name = 'AssignmentConflictError';
    this.station = station;
    this.currentPump = currentPump;
    this.requestedPump = requestedPump;
    this.expectedOldPump = expectedOldPump;
  }
}

/**
 * Pure function to apply safe, targeted mutation operations to a FleetDoc.
 * Used both for optimistic local state and for replaying queued mutations against
 * the latest Firestore server document so that concurrent updates to other fields
 * (newer pump assignments, inventory, handoff notes, stage information) are NEVER overwritten.
 */
export function applyFleetMutation(base: FleetDoc, mutation: FleetMutation): FleetDoc {
  switch (mutation.type) {
    case 'set-stage':
      return {
        ...base,
        currentStage: mutation.stage,
      };

    case 'set-shift-notes':
      return {
        ...base,
        shiftNotes: {
          ...(base.shiftNotes || {}),
          [mutation.key]: mutation.notes,
        },
      };

    case 'finalize-handoff':
      return {
        ...base,
        finalizedHandoffs: {
          ...(base.finalizedHandoffs || {}),
          [mutation.key]: mutation.snapshot,
        },
      };

    case 'finalize-sheet':
      return {
        ...base,
        finalizedSheets: {
          ...(base.finalizedSheets || {}),
          [mutation.key]: mutation.meta,
        },
      };

    case 'reopen-sheet': {
      const currentFinalized = { ...(base.finalizedSheets || {}) };
      delete currentFinalized[mutation.key];
      if (mutation.shift === 'day' || mutation.key.endsWith('_day')) {
        const datePart = mutation.key.split('_')[0];
        delete currentFinalized[datePart];
      }
      return {
        ...base,
        finalizedSheets: currentFinalized,
      };
    }

    case 'add-station': {
      const trimmed = mutation.station.trim();
      if (!trimmed || base.stations.includes(trimmed)) return base;
      return {
        ...base,
        stations: sortStations(Array.from(new Set([...base.stations, trimmed]))),
      };
    }

    case 'delete-station': {
      const updatedStations = base.stations.filter((s) => s !== mutation.station);
      const currentStationPumps = { ...(base.stationPumps || {}) };
      delete currentStationPumps[mutation.station];
      return {
        ...base,
        stations: updatedStations,
        stationPumps: currentStationPumps,
      };
    }

    case 'add-pump': {
      const cleanPump = mutation.pump.trim();
      if (!cleanPump || base.pumps.includes(cleanPump)) return base;
      return {
        ...base,
        pumps: [...base.pumps, cleanPump],
      };
    }

    case 'assign-pump': {
      const cleanStation = mutation.station.trim();
      const cleanPump = mutation.pump.trim();
      if (!cleanStation || !cleanPump) return base;

      const currentStationPumps = { ...(base.stationPumps || {}) };
      const currentStationList = Array.isArray(currentStationPumps[cleanStation])
        ? currentStationPumps[cleanStation]
        : [];

      // Validate expected original pump if specified
      const expectedOld = (mutation.expectedOldPump || '').trim();
      if (expectedOld) {
        const hasExpectedOld = currentStationList.some(
          (p) => p.trim().toLowerCase() === expectedOld.toLowerCase()
        );
        if (!hasExpectedOld) {
          const actualCurrent = currentStationList[0] || 'Unassigned';
          throw new AssignmentConflictError(cleanStation, actualCurrent, cleanPump, expectedOld);
        }
      }

      // If moving from another station, remove it from other stations first
      if (mutation.moveFromOtherStation !== false) {
        Object.keys(currentStationPumps).forEach((st) => {
          if (st !== cleanStation && Array.isArray(currentStationPumps[st])) {
            currentStationPumps[st] = currentStationPumps[st].filter((p) => p !== cleanPump);
          }
        });
      }

      // In Fleet 1, each station has one primary assigned pump unless legitimately multiple
      // If expectedOld was provided and replaced, replace it cleanly; otherwise add/set
      let nextStationList: string[];
      if (expectedOld) {
        nextStationList = currentStationList.map((p) =>
          p.trim().toLowerCase() === expectedOld.toLowerCase() ? cleanPump : p
        );
        if (!nextStationList.includes(cleanPump)) {
          nextStationList.push(cleanPump);
        }
      } else {
        nextStationList = [...currentStationList];
        if (!nextStationList.includes(cleanPump)) {
          nextStationList.push(cleanPump);
        }
      }

      currentStationPumps[cleanStation] = Array.from(new Set(nextStationList));

      const updatedPumps = base.pumps.includes(cleanPump)
        ? base.pumps
        : [...base.pumps, cleanPump];

      return {
        ...base,
        pumps: updatedPumps,
        stationPumps: currentStationPumps,
      };
    }

    case 'swap-pump': {
      const cleanStation = mutation.station.trim();
      const cleanOld = mutation.oldPump.trim();
      const cleanNew = mutation.newPump.trim();
      if (!cleanStation || !cleanNew) return base;

      const currentStationPumps = { ...(base.stationPumps || {}) };
      const currentStationList = Array.isArray(currentStationPumps[cleanStation])
        ? currentStationPumps[cleanStation]
        : [];

      // 1. VALIDATE: The station assignment against the expected original pump
      const expectedOld = (mutation.expectedOldPump || cleanOld).trim();
      if (expectedOld) {
        const hasExpectedOld = currentStationList.some(
          (p) => p.trim().toLowerCase() === expectedOld.toLowerCase()
        );
        if (!hasExpectedOld) {
          const actualCurrent = currentStationList[0] || 'Unassigned';
          // Reject the conflicting swap with a strongly typed AssignmentConflictError
          throw new AssignmentConflictError(cleanStation, actualCurrent, cleanNew, expectedOld);
        }
      }

      // Remove newPump from wherever it currently is assigned across all stations
      Object.keys(currentStationPumps).forEach((st) => {
        if (Array.isArray(currentStationPumps[st])) {
          currentStationPumps[st] = currentStationPumps[st].filter((p) => p !== cleanNew);
        }
      });

      // Replace oldPump with newPump on target station
      let stationList = [...currentStationList];
      if (cleanOld) {
        stationList = stationList.map((p) =>
          p.trim().toLowerCase() === cleanOld.toLowerCase() ? cleanNew : p
        );
        if (!stationList.includes(cleanNew)) {
          stationList.push(cleanNew);
        }
      } else {
        stationList.push(cleanNew);
      }

      currentStationPumps[cleanStation] = Array.from(new Set(stationList));

      const updatedPumps = base.pumps.includes(cleanNew)
        ? base.pumps
        : [...base.pumps, cleanNew];

      return {
        ...base,
        pumps: updatedPumps,
        stationPumps: currentStationPumps,
      };
    }

    case 'remove-pump-from-station': {
      const cleanStation = mutation.station.trim();
      const cleanPump = mutation.pump.trim();
      const currentStationPumps = { ...(base.stationPumps || {}) };
      if (!currentStationPumps[cleanStation]) return base;

      currentStationPumps[cleanStation] = currentStationPumps[cleanStation].filter(
        (p) => p !== cleanPump
      );
      return {
        ...base,
        stationPumps: currentStationPumps,
      };
    }

    case 'delete-pump': {
      const cleanPump = mutation.pump.trim();
      if (!cleanPump) return base;

      const updatedPumps = base.pumps.filter((p) => p !== cleanPump);
      const currentStationPumps = { ...(base.stationPumps || {}) };

      Object.keys(currentStationPumps).forEach((st) => {
        currentStationPumps[st] = currentStationPumps[st].filter((p) => p !== cleanPump);
      });

      return {
        ...base,
        pumps: updatedPumps,
        stationPumps: currentStationPumps,
      };
    }

    case 'clear-all-pumps':
      return {
        ...base,
        pumps: [],
        stationPumps: {},
      };

    case 'patch':
      return {
        ...base,
        ...mutation.patch,
      };

    default:
      return base;
  }
}
