import React, { useMemo } from 'react';
import { useFleet, extractStationNumber } from '../../context/FleetContext';
import type { ShiftType, PumpOpsEvent } from '../../types';
import {
  DownEquipmentItem,
  extractActiveEquipmentIssues,
} from './reportUtils';
import { CheckCircle2, AlertOctagon } from 'lucide-react';

interface DownEquipmentPrintReportProps {
  date: string;
  shift: ShiftType;
  /** Whether rendering inside web preview container */
  isPreview?: boolean;
}

export const DownEquipmentPrintReport: React.FC<DownEquipmentPrintReportProps> = ({
  date,
  shift,
  isPreview = false,
}) => {
  const {
    pumpOpsEvents,
    technicianName,
    getStationForPump,
  } = useFleet();

  // Extract all abnormal equipment for this shift
  const abnormalItems = useMemo(() => {
    return extractActiveEquipmentIssues(pumpOpsEvents, getStationForPump, {
      filterDate: date,
      filterShift: shift,
    });
  }, [pumpOpsEvents, date, shift, getStationForPump]);

  // Summary counts
  const counts = useMemo(() => {
    let down = 0;
    let spotCheck = 0;
    let repairing = 0;
    let derated = 0;
    let watch = 0;

    abnormalItems.forEach((item) => {
      if (item.displayStatus === 'SPOT CHECK' || item.rawEvent?.eventType === 'spot_check') spotCheck++;
      else if (item.status === 'DOWN') down++;
      else if (item.status === 'REPAIRING') repairing++;
      else if (item.status === 'DERATED') derated++;
      else if (item.status === 'WATCH') watch++;
    });

    return {
      total: abnormalItems.length,
      down,
      spotCheck,
      repairing,
      derated,
      watch,
    };
  }, [abnormalItems]);

  // Formatted date string
  const formattedDate = useMemo(() => {
    const parts = date.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    }
    return date;
  }, [date]);

  const printedTime = useMemo(() => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  return (
    <div
      className={`down-equipment-report bg-white text-black font-sans ${
        isPreview
          ? 'p-5 sm:p-7 rounded-2xl shadow-xl border border-gray-300 max-w-5xl mx-auto'
          : 'p-0 m-0 w-full'
      }`}
    >
      {/* 1. COMPACT REPORT HEADER */}
      <div className="border-b-2 border-black pb-2 mb-2">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-black uppercase tracking-widest text-gray-700">
                FLEET 1 FRAC SPREAD
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-[11px] font-mono font-bold text-gray-700">
                ACTIVE EXCEPTION REPORT
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-black leading-none mt-0.5">
              FLEET 1 DOWN EQUIPMENT / ACTIVE ISSUES
            </h1>

            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap text-xs">
              <span className="font-black uppercase px-2 py-0.5 bg-black text-white rounded">
                {shift === 'day' ? 'DAY SHIFT' : 'NIGHT SHIFT'}
              </span>
              <span className="font-bold text-gray-900">
                DATE: <strong className="font-mono text-black font-black">{formattedDate} ({date})</strong>
              </span>
              <span className="text-gray-400">•</span>
              <span className="font-bold text-gray-900">
                OPERATOR: <strong className="text-black font-black uppercase">{technicianName || 'Field Tech'}</strong>
              </span>
            </div>
          </div>

          <div className="text-right font-mono shrink-0">
            <div className="text-xs font-bold text-black">
              Printed: {printedTime}
            </div>
            <div className="text-[10px] text-gray-600">
              Target: US Letter Landscape (1-Page)
            </div>
          </div>
        </div>

        {/* COMPACT SUMMARY RIBBON: TOTAL ACTIVE ISSUES | SPOT CHECK | DOWN | REPAIRING | DERATED | WATCH */}
        <div className={`mt-2 grid ${counts.spotCheck > 0 ? 'grid-cols-6' : 'grid-cols-5'} gap-2 font-mono text-center`}>
          <div className="border border-black rounded py-1 px-2 bg-gray-100">
            <span className="text-[9px] uppercase font-bold text-gray-700 block">
              Total Active Issues
            </span>
            <span className="text-base font-black text-black">
              {counts.total}
            </span>
          </div>

          {counts.spotCheck > 0 && (
            <div className="border border-sky-600 bg-sky-50 text-sky-950 rounded py-1 px-2">
              <span className="text-[9px] uppercase font-bold block text-sky-800">
                Spot Check
              </span>
              <span className="text-base font-black text-sky-950">
                {counts.spotCheck}
              </span>
            </div>
          )}

          <div
            className={`border rounded py-1 px-2 ${
              counts.down > 0
                ? 'border-red-600 bg-red-50 text-red-900'
                : 'border-gray-400 bg-gray-50 text-gray-700'
            }`}
          >
            <span className="text-[9px] uppercase font-bold block">
              Down
            </span>
            <span className={`text-base font-black ${counts.down > 0 ? 'text-red-700' : ''}`}>
              {counts.down}
            </span>
          </div>

          <div
            className={`border rounded py-1 px-2 ${
              counts.repairing > 0
                ? 'border-amber-600 bg-amber-50 text-amber-900'
                : 'border-gray-400 bg-gray-50 text-gray-700'
            }`}
          >
            <span className="text-[9px] uppercase font-bold block">
              Repairing
            </span>
            <span className={`text-base font-black ${counts.repairing > 0 ? 'text-amber-800' : ''}`}>
              {counts.repairing}
            </span>
          </div>

          <div
            className={`border rounded py-1 px-2 ${
              counts.derated > 0
                ? 'border-orange-600 bg-orange-50 text-orange-900'
                : 'border-gray-400 bg-gray-50 text-gray-700'
            }`}
          >
            <span className="text-[9px] uppercase font-bold block">
              Derated
            </span>
            <span className={`text-base font-black ${counts.derated > 0 ? 'text-orange-800' : ''}`}>
              {counts.derated}
            </span>
          </div>

          <div
            className={`border rounded py-1 px-2 ${
              counts.watch > 0
                ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                : 'border-gray-400 bg-gray-50 text-gray-700'
            }`}
          >
            <span className="text-[9px] uppercase font-bold block">
              Watch
            </span>
            <span className={`text-base font-black ${counts.watch > 0 ? 'text-indigo-800' : ''}`}>
              {counts.watch}
            </span>
          </div>
        </div>
      </div>

      {/* 2. MAIN CONTENT AREA */}
      {abnormalItems.length === 0 ? (
        /* ========================================================================= */
        /* NO ACTIVE ISSUES CLEAN ONE-PAGE MESSAGE                                   */
        /* ========================================================================= */
        <div className="py-16 px-6 text-center border-2 border-dashed border-gray-400 rounded-xl bg-gray-50 my-6">
          <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-400 text-emerald-800 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
          </div>
          <h2 className="text-xl font-black uppercase text-black tracking-wide">
            NO ACTIVE EQUIPMENT ISSUES
          </h2>
          <p className="text-sm font-semibold text-gray-700 mt-1 max-w-md mx-auto">
            All reported spread pumps are currently clear and operating normally. Zero active downtime, repairs, or watch items recorded for {shift === 'day' ? 'Day Shift' : 'Night Shift'}.
          </p>
          <div className="mt-4 inline-block font-mono text-xs font-bold px-3 py-1 bg-black text-white rounded">
            SPREAD STATUS: 100% OPERATIONAL
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* COMPACT ACTIVE ISSUE TABLE (FITS ON ONE LANDSCAPE LETTER PAGE)             */
        /* Columns: STATION | PUMP | STATUS | DOWN TIME | ISSUE | NOTES               */
        /* ========================================================================= */
        <div className="space-y-2">
          <table className="w-full text-left border-collapse border border-gray-400 text-xs">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-black">
                <th className="py-1.5 px-2 font-black uppercase text-black w-18 border-r border-gray-400 text-center">
                  STATION
                </th>
                <th className="py-1.5 px-2 font-black uppercase text-black w-20 border-r border-gray-400">
                  PUMP
                </th>
                <th className="py-1.5 px-2 font-black uppercase text-black w-24 border-r border-gray-400 text-center">
                  STATUS
                </th>
                <th className="py-1.5 px-2 font-black uppercase text-black w-24 border-r border-gray-400">
                  DOWN TIME
                </th>
                <th className="py-1.5 px-2 font-black uppercase text-black w-56 border-r border-gray-400">
                  ISSUE
                </th>
                <th className="py-1.5 px-2 font-black uppercase text-black">
                  NOTES
                </th>
              </tr>
            </thead>
            <tbody>
              {abnormalItems.map((item, idx) => {
                const isSpotCheck = item.displayStatus === 'SPOT CHECK' || item.rawEvent?.eventType === 'spot_check';
                const displayStatus = isSpotCheck ? 'SPOT CHECK' : item.status;
                const statusBadge = (
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded font-mono font-black text-[10px] uppercase border ${
                      isSpotCheck
                        ? 'bg-sky-100 text-sky-950 border-sky-600'
                        : item.status === 'DOWN'
                        ? 'bg-red-100 text-red-900 border-red-500'
                        : item.status === 'REPAIRING'
                        ? 'bg-amber-100 text-amber-900 border-amber-500'
                        : item.status === 'DERATED'
                        ? 'bg-orange-100 text-orange-900 border-orange-500'
                        : 'bg-indigo-100 text-indigo-900 border-indigo-400'
                    }`}
                  >
                    {displayStatus}
                  </span>
                );

                return (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-300 ${
                      isSpotCheck
                        ? 'bg-sky-50/40'
                        : item.status === 'DOWN'
                        ? 'bg-red-50/40'
                        : item.status === 'REPAIRING'
                        ? 'bg-amber-50/40'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-gray-50/60'
                    }`}
                  >
                    {/* STATION */}
                    <td className="py-1.5 px-2 font-mono font-black text-sm text-black border-r border-gray-300 text-center whitespace-nowrap">
                      {item.stationNumberOnly || item.station}
                    </td>

                    {/* PUMP */}
                    <td className="py-1.5 px-2 font-mono font-black text-sm text-black border-r border-gray-300 whitespace-nowrap">
                      {item.pump}
                    </td>

                    {/* STATUS */}
                    <td className="py-1.5 px-2 text-center border-r border-gray-300 whitespace-nowrap">
                      {statusBadge}
                    </td>

                    {/* DOWN TIME (e.g. 34m or 1h 14m, with small start time below) */}
                    <td className="py-1.5 px-2 font-mono text-xs text-black border-r border-gray-300 whitespace-nowrap leading-tight">
                      <span className="font-black text-sm">{item.compactDowntime}</span>
                      {item.startTimeStr && (
                        <span className="block text-[10px] text-gray-600 font-sans">
                          {item.startTimeStr}
                        </span>
                      )}
                    </td>

                    {/* ISSUE (Compact Fluid End / Power End / Engine) */}
                    <td className="py-1.5 px-2 font-sans font-bold text-xs text-black border-r border-gray-300 leading-snug">
                      {item.issue}
                    </td>

                    {/* NOTES (Wrapped cleanly, truncated if long) */}
                    <td className="py-1.5 px-2 text-[11px] text-gray-800 font-sans leading-tight">
                      {item.notes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. COMPACT SIGN-OFF FOOTER */}
      <div className="mt-3 pt-2 border-t-2 border-black">
        <div className="flex justify-between items-center text-xs font-mono">
          <div className="flex items-center gap-6">
            <div>
              <span className="font-bold text-gray-800">Outgoing Operator:</span>{' '}
              <span className="inline-block border-b border-black w-44 pb-0.5">
                {technicianName || ''}
              </span>
            </div>
            <div>
              <span className="font-bold text-gray-800">Incoming Operator:</span>{' '}
              <span className="inline-block border-b border-black w-44 pb-0.5"></span>
            </div>
          </div>

          <div className="text-[10px] text-gray-600 text-right">
            FLEET 1 DOWN EQUIPMENT REGISTER • 1-PAGE US LETTER LANDSCAPE
          </div>
        </div>
      </div>
    </div>
  );
};
