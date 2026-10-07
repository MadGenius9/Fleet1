import React, { useMemo } from 'react';
import { useFleet, sortStations, extractStationNumber } from '../../context/FleetContext';
import type { ShiftType } from '../../types';

interface PumpHoursPrintReportProps {
  date: string;
  shift: ShiftType;
  /** Whether rendering inside web preview container */
  isPreview?: boolean;
}

export const PumpHoursPrintReport: React.FC<PumpHoursPrintReportProps> = ({
  date,
  shift,
  isPreview = false,
}) => {
  const {
    allLogs,
    fleet,
    technicianName,
    isSheetFinalized,
    getPumpsForStation,
    getPreviousReading,
  } = useFleet();

  // Filter logs for selected date & shift
  const dateLogs = useMemo(() => {
    return allLogs.filter(
      (log) =>
        log.date === date &&
        (log.shift === shift || (!log.shift && shift === 'day'))
    );
  }, [allLogs, date, shift]);

  // Active spread stations in order
  const activeStations = useMemo(() => {
    const list = fleet.stations.filter((st) => {
      const hasPump = getPumpsForStation(st).length > 0;
      const hasLog = dateLogs.some((l) => l.stationNumber === st);
      return hasPump || hasLog;
    });
    return sortStations(list);
  }, [fleet.stations, getPumpsForStation, dateLogs]);

  const totalActive = activeStations.length;

  // Station rows mapping
  const stationRows = useMemo(() => {
    return activeStations.map((st) => {
      const matched = dateLogs.find((l) => l.stationNumber === st);
      const assignedPump = matched?.pumpNumber || getPumpsForStation(st)[0] || '';

      const pumpHours =
        matched?.pumpHours !== null && matched?.pumpHours !== undefined
          ? matched.pumpHours
          : null;
      const deckEngHours =
        matched?.deckEngHours !== null && matched?.deckEngHours !== undefined
          ? matched.deckEngHours
          : null;
      const notes = matched?.notes || matched?.info || '';

      const prev = getPreviousReading(assignedPump, date, shift);
      const prevPump = prev?.pumpHours ?? null;
      const pumpDiff =
        pumpHours !== null && prevPump !== null ? pumpHours - prevPump : null;

      const isComplete = pumpHours !== null;

      return {
        station: st,
        stationNum: extractStationNumber(st),
        pump: assignedPump,
        pumpHours,
        deckEngHours,
        notes,
        prevPump,
        pumpDiff,
        isComplete,
      };
    });
  }, [activeStations, dateLogs, date, shift, getPumpsForStation, getPreviousReading]);

  const completedCount = useMemo(() => {
    return stationRows.filter((r) => r.isComplete).length;
  }, [stationRows]);

  // Standby pumps that have logged readings for this date & shift
  const standbyRows = useMemo(() => {
    const sLogs = dateLogs.filter(
      (l) =>
        l.stationNumber.toLowerCase().includes('standby') &&
        (l.pumpHours !== null || l.deckEngHours !== null || (l.notes && l.notes.trim() !== ''))
    );

    return sLogs.map((l) => {
      const pump = l.pumpNumber;
      const pumpHours = l.pumpHours !== null && l.pumpHours !== undefined ? l.pumpHours : null;
      const deckEngHours = l.deckEngHours !== null && l.deckEngHours !== undefined ? l.deckEngHours : null;
      const notes = l.notes || l.info || '';
      const prev = getPreviousReading(pump, date, shift);
      const prevPump = prev?.pumpHours ?? null;
      const pumpDiff = pumpHours !== null && prevPump !== null ? pumpHours - prevPump : null;

      return {
        pump,
        pumpHours,
        deckEngHours,
        notes,
        prevPump,
        pumpDiff,
      };
    });
  }, [dateLogs, date, shift, getPreviousReading]);

  const isComplete = totalActive > 0 && completedCount === totalActive;
  const missingRows = useMemo(() => stationRows.filter((r) => !r.isComplete), [stationRows]);
  const finalizationInfo = useMemo(() => isSheetFinalized(date, shift), [isSheetFinalized, date, shift]);

  // Formatted date string (e.g. OCTOBER 6, 2026)
  const formattedDate = useMemo(() => {
    const parts = date.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    }
    return date;
  }, [date]);

  // Entered by display
  const enteredByDisplay = useMemo(() => {
    const techSet = new Set<string>();
    dateLogs.forEach((l) => {
      if (l.enteredBy?.trim()) techSet.add(l.enteredBy.trim());
    });
    if (techSet.size > 0) {
      return Array.from(techSet).join(', ');
    }
    return technicianName || 'Field Tech';
  }, [dateLogs, technicianName]);

  return (
    <div
      className={`pump-hours-report bg-white text-black font-sans ${
        isPreview
          ? 'p-5 sm:p-7 rounded-2xl shadow-xl border border-gray-300 max-w-4xl mx-auto'
          : 'p-0 m-0 w-full'
      }`}
    >
      {/* Report Header */}
      <div className="border-b-2 border-black pb-2 mb-2.5">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-black uppercase tracking-widest text-gray-700">
                FLEET 1 FRAC SPREAD
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-[11px] font-mono font-bold text-gray-700">
                DAILY PUMP HOUR LOG
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-black leading-none mt-0.5">
              FLEET 1 PUMP HOURS
            </h1>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs sm:text-sm font-black uppercase px-2 py-0.5 bg-black text-white rounded">
                {shift === 'day' ? 'DAY SHIFT' : 'NIGHT SHIFT'}
              </span>
              <span className="text-xs font-bold text-gray-900">
                DATE: <strong className="font-mono text-black font-black">{formattedDate} ({date})</strong>
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-xs font-bold text-gray-900">
                ENTERED BY: <strong className="text-black font-black uppercase">{enteredByDisplay}</strong>
              </span>
            </div>
          </div>

          <div className="text-right font-mono shrink-0">
            <div>
              <span
                className={`inline-block px-2.5 py-0.5 text-[11px] font-black uppercase rounded ${
                  isComplete ? 'bg-black text-white' : 'bg-red-700 text-white'
                }`}
              >
                {isComplete
                  ? `COMPLETE — ${completedCount}/${totalActive}`
                  : `INCOMPLETE — ${completedCount}/${totalActive}`}
              </span>
            </div>
            <div className="text-[10px] text-gray-600 mt-1">
              Printed: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Missing readings warning ribbon (if incomplete) */}
        {!isComplete && (
          <div className="mt-1.5 py-1 px-2 bg-red-50 border border-red-300 text-red-900 text-[11px] font-bold rounded flex items-center justify-between">
            <span>
              MISSING READINGS ({missingRows.length}):{' '}
              {missingRows.map((r) => `${r.station} (${r.pump || 'No pump'})`).join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Main Pump Hours Table */}
      {stationRows.length === 0 ? (
        <div className="py-12 text-center text-gray-600 font-semibold text-sm">
          No stations or pumps configured for this shift.
        </div>
      ) : (
        <table className="w-full text-left border-collapse border border-gray-400">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-black">
              <th className="py-1.5 px-2 font-black uppercase text-[11px] text-black w-28 border-r border-gray-400">
                STATION
              </th>
              <th className="py-1.5 px-2 font-black uppercase text-[11px] text-black w-24 border-r border-gray-400">
                PUMP
              </th>
              <th className="py-1.5 px-2 font-black uppercase text-[11px] text-black text-right w-32 border-r border-gray-400">
                PUMP HOURS
              </th>
              <th className="py-1.5 px-2 font-black uppercase text-[11px] text-black text-right w-36 border-r border-gray-400">
                DECK ENG HOURS
              </th>
              <th className="py-1.5 px-2 font-black uppercase text-[11px] text-black">
                NOTES
              </th>
            </tr>
          </thead>
          <tbody>
            {stationRows.map((row, idx) => (
              <tr
                key={row.station}
                className={`border-b border-gray-300 ${
                  !row.isComplete
                    ? 'bg-red-50/70'
                    : idx % 2 === 0
                    ? 'bg-white'
                    : 'bg-gray-50/80'
                }`}
              >
                <td className="py-1 px-2 font-black text-xs text-black border-r border-gray-300 whitespace-nowrap">
                  {row.station}
                </td>
                <td className="py-1 px-2 font-mono font-black text-xs text-black border-r border-gray-300 whitespace-nowrap">
                  {row.pump || '—'}
                </td>
                <td className="py-1 px-2 font-mono font-bold text-xs text-black text-right border-r border-gray-300">
                  {row.pumpHours !== null ? row.pumpHours.toFixed(1) : '—'}
                </td>
                <td className="py-1 px-2 font-mono font-bold text-xs text-black text-right border-r border-gray-300">
                  {row.deckEngHours !== null ? row.deckEngHours.toFixed(1) : '—'}
                </td>
                <td className="py-1 px-2 text-[11px] text-gray-800 italic truncate max-w-xs font-sans">
                  {row.notes || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Standby Pumps Table (rendered when standby pumps have logged readings) */}
      {standbyRows.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-gray-800 mb-1 flex items-center gap-1.5">
            <span>STANDBY PUMPS ON LOCATION (METER READINGS — {standbyRows.length} UNITS)</span>
          </div>
          <table className="w-full text-left border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-black">
                <th className="py-1 px-2 font-black uppercase text-[10px] text-black w-28 border-r border-gray-400">
                  STATUS
                </th>
                <th className="py-1 px-2 font-black uppercase text-[10px] text-black w-24 border-r border-gray-400">
                  PUMP
                </th>
                <th className="py-1 px-2 font-black uppercase text-[10px] text-black text-right w-32 border-r border-gray-400">
                  PUMP HOURS
                </th>
                <th className="py-1 px-2 font-black uppercase text-[10px] text-black text-right w-36 border-r border-gray-400">
                  DECK ENG HOURS
                </th>
                <th className="py-1 px-2 font-black uppercase text-[10px] text-black">
                  NOTES
                </th>
              </tr>
            </thead>
            <tbody>
              {standbyRows.map((row, idx) => (
                <tr
                  key={row.pump}
                  className={`border-b border-gray-300 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}`}
                >
                  <td className="py-1 px-2 font-bold text-[11px] text-gray-700 border-r border-gray-300 whitespace-nowrap">
                    STANDBY
                  </td>
                  <td className="py-1 px-2 font-mono font-black text-xs text-black border-r border-gray-300 whitespace-nowrap">
                    {row.pump}
                  </td>
                  <td className="py-1 px-2 font-mono font-bold text-xs text-black text-right border-r border-gray-300">
                    {row.pumpHours !== null ? row.pumpHours.toFixed(1) : '—'}
                  </td>
                  <td className="py-1 px-2 font-mono font-bold text-xs text-black text-right border-r border-gray-300">
                    {row.deckEngHours !== null ? row.deckEngHours.toFixed(1) : '—'}
                  </td>
                  <td className="py-1 px-2 text-[11px] text-gray-800 italic truncate max-w-xs font-sans">
                    {row.notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compact Report Footer */}
      <div className="mt-2 pt-1.5 border-t border-gray-400 flex justify-between items-center text-[10px] text-gray-600 font-mono">
        <div>FLEET 1 PUMP HOURS REGISTER • {shift === 'day' ? 'DAY SHIFT' : 'NIGHT SHIFT'}</div>
        <div>
          {finalizationInfo.finalized
            ? `STATUS: FINALIZED (${shift === 'day' ? 'DAY' : 'NIGHT'}) by ${finalizationInfo.finalizedBy || 'Supervisor'}`
            : 'STATUS: DRAFT / IN PROGRESS'}
        </div>
      </div>
    </div>
  );
};
