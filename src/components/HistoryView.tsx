import React, { useState, useMemo } from 'react';
import { useFleet } from '../context/FleetContext';
import type { ShiftType } from '../types';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Download,
  ArrowRight,
  Lock,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon
} from 'lucide-react';

interface HistoryViewProps {
  onOpenDateInEntry: (date: string, shift?: ShiftType, section?: 'lineup' | 'standby' | 'all', pump?: string) => void;
  onOpenDateInPrint: (date: string, shift?: ShiftType) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onOpenDateInEntry,
  onOpenDateInPrint,
}) => {
  const { allLogs, fleet, todayDateStr, isSheetFinalized, getPumpsForStation } = useFleet();

  const [expandedDate, setExpandedDate] = useState<string | null>(todayDateStr);

  // Group all logs by date
  const uniqueDates = useMemo(() => {
    const dateSet = new Set<string>();
    dateSet.add(todayDateStr);
    allLogs.forEach((l) => {
      if (l.date) dateSet.add(l.date);
    });
    return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  }, [allLogs, todayDateStr]);

  // Compute stats per date and shift
  const dateSummaries = useMemo(() => {
    const totalActiveStations = fleet.stations.filter(
      (st) => getPumpsForStation(st).length > 0
    ).length;

    return uniqueDates.map((dateStr) => {
      // 1. Day Shift logs
      const dayLogs = allLogs.filter(
        (l) => l.date === dateStr && (l.shift === 'day' || (!l.shift && !l.id.includes('_night_')))
      );
      const uniqueDayLoggedStations = new Set(
        dayLogs
          .filter((l) => !l.stationNumber.toLowerCase().includes('standby') && l.pumpHours !== null && l.pumpHours !== undefined)
          .map((l) => l.stationNumber)
      );
      const dayEnteredCount = uniqueDayLoggedStations.size;
      const dayTargetCount = totalActiveStations > 0 ? totalActiveStations : dayLogs.length;
      const isDayComplete = dayTargetCount > 0 && dayEnteredCount >= dayTargetCount;
      const dayFinalInfo = isSheetFinalized(dateStr, 'day');
      const dayStandbyCount = dayLogs.filter(
        (l) => l.stationNumber.toLowerCase().includes('standby') && (l.pumpHours !== null || l.deckEngHours !== null)
      ).length;

      // 2. Night Shift logs
      const nightLogs = allLogs.filter(
        (l) => l.date === dateStr && (l.shift === 'night' || l.id.includes('_night_'))
      );
      const uniqueNightLoggedStations = new Set(
        nightLogs
          .filter((l) => !l.stationNumber.toLowerCase().includes('standby') && l.pumpHours !== null && l.pumpHours !== undefined)
          .map((l) => l.stationNumber)
      );
      const nightEnteredCount = uniqueNightLoggedStations.size;
      const nightTargetCount = totalActiveStations > 0 ? totalActiveStations : nightLogs.length;
      const isNightComplete = nightTargetCount > 0 && nightEnteredCount >= nightTargetCount;
      const nightFinalInfo = isSheetFinalized(dateStr, 'night');
      const nightStandbyCount = nightLogs.filter(
        (l) => l.stationNumber.toLowerCase().includes('standby') && (l.pumpHours !== null || l.deckEngHours !== null)
      ).length;

      // Format date label (e.g. Oct 6, 2026)
      let formatted = dateStr;
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      }

      return {
        date: dateStr,
        formatted,
        day: {
          enteredCount: dayEnteredCount,
          targetCount: dayTargetCount,
          standbyCount: dayStandbyCount,
          isComplete: isDayComplete,
          isFinalized: dayFinalInfo.finalized,
          finalizedBy: dayFinalInfo.finalizedBy,
          logs: dayLogs,
        },
        night: {
          enteredCount: nightEnteredCount,
          targetCount: nightTargetCount,
          standbyCount: nightStandbyCount,
          isComplete: isNightComplete,
          isFinalized: nightFinalInfo.finalized,
          finalizedBy: nightFinalInfo.finalizedBy,
          logs: nightLogs,
        },
      };
    });
  }, [uniqueDates, allLogs, fleet.stations, getPumpsForStation, isSheetFinalized]);

  // Export CSV for a specific day and optional shift
  const handleExportCSV = (dateStr: string, specificShift?: ShiftType) => {
    let logs = allLogs.filter((l) => l.date === dateStr);
    if (specificShift === 'day') {
      logs = logs.filter((l) => l.shift === 'day' || (!l.shift && !l.id.includes('_night_')));
    } else if (specificShift === 'night') {
      logs = logs.filter((l) => l.shift === 'night' || l.id.includes('_night_'));
    }

    const sorted = [...logs].sort((a, b) => {
      // Sort by shift (day first), then station
      const shiftOrderA = a.shift === 'night' ? 2 : 1;
      const shiftOrderB = b.shift === 'night' ? 2 : 1;
      if (shiftOrderA !== shiftOrderB) return shiftOrderA - shiftOrderB;

      const numA = (a.stationNumber.match(/\d+/) || [9999])[0];
      const numB = (b.stationNumber.match(/\d+/) || [9999])[0];
      return Number(numA) - Number(numB);
    });

    const headers = ['Date', 'Shift', 'Station', 'Pump', 'Pump Hours', 'Deck Hours', 'Notes', 'Entered By'];
    const rows = sorted.map((log) => [
      `"${log.date}"`,
      `"${log.shift === 'night' ? 'Night' : 'Day'}"`,
      `"${log.stationNumber}"`,
      `"${log.pumpNumber}"`,
      log.pumpHours !== null && log.pumpHours !== undefined ? log.pumpHours : '',
      log.deckEngHours !== null && log.deckEngHours !== undefined ? log.deckEngHours : '',
      `"${(log.notes || log.info || '').replace(/"/g, '""')}"`,
      `"${(log.enteredBy || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const shiftSuffix = specificShift ? `_${specificShift.toUpperCase()}` : '';
    link.setAttribute('download', `FLEET_1_PUMP_HOURS_${dateStr}${shiftSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-28 max-w-4xl mx-auto">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-black tracking-widest text-amber-400">
              LOG ARCHIVE
            </span>
            <span className="text-slate-600 font-bold">•</span>
            <span className="text-xs font-mono font-bold text-slate-300">
              FLEET 1
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight mt-0.5">
            History
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Past daily pump-hour sheets, Day and Night shifts, and office CSV exports.
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-right font-mono">
          <span className="text-[10px] text-slate-500 uppercase block font-bold">Total Days</span>
          <span className="text-base font-black text-amber-400">{dateSummaries.length}</span>
        </div>
      </div>

      {/* Days List with Independent Day and Night Shift Records */}
      <div className="space-y-4">
        {dateSummaries.map((summary) => {
          const isExpanded = expandedDate === summary.date;

          return (
            <div
              key={summary.date}
              className="bg-slate-900 border border-slate-800 rounded-2xl transition-all overflow-hidden shadow-lg"
            >
              {/* Day Header Row */}
              <div
                onClick={() => setExpandedDate(isExpanded ? null : summary.date)}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-950/30 transition-colors border-b border-slate-800/60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400 shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-black text-base sm:text-lg text-slate-100">
                        {summary.formatted}
                      </h2>
                      {summary.date === todayDateStr && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          TODAY
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-0.5">
                      <span>Day: {summary.day.enteredCount}/{summary.day.targetCount}</span>
                      <span>•</span>
                      <span>Night: {summary.night.enteredCount}/{summary.night.targetCount}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-none border-slate-800">
                  <span
                    className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                      summary.day.isComplete && summary.night.isComplete
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {summary.day.isComplete && summary.night.isComplete ? 'BOTH SHIFTS COMPLETE ✓' : 'VIEW SHIFTS'}
                  </span>

                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Expanded Panel: Individual Day and Night Shift Cards */}
              {isExpanded && (
                <div className="p-4 sm:p-5 bg-slate-950/60 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* ====== DAY SHIFT SUMMARY ====== */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                            <Sun className="w-4 h-4" />
                            <span>DAY SHIFT</span>
                          </span>
                          <span
                            className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                              summary.day.isFinalized
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                : summary.day.isComplete
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                : 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {summary.day.isComplete ? '✓' : '⚠'} {summary.day.enteredCount} / {summary.day.targetCount}
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 font-mono">
                          {summary.day.isFinalized
                            ? `Finalized by ${summary.day.finalizedBy || 'Operator'}`
                            : summary.day.isComplete
                            ? 'All station readings complete'
                            : `${summary.day.targetCount - summary.day.enteredCount} readings missing`}
                        </p>
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
                          <span>Standby Units:</span>
                          <button
                            type="button"
                            onClick={() => onOpenDateInEntry(summary.date, 'day', 'standby')}
                            className="text-amber-400 hover:text-amber-300 font-bold hover:underline cursor-pointer"
                          >
                            {summary.day.standbyCount > 0 ? `${summary.day.standbyCount} logged →` : '+ Enter Standby'}
                          </button>
                        </div>
                      </div>

                      {/* Day Shift Action Buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => onOpenDateInEntry(summary.date, 'day')}
                          className="flex-1 min-h-[38px] px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>OPEN DAY</span>
                          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDateInPrint(summary.date, 'day')}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                          title="Print Day Shift"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Print</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportCSV(summary.date, 'day')}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                          title="Export Day Shift CSV"
                        >
                          <Download className="w-3.5 h-3.5 text-amber-400" />
                          <span className="hidden sm:inline">CSV</span>
                        </button>
                      </div>
                    </div>

                    {/* ====== NIGHT SHIFT SUMMARY ====== */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                            <Moon className="w-4 h-4" />
                            <span>NIGHT SHIFT</span>
                          </span>
                          <span
                            className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                              summary.night.isFinalized
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                : summary.night.isComplete
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                : 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/30'
                            }`}
                          >
                            {summary.night.isComplete ? '✓' : '⚠'} {summary.night.enteredCount} / {summary.night.targetCount}
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 font-mono">
                          {summary.night.isFinalized
                            ? `Finalized by ${summary.night.finalizedBy || 'Operator'}`
                            : summary.night.isComplete
                            ? 'All station readings complete'
                            : `${summary.night.targetCount - summary.night.enteredCount} readings missing`}
                        </p>
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
                          <span>Standby Units:</span>
                          <button
                            type="button"
                            onClick={() => onOpenDateInEntry(summary.date, 'night', 'standby')}
                            className="text-indigo-400 hover:text-indigo-300 font-bold hover:underline cursor-pointer"
                          >
                            {summary.night.standbyCount > 0 ? `${summary.night.standbyCount} logged →` : '+ Enter Standby'}
                          </button>
                        </div>
                      </div>

                      {/* Night Shift Action Buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => onOpenDateInEntry(summary.date, 'night')}
                          className="flex-1 min-h-[38px] px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>OPEN NIGHT</span>
                          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDateInPrint(summary.date, 'night')}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                          title="Print Night Shift"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Print</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportCSV(summary.date, 'night')}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                          title="Export Night Shift CSV"
                        >
                          <Download className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="hidden sm:inline">CSV</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Day Level CSV Export Button */}
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleExportCSV(summary.date)}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>Export Full Day (Both Shifts CSV)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
