import React, { useState, useMemo } from 'react';
import { useFleet, sortStations, extractStationNumber } from '../context/FleetContext';
import type { ShiftType } from '../types';
import {
  Clock,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Lock,
  ArrowRight,
  Printer,
  Calendar,
  Check,
  Boxes,
  Sun,
  Moon,
  Activity,
  HardHat,
  Edit3,
  Plus,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface HomeViewProps {
  onEnterHours: (shift?: ShiftType, section?: 'lineup' | 'standby' | 'all', pump?: string) => void;
  onGoToLineup: () => void;
  onGoToInventory?: () => void;
  onGoToOps?: () => void;
  onGoToMechanics?: () => void;
  onGoToPrint: (shift?: ShiftType) => void;
  onGoToHistory: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onEnterHours,
  onGoToLineup,
  onGoToInventory,
  onGoToOps,
  onGoToMechanics,
  onGoToPrint,
  onGoToHistory,
}) => {
  const {
    todayDateStr,
    activeShift,
    fleet,
    isSheetFinalized,
    getPumpsForStation,
    getPreviousReading,
    getLogsForDateAndShift,
    getPumpCurrentStatus,
  } = useFleet();

  // Active status counts for mobile home view
  const opsSummary = useMemo(() => {
    let downCount = 0;
    let spotCheckCount = 0;
    let deratedCount = 0;
    let repairingCount = 0;
    fleet.pumps.forEach((pump) => {
      const st = getPumpCurrentStatus(pump);
      if (st.activeEvent?.eventType === 'spot_check') spotCheckCount++;
      else if (st.status === 'DOWN') downCount++;
      else if (st.status === 'DERATED') deratedCount++;
      else if (st.status === 'REPAIRING') repairingCount++;
    });
    return { downCount, spotCheckCount, deratedCount, repairingCount };
  }, [fleet.pumps, getPumpCurrentStatus]);

  // Selected shift for preview table
  const [previewShift, setPreviewShift] = useState<ShiftType>(activeShift || 'day');

  // Active assigned stations in order
  const activeStations = useMemo(() => {
    const list = fleet.stations.filter((st) => getPumpsForStation(st).length > 0);
    return sortStations(list);
  }, [fleet.stations, getPumpsForStation]);

  const totalStations = activeStations.length;

  // Day Shift Logs & Status
  const dayLogs = useMemo(() => {
    return getLogsForDateAndShift(todayDateStr, 'day');
  }, [getLogsForDateAndShift, todayDateStr]);

  const dayStatus = useMemo(() => {
    const enteredStations: string[] = [];
    const missingStations: string[] = [];

    activeStations.forEach((st) => {
      const pump = getPumpsForStation(st)[0] || '';
      const log = dayLogs.find(
        (l) => l.stationNumber === st && l.pumpNumber.trim().toLowerCase() === pump.trim().toLowerCase()
      );
      const hasPumpHours = log && log.pumpHours !== null && log.pumpHours !== undefined;
      if (hasPumpHours) {
        enteredStations.push(st);
      } else {
        missingStations.push(st);
      }
    });

    const isAllComplete = totalStations > 0 && enteredStations.length === totalStations;
    const finalInfo = isSheetFinalized(todayDateStr, 'day');

    const latestEpoch = dayLogs.length > 0 ? Math.max(...dayLogs.map((l) => l.updatedAt || l.createdAt || 0)) : 0;
    const lastUpdateStr = latestEpoch ? new Date(latestEpoch).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

    return {
      enteredCount: enteredStations.length,
      enteredStations,
      missingStations,
      isAllComplete,
      finalized: finalInfo.finalized,
      finalizedAt: finalInfo.finalizedAt,
      finalizedBy: finalInfo.finalizedBy,
      lastUpdateStr,
    };
  }, [activeStations, dayLogs, getPumpsForStation, isSheetFinalized, todayDateStr, totalStations]);

  // Night Shift Logs & Status
  const nightLogs = useMemo(() => {
    return getLogsForDateAndShift(todayDateStr, 'night');
  }, [getLogsForDateAndShift, todayDateStr]);

  const nightStatus = useMemo(() => {
    const enteredStations: string[] = [];
    const missingStations: string[] = [];

    activeStations.forEach((st) => {
      const pump = getPumpsForStation(st)[0] || '';
      const log = nightLogs.find(
        (l) => l.stationNumber === st && l.pumpNumber.trim().toLowerCase() === pump.trim().toLowerCase()
      );
      const hasPumpHours = log && log.pumpHours !== null && log.pumpHours !== undefined;
      if (hasPumpHours) {
        enteredStations.push(st);
      } else {
        missingStations.push(st);
      }
    });

    const isAllComplete = totalStations > 0 && enteredStations.length === totalStations;
    const finalInfo = isSheetFinalized(todayDateStr, 'night');

    const latestEpoch = nightLogs.length > 0 ? Math.max(...nightLogs.map((l) => l.updatedAt || l.createdAt || 0)) : 0;
    const lastUpdateStr = latestEpoch ? new Date(latestEpoch).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

    return {
      enteredCount: enteredStations.length,
      enteredStations,
      missingStations,
      isAllComplete,
      finalized: finalInfo.finalized,
      finalizedAt: finalInfo.finalizedAt,
      finalizedBy: finalInfo.finalizedBy,
      lastUpdateStr,
    };
  }, [activeStations, nightLogs, getPumpsForStation, isSheetFinalized, todayDateStr, totalStations]);

  // Formatted date string (e.g. OCTOBER 6, 2026)
  const formattedToday = useMemo(() => {
    const parts = todayDateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    }
    return todayDateStr;
  }, [todayDateStr]);

  // Preview logs for the currently selected preview tab
  const previewLogs = previewShift === 'day' ? dayLogs : nightLogs;

  // Standby pumps in inventory not assigned to any spread station
  const standbyPumps = useMemo(() => {
    const assignedSet = new Set<string>();
    Object.values(fleet.stationPumps || {}).forEach((pList) => {
      if (Array.isArray(pList)) {
        pList.forEach((p) => assignedSet.add(p.trim().toLowerCase()));
      }
    });
    const list = (fleet.pumps || []).filter((p) => !assignedSet.has(p.trim().toLowerCase()));
    previewLogs.forEach((l) => {
      if (l.stationNumber && l.stationNumber.toLowerCase().includes('standby') && l.pumpNumber) {
        const cleanP = l.pumpNumber.trim();
        if (cleanP && !assignedSet.has(cleanP.toLowerCase()) && !list.includes(cleanP)) {
          list.push(cleanP);
        }
      }
    });
    return list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [fleet.pumps, fleet.stationPumps, previewLogs]);

  // Standby pumps logged count for Day Shift
  const dayStandbyEntered = useMemo(() => {
    return standbyPumps.filter((p) => {
      const log = dayLogs.find(
        (l) =>
          l.stationNumber.toLowerCase().includes('standby') &&
          l.pumpNumber.trim().toLowerCase() === p.trim().toLowerCase()
      );
      return log && (log.pumpHours !== null || log.deckEngHours !== null);
    }).length;
  }, [standbyPumps, dayLogs]);

  // Standby pumps logged count for Night Shift
  const nightStandbyEntered = useMemo(() => {
    return standbyPumps.filter((p) => {
      const log = nightLogs.find(
        (l) =>
          l.stationNumber.toLowerCase().includes('standby') &&
          l.pumpNumber.trim().toLowerCase() === p.trim().toLowerCase()
      );
      return log && (log.pumpHours !== null || log.deckEngHours !== null);
    }).length;
  }, [standbyPumps, nightLogs]);

  const activeStatus = activeShift === 'night' ? nightStatus : dayStatus;
  const activeStandbyEntered = activeShift === 'night' ? nightStandbyEntered : dayStandbyEntered;

  return (
    <div className="space-y-5 pb-24 max-w-4xl mx-auto">
      {/* MOBILE SIMPLIFIED NAVIGATION & SUMMARY (Requirement 5) */}
      <div className="sm:hidden bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase font-black tracking-widest text-amber-400 block">
              FLEET 1
            </span>
            <div className="text-lg font-black text-slate-100 uppercase tracking-tight">
              {activeShift === 'day' ? 'DAY SHIFT' : 'NIGHT SHIFT'}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              OPERATIONAL DATE
            </span>
            <span className="text-xs font-mono font-bold text-slate-200">
              {formattedToday.toUpperCase()}
            </span>
          </div>
        </div>

        {/* 3 PROMINENT ACTIONS: ENTER HOURS, PUMP OPS, MECHANICS */}
        <div className="grid grid-cols-1 gap-2 pt-1">
          {/* 1. ENTER HOURS */}
          <button
            type="button"
            onClick={() => onEnterHours(activeShift, 'lineup')}
            className="w-full min-h-[50px] px-4 py-3 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Edit3 className="w-5 h-5 stroke-[2.5]" />
              <span>ENTER HOURS</span>
            </div>
            <span className="font-mono text-xs font-black bg-slate-950/20 px-2 py-0.5 rounded">
              {activeStatus.enteredCount} / {totalStations} DONE
            </span>
          </button>

          {/* 2. PUMP OPS */}
          {onGoToOps && (
            <button
              type="button"
              onClick={onGoToOps}
              className="w-full min-h-[48px] px-4 py-3 bg-slate-800 hover:bg-slate-700 active:scale-98 border border-slate-700 text-slate-100 font-black text-sm uppercase tracking-wider rounded-xl transition-all flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Activity className="w-5 h-5 text-amber-400" />
                <span>PUMP OPS</span>
              </div>
              <div className="flex flex-wrap justify-end gap-2 text-xs font-mono font-bold">
                <span className={opsSummary.downCount > 0 ? 'text-rose-400' : 'text-slate-400'}>
                  {opsSummary.downCount} DOWN
                </span>
                <span className="text-cyan-400">{opsSummary.spotCheckCount} SPOT CHECK</span>
                <span className="text-slate-600">•</span>
                <span className={opsSummary.deratedCount > 0 ? 'text-purple-400' : 'text-slate-400'}>
                  {opsSummary.deratedCount} DERATED
                </span>
              </div>
            </button>
          )}

          {/* 3. MECHANICS */}
          {onGoToMechanics && (
            <button
              type="button"
              onClick={onGoToMechanics}
              className="w-full min-h-[48px] px-4 py-3 bg-slate-800 hover:bg-slate-700 active:scale-98 border border-slate-700 text-slate-100 font-black text-sm uppercase tracking-wider rounded-xl transition-all flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <HardHat className="w-5 h-5 text-amber-400" />
                <span>MECHANICS</span>
              </div>
              <span className="text-xs text-slate-400 font-medium">Active Issues</span>
            </button>
          )}
        </div>

      </div>

      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl hidden sm:flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-black tracking-widest text-amber-400">
              FLEET 1 PUMP HOURS
            </span>
            <span className="text-slate-600 font-bold">•</span>
            <span className="text-xs font-mono font-bold text-slate-300">
              {formattedToday}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight mt-1">
            Today's Hours
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Independent Day &amp; Night shift pump logs for {formattedToday}
          </p>
        </div>

        {/* Quick Utility Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onGoToPrint(previewShift)}
            className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            title="Print Shift Sheet"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
          {onGoToOps && (
            <button
              onClick={onGoToOps}
              className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>Pump Ops</span>
            </button>
          )}
          {onGoToMechanics && (
            <button
              onClick={onGoToMechanics}
              className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <HardHat className="w-3.5 h-3.5 text-amber-400" />
              <span>Mechanics</span>
            </button>
          )}
          {onGoToInventory && (
            <button
              onClick={onGoToInventory}
              className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Boxes className="w-3.5 h-3.5 text-amber-400" />
              <span>Inventory</span>
            </button>
          )}
          <button
            onClick={onGoToLineup}
            className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Lineup</span>
          </button>
        </div>
      </div>

      <button type="button" onClick={() => onEnterHours(activeShift === 'day' ? 'night' : 'day', 'lineup')}
        className="sm:hidden w-full min-h-[48px] flex items-center justify-between gap-2 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm">
        <span className="font-bold">{activeShift === 'day' ? 'Night' : 'Day'} Shift</span>
        <span className="text-slate-400 font-mono">{(activeShift === 'day' ? nightStatus : dayStatus).enteredCount} / {totalStations} complete →</span>
      </button>

      {/* TWO SEPARATE SHIFT CARDS: DAY SHIFT and NIGHT SHIFT */}
      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ================= DAY SHIFT CARD ================= */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 relative overflow-hidden flex flex-col justify-between">
          <div
            className={`absolute top-0 left-0 right-0 h-1.5 ${
              dayStatus.finalized
                ? 'bg-emerald-500'
                : dayStatus.isAllComplete
                ? 'bg-emerald-400'
                : dayStatus.enteredCount > 0
                ? 'bg-amber-500'
                : 'bg-slate-800'
            }`}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Sun className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs uppercase font-black tracking-wider text-amber-400 block">
                    SHIFT 1
                  </span>
                  <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">
                    DAY SHIFT
                  </h2>
                </div>
              </div>

              {dayStatus.finalized && (
                <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-mono font-bold rounded-lg flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>FINALIZED</span>
                </span>
              )}
            </div>

            {/* Status Display */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
              {dayStatus.finalized ? (
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 font-mono font-black text-xl">
                    <CheckCircle2 className="w-5 h-5 shrink-0 stroke-[2.5]" />
                    <span>{totalStations} / {totalStations} COMPLETE ✓</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    Finalized by: <strong>{dayStatus.finalizedBy || 'Operator'}</strong>
                    {dayStatus.finalizedAt && (
                      <span> at {new Date(dayStatus.finalizedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    )}
                  </p>
                </div>
              ) : dayStatus.isAllComplete ? (
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 font-mono font-black text-xl">
                    <CheckCircle2 className="w-5 h-5 shrink-0 stroke-[2.5]" />
                    <span>{totalStations} / {totalStations} COMPLETE ✓</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Ready to review &amp; finalize Day Shift
                  </p>
                </div>
              ) : dayStatus.enteredCount > 0 ? (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-xl text-amber-400">
                      {dayStatus.enteredCount} / {totalStations} COMPLETE
                    </span>
                    <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      <span>{dayStatus.missingStations.length} MISSING</span>
                    </span>
                  </div>
                  {dayStatus.lastUpdateStr && (
                    <p className="text-[11px] text-slate-500 font-mono mt-1">
                      Last update: {dayStatus.lastUpdateStr}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="font-mono font-black text-xl text-slate-400">
                    0 / {totalStations} COMPLETE
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Day Shift readings not started yet
                  </p>
                </div>
              )}
            </div>

            {/* Standby Summary Pill */}
            {standbyPumps.length > 0 && (
              <div className="flex items-center justify-between bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400 font-mono text-[11px]">
                  Standby: <strong className="text-amber-400 font-bold">{dayStandbyEntered} / {standbyPumps.length} logged</strong>
                </span>
                <button
                  type="button"
                  onClick={() => onEnterHours('day', 'standby')}
                  className="text-amber-400 hover:text-amber-300 font-bold text-[11px] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Enter Standby →</span>
                </button>
              </div>
            )}

            {/* Missing Stations Pills for Day */}
            {!dayStatus.isAllComplete && dayStatus.missingStations.length > 0 && dayStatus.enteredCount > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                  Missing ({dayStatus.missingStations.length}):
                </span>
                <div className="flex flex-wrap gap-1">
                  {dayStatus.missingStations.slice(0, 8).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => onEnterHours('day')}
                      className="px-2 py-0.5 bg-slate-950 border border-rose-500/30 text-rose-300 font-mono text-[11px] font-bold rounded hover:border-amber-400 hover:text-amber-300 cursor-pointer"
                    >
                      {st}
                    </button>
                  ))}
                  {dayStatus.missingStations.length > 8 && (
                    <span className="text-[11px] font-mono text-slate-500 self-center">
                      +{dayStatus.missingStations.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Button for Day Shift */}
          <div className="pt-3">
            <button
              onClick={() => onEnterHours('day')}
              className={`w-full min-h-[48px] px-5 py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-98 ${
                dayStatus.finalized
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  : dayStatus.isAllComplete
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                  : dayStatus.enteredCount > 0
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25'
              }`}
            >
              <span>
                {dayStatus.finalized
                  ? 'VIEW / EDIT DAY SHIFT'
                  : dayStatus.isAllComplete
                  ? 'REVIEW / FINALIZE DAY SHIFT'
                  : dayStatus.enteredCount > 0
                  ? 'CONTINUE DAY SHIFT'
                  : 'ENTER DAY SHIFT HOURS'}
              </span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>
          </div>
        </div>

        {/* ================= NIGHT SHIFT CARD ================= */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 relative overflow-hidden flex flex-col justify-between">
          <div
            className={`absolute top-0 left-0 right-0 h-1.5 ${
              nightStatus.finalized
                ? 'bg-emerald-500'
                : nightStatus.isAllComplete
                ? 'bg-emerald-400'
                : nightStatus.enteredCount > 0
                ? 'bg-indigo-500'
                : 'bg-slate-800'
            }`}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs uppercase font-black tracking-wider text-indigo-400 block">
                    SHIFT 2
                  </span>
                  <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">
                    NIGHT SHIFT
                  </h2>
                </div>
              </div>

              {nightStatus.finalized && (
                <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-mono font-bold rounded-lg flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>FINALIZED</span>
                </span>
              )}
            </div>

            {/* Status Display */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
              {nightStatus.finalized ? (
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 font-mono font-black text-xl">
                    <CheckCircle2 className="w-5 h-5 shrink-0 stroke-[2.5]" />
                    <span>{totalStations} / {totalStations} COMPLETE ✓</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    Finalized by: <strong>{nightStatus.finalizedBy || 'Operator'}</strong>
                    {nightStatus.finalizedAt && (
                      <span> at {new Date(nightStatus.finalizedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    )}
                  </p>
                </div>
              ) : nightStatus.isAllComplete ? (
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 font-mono font-black text-xl">
                    <CheckCircle2 className="w-5 h-5 shrink-0 stroke-[2.5]" />
                    <span>{totalStations} / {totalStations} COMPLETE ✓</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Ready to review &amp; finalize Night Shift
                  </p>
                </div>
              ) : nightStatus.enteredCount > 0 ? (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-xl text-indigo-400">
                      {nightStatus.enteredCount} / {totalStations} COMPLETE
                    </span>
                    <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      <span>{nightStatus.missingStations.length} MISSING</span>
                    </span>
                  </div>
                  {nightStatus.lastUpdateStr && (
                    <p className="text-[11px] text-slate-500 font-mono mt-1">
                      Last update: {nightStatus.lastUpdateStr}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="font-mono font-black text-xl text-slate-400">
                    0 / {totalStations} COMPLETE
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Night Shift readings not started yet
                  </p>
                </div>
              )}
            </div>

            {/* Standby Summary Pill */}
            {standbyPumps.length > 0 && (
              <div className="flex items-center justify-between bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400 font-mono text-[11px]">
                  Standby: <strong className="text-indigo-400 font-bold">{nightStandbyEntered} / {standbyPumps.length} logged</strong>
                </span>
                <button
                  type="button"
                  onClick={() => onEnterHours('night', 'standby')}
                  className="text-indigo-400 hover:text-indigo-300 font-bold text-[11px] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Enter Standby →</span>
                </button>
              </div>
            )}

            {/* Missing Stations Pills for Night */}
            {!nightStatus.isAllComplete && nightStatus.missingStations.length > 0 && nightStatus.enteredCount > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                  Missing ({nightStatus.missingStations.length}):
                </span>
                <div className="flex flex-wrap gap-1">
                  {nightStatus.missingStations.slice(0, 8).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => onEnterHours('night')}
                      className="px-2 py-0.5 bg-slate-950 border border-rose-500/30 text-rose-300 font-mono text-[11px] font-bold rounded hover:border-indigo-400 hover:text-indigo-300 cursor-pointer"
                    >
                      {st}
                    </button>
                  ))}
                  {nightStatus.missingStations.length > 8 && (
                    <span className="text-[11px] font-mono text-slate-500 self-center">
                      +{nightStatus.missingStations.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Button for Night Shift */}
          <div className="pt-3">
            <button
              onClick={() => onEnterHours('night')}
              className={`w-full min-h-[48px] px-5 py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-98 ${
                nightStatus.finalized
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  : nightStatus.isAllComplete
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                  : nightStatus.enteredCount > 0
                  ? 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/25'
                  : 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/25'
              }`}
            >
              <span>
                {nightStatus.finalized
                  ? 'VIEW / EDIT NIGHT SHIFT'
                  : nightStatus.isAllComplete
                  ? 'REVIEW / FINALIZE NIGHT SHIFT'
                  : nightStatus.enteredCount > 0
                  ? 'CONTINUE NIGHT SHIFT'
                  : 'ENTER NIGHT SHIFT HOURS'}
              </span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>
          </div>
        </div>
      </div>

      {/* SPREAD STATION PREVIEW TABLE with SHIFT SELECTOR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-black text-slate-200 uppercase tracking-wide">
              Station Readings ({activeStations.length} Active Stations)
            </h2>
          </div>

          {/* Segmented Shift Preview Control */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setPreviewShift('day')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                previewShift === 'day'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Day Shift</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewShift('night')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                previewShift === 'night'
                  ? 'bg-indigo-500 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Night Shift</span>
            </button>
          </div>
        </div>

        {activeStations.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No active pump assignments. Click Pump Lineup to assign pumps to stations.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {activeStations.map((st) => {
              const pump = getPumpsForStation(st)[0] || '';
              const log = previewLogs.find(
                (l) => l.stationNumber === st && l.pumpNumber.trim().toLowerCase() === pump.trim().toLowerCase()
              );
              const hasPumpHours = log?.pumpHours !== null && log?.pumpHours !== undefined;
              const hasDeckHours = log?.deckEngHours !== null && log?.deckEngHours !== undefined;

              const prevReading = getPreviousReading(pump, todayDateStr, previewShift);
              const prevPump = prevReading?.pumpHours ?? null;
              const curPump = log?.pumpHours ?? null;

              return (
                <div
                  key={st}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-950/40 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                        hasPumpHours
                          ? previewShift === 'day'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                          : 'bg-slate-950 text-slate-600 border border-slate-800'
                      }`}
                    >
                      {hasPumpHours ? '✓' : '○'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100 text-sm">{st}</span>
                        <span className="text-slate-600">•</span>
                        <span className="font-mono font-black text-amber-400 text-sm">
                          {pump}
                        </span>
                      </div>
                      {log?.notes && (
                        <p className="text-[11px] text-slate-400 italic">
                          Note: {log.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 text-[10px] block uppercase">Pump Hrs</span>
                      <span className="font-black text-slate-100 text-sm">
                        {hasPumpHours ? log!.pumpHours!.toFixed(1) : '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[10px] block uppercase">Deck Hrs</span>
                      <span className="font-black text-slate-100 text-sm">
                        {hasDeckHours ? log!.deckEngHours!.toFixed(1) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Standby Pumps on Location Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">
                Standby Pumps on Location
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Meter readings for standby / backup units parked on pad ({standbyPumps.length} on location)
            </p>
          </div>

          <button
            type="button"
            onClick={() => onEnterHours(previewShift, 'standby')}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-amber-500/20 active:scale-95"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>ENTER STANDBY HOURS</span>
          </button>
        </div>

        {standbyPumps.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-slate-400 text-xs">
              No standby pumps currently in location inventory.
            </p>
            <button
              type="button"
              onClick={() => onEnterHours(previewShift, 'standby')}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-amber-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Standby Unit</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {standbyPumps.map((pump) => {
              const log = previewLogs.find(
                (l) =>
                  l.stationNumber.toLowerCase().includes('standby') &&
                  l.pumpNumber.trim().toLowerCase() === pump.trim().toLowerCase()
              );
              const hasPumpHours = log?.pumpHours !== null && log?.pumpHours !== undefined;
              const hasDeckHours = log?.deckEngHours !== null && log?.deckEngHours !== undefined;

              return (
                <div
                  key={`standby-home-${pump}`}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-950/40 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                        hasPumpHours
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'bg-slate-950 text-slate-600 border border-slate-800'
                      }`}
                    >
                      {hasPumpHours ? '✓' : '○'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-amber-400 text-base">
                          PUMP {pump}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded">
                          STANDBY
                        </span>
                      </div>
                      {log?.notes && (
                        <p className="text-[11px] text-slate-400 italic">
                          Note: {log.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div>
                        <span className="text-slate-500 text-[10px] block uppercase">Pump Hrs</span>
                        <span className="font-black text-slate-100 text-sm">
                          {hasPumpHours ? log!.pumpHours!.toFixed(1) : '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 text-[10px] block uppercase">Deck Hrs</span>
                        <span className="font-black text-slate-100 text-sm">
                          {hasDeckHours ? log!.deckEngHours!.toFixed(1) : '—'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onEnterHours(previewShift, 'standby', pump)}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95 shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{hasPumpHours || hasDeckHours ? 'EDIT HOURS' : 'ENTER HOURS'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Links to History & Lineup */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          onClick={onGoToHistory}
          className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-sm text-slate-100">View History</h3>
              <p className="text-xs text-slate-400">Previous days' completed shift sheets</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500" />
        </button>

        <button
          type="button"
          onClick={onGoToLineup}
          className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-sm text-slate-100">Pump Lineup</h3>
              <p className="text-xs text-slate-400">Manage station assignments and pump swaps</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500" />
        </button>
      </div>
    </div>
  );
};
