import React, { useMemo, useState } from 'react';
import { useFleet } from '../context/FleetContext';
import { extractActiveEquipmentIssues, type DownEquipmentItem } from './reports/reportUtils';
import { ActiveSpreadIssuesPrintModal } from './ActiveSpreadIssuesPrintModal';
import {
  HardHat,
  Clock,
  Printer,
  CheckCircle2,
  AlertOctagon,
  Wrench,
  Gauge,
  Eye,
  Calendar,
  FileText,
  ClipboardCheck,
} from 'lucide-react';

interface MechanicsViewProps {
  onGoToPrint?: () => void;
}

export const MechanicsView: React.FC<MechanicsViewProps> = ({ onGoToPrint }) => {
  const {
    pumpOpsEvents,
    getStationForPump,
    todayDateStr,
    activeShift,
  } = useFleet();

  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<'all' | 'down-repairing' | 'derated' | 'watch' | 'spot-check'>('all');

  // Extract all unresolved active equipment issues across all shifts & dates
  const allActiveIssues = useMemo(() => {
    return extractActiveEquipmentIssues(pumpOpsEvents, getStationForPump);
  }, [pumpOpsEvents, getStationForPump]);

  // Summary counts
  const counts = useMemo(() => {
    let down = 0;
    let spotCheck = 0;
    let repairing = 0;
    let derated = 0;
    let watch = 0;

    allActiveIssues.forEach((item) => {
      if (item.displayStatus === 'SPOT CHECK' || item.rawEvent?.eventType === 'spot_check') spotCheck++;
      else if (item.status === 'DOWN') down++;
      else if (item.status === 'REPAIRING') repairing++;
      else if (item.status === 'DERATED') derated++;
      else if (item.status === 'WATCH') watch++;
    });

    return {
      active: allActiveIssues.length,
      down,
      spotCheck,
      repairing,
      derated,
      watch,
    };
  }, [allActiveIssues]);

  // Grouped active issues by category for clean visual hierarchy
  const spotCheckItems = useMemo(() => {
    return allActiveIssues.filter((i) => i.displayStatus === 'SPOT CHECK' || i.rawEvent?.eventType === 'spot_check');
  }, [allActiveIssues]);

  const downAndRepairing = useMemo(() => {
    return allActiveIssues.filter(
      (i) => (i.status === 'DOWN' || i.status === 'REPAIRING') && i.displayStatus !== 'SPOT CHECK' && i.rawEvent?.eventType !== 'spot_check'
    );
  }, [allActiveIssues]);

  const deratedItems = useMemo(() => {
    return allActiveIssues.filter((i) => i.status === 'DERATED');
  }, [allActiveIssues]);

  const watchItems = useMemo(() => {
    return allActiveIssues.filter((i) => i.status === 'WATCH');
  }, [allActiveIssues]);

  const handleOpenPrint = () => {
    if (onGoToPrint) {
      onGoToPrint();
    } else {
      setShowPrintModal(true);
    }
  };

  // Reusable card renderer
  const renderIssueCard = (item: DownEquipmentItem) => {
    const isSpotCheck = item.displayStatus === 'SPOT CHECK' || item.rawEvent?.eventType === 'spot_check';
    const isDown = !isSpotCheck && item.status === 'DOWN';
    const isRepairing = item.status === 'REPAIRING';
    const isDerated = item.status === 'DERATED';
    const isWatch = item.status === 'WATCH';
    const displayStatus = isSpotCheck ? 'SPOT CHECK' : item.status;

    return (
      <div
        key={item.id}
        className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 shadow-xl transition-all space-y-3.5 relative overflow-hidden flex flex-col justify-between ${
          isSpotCheck
            ? 'border-sky-500/50 bg-gradient-to-br from-sky-950/25 via-slate-900 to-slate-900'
            : isDown
            ? 'border-rose-500/50 bg-gradient-to-br from-rose-950/25 via-slate-900 to-slate-900'
            : isRepairing
            ? 'border-amber-500/50 bg-gradient-to-br from-amber-950/25 via-slate-900 to-slate-900'
            : isDerated
            ? 'border-orange-500/50 bg-gradient-to-br from-orange-950/25 via-slate-900 to-slate-900'
            : 'border-indigo-500/40 bg-gradient-to-br from-indigo-950/25 via-slate-900 to-slate-900'
        }`}
      >
        {/* Top Status & Duration Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          {/* Status Badge & Pending Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-3 py-1 rounded-xl text-xs sm:text-sm font-black uppercase font-mono tracking-wider flex items-center gap-1.5 border shadow-sm ${
                isSpotCheck
                  ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sky-500/20'
                  : isDown
                  ? 'bg-rose-500 text-slate-950 border-rose-400 shadow-rose-500/20'
                  : isRepairing
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/20'
                  : isDerated
                  ? 'bg-orange-500 text-slate-950 border-orange-400 shadow-orange-500/20'
                  : 'bg-indigo-500 text-white border-indigo-400 shadow-indigo-500/20'
              }`}
            >
              {isSpotCheck && <ClipboardCheck className="w-4 h-4 stroke-[2.5]" />}
              {isDown && <AlertOctagon className="w-4 h-4 stroke-[2.5]" />}
              {isRepairing && <Wrench className="w-4 h-4 stroke-[2.5]" />}
              {isDerated && <Gauge className="w-4 h-4 stroke-[2.5]" />}
              {isWatch && <Eye className="w-4 h-4 stroke-[2.5]" />}
              <span>{displayStatus}</span>
            </span>

            {(item._pendingSync || item.rawEvent?._pendingSync) && (
              <span
                className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse"
                title="Direct Firestore write pending, stored in offline queue"
              >
                <Clock className="w-3 h-3 text-amber-400" />
                <span>SYNC PENDING</span>
              </span>
            )}
          </div>

          {/* Downtime / Active Duration */}
          <div className="text-right font-mono">
            <span className="text-sm sm:text-base font-black text-slate-100 flex items-center gap-1 justify-end">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {isSpotCheck
                  ? `Spot Check ${item.compactDowntime}`
                  : isDown
                  ? `Down ${item.compactDowntime}`
                  : isRepairing
                  ? `Repair ${item.compactDowntime}`
                  : `Active ${item.compactDowntime}`}
              </span>
            </span>
            {item.startTimeStr && (
              <span className="text-[10px] text-slate-400 block">
                Since {item.startTimeStr}
              </span>
            )}
          </div>
        </div>

        {/* Middle Main Info: Large Station & Pump */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-3">
              {/* Station */}
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                  STATION
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-amber-400 tracking-tight">
                  {item.stationNumberOnly || item.station}
                </span>
              </div>

              {/* Pump */}
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                  PUMP
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-slate-100 tracking-tight">
                  {item.pump}
                </span>
              </div>
            </div>
          </div>

          {/* Category & Issue Component */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
            {isSpotCheck ? (
              <>
                <span className="text-[10px] font-mono font-black uppercase tracking-wider text-sky-400 block">
                  VALVES &amp; SEATS
                </span>
                <div className="text-base sm:text-lg font-black text-slate-100 tracking-tight">
                  {item.issue}
                </div>
                {item.rawEvent?.checks && item.rawEvent.checks.length > 0 && (
                  <div className="grid grid-cols-5 gap-1 pt-1 font-mono text-[11px]">
                    {item.rawEvent.checks.map((chk) => (
                      <div
                        key={chk.hole}
                        className={`px-1 py-1 rounded text-center border ${
                          chk.condition === 'BAD'
                            ? 'bg-rose-950/70 border-rose-500/50 text-rose-300'
                            : chk.condition === 'WATCH'
                            ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                            : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        <div className="font-bold">H{chk.hole}</div>
                        <div className="text-[9px] uppercase font-bold">
                          {chk.condition}
                          {chk.part ? ` (${chk.part === 'VALVE' ? 'V' : chk.part === 'SEAT' ? 'S' : 'B'})` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {item.category && (
                  <span className="text-[10px] font-mono font-black uppercase tracking-wider text-amber-400/90 block">
                    {item.category}
                  </span>
                )}
                <div className="text-base sm:text-lg font-black text-slate-100 tracking-tight">
                  {item.issue}
                </div>

                {/* Limitation if derated */}
                {item.limitation && (
                  <div className="text-xs font-mono font-bold text-orange-300 mt-1 flex items-center gap-1.5">
                    <span>Limit:</span>
                    <span className="underline">{item.limitation}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Operator Notes if present */}
          {item.rawNotes && item.rawNotes.trim() && (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 text-xs text-slate-300 font-sans space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                <FileText className="w-3 h-3 text-slate-400" />
                <span>OPERATOR NOTES:</span>
              </span>
              <p className="italic text-slate-200 leading-relaxed font-sans">
                "{item.rawNotes}"
              </p>
            </div>
          )}
        </div>

        {/* Bottom Secondary Context Bar: Shift & Date info */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-500" />
            <span>{item.date || todayDateStr}</span>
          </span>
          <span className="uppercase font-bold text-slate-300">
            {item.shift ? `${item.shift} Shift` : `${activeShift} Shift`}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-28 max-w-5xl mx-auto select-none sm:select-auto">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & SUMMARY COUNTS BAR                                        */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-md">
              <HardHat className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-100 uppercase tracking-tight">
                  MECHANICS
                </h1>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-500/30">
                  READ-ONLY
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                ACTIVE EQUIPMENT ISSUES • LIVE SPREAD STATUS
              </p>
            </div>
          </div>

          {/* Quick Print Down Equipment button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenPrint}
              className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-amber-500/40 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95"
              title="Print Down Equipment Report"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>PRINT DOWN EQUIPMENT</span>
            </button>
          </div>
        </div>

        {/* Summary Ribbon */}
        <div className={`grid ${counts.spotCheck > 0 ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-5'} gap-2 text-center font-mono pt-1`}>
          {/* ACTIVE */}
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-slate-800 border-amber-500 shadow-md'
                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] sm:text-xs text-slate-400 block uppercase font-bold tracking-wider">
              ACTIVE
            </span>
            <span className="text-lg sm:text-2xl font-black text-slate-100">
              {counts.active}
            </span>
          </button>

          {/* SPOT CHECK (if any) */}
          {counts.spotCheck > 0 && (
            <button
              type="button"
              onClick={() => setFilterType('spot-check')}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                filterType === 'spot-check'
                  ? 'bg-sky-950/70 border-sky-500 shadow-md'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="text-[10px] sm:text-xs text-sky-400 block uppercase font-bold tracking-wider">
                SPOT CHECK
              </span>
              <span className="text-lg sm:text-2xl font-black text-sky-400">
                {counts.spotCheck}
              </span>
            </button>
          )}

          {/* DOWN */}
          <button
            type="button"
            onClick={() => setFilterType('down-repairing')}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              filterType === 'down-repairing'
                ? 'bg-rose-950/70 border-rose-500 shadow-md'
                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] sm:text-xs text-rose-400 block uppercase font-bold tracking-wider">
              DOWN
            </span>
            <span className={`text-lg sm:text-2xl font-black ${counts.down > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
              {counts.down}
            </span>
          </button>

          {/* REPAIRING */}
          <button
            type="button"
            onClick={() => setFilterType('down-repairing')}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              filterType === 'down-repairing'
                ? 'bg-amber-950/70 border-amber-500 shadow-md'
                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] sm:text-xs text-amber-400 block uppercase font-bold tracking-wider">
              REPAIRING
            </span>
            <span className={`text-lg sm:text-2xl font-black ${counts.repairing > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
              {counts.repairing}
            </span>
          </button>

          {/* DERATED */}
          <button
            type="button"
            onClick={() => setFilterType('derated')}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              filterType === 'derated'
                ? 'bg-orange-950/70 border-orange-500 shadow-md'
                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] sm:text-xs text-orange-400 block uppercase font-bold tracking-wider">
              DERATED
            </span>
            <span className={`text-lg sm:text-2xl font-black ${counts.derated > 0 ? 'text-orange-400' : 'text-slate-400'}`}>
              {counts.derated}
            </span>
          </button>

          {/* WATCH */}
          <button
            type="button"
            onClick={() => setFilterType('watch')}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              filterType === 'watch'
                ? 'bg-indigo-950/70 border-indigo-500 shadow-md'
                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] sm:text-xs text-indigo-400 block uppercase font-bold tracking-wider">
              WATCH
            </span>
            <span className={`text-lg sm:text-2xl font-black ${counts.watch > 0 ? 'text-indigo-400' : 'text-slate-400'}`}>
              {counts.watch}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN ACTIVE ISSUES LIST OR ALL CLEAR STATE                             */}
      {/* ========================================================================= */}
      {allActiveIssues.length === 0 ? (
        /* ======================================================================= */
        /* EMPTY STATE: ALL CLEAR ✓                                                */
        /* ======================================================================= */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-xl space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-xs font-mono font-black uppercase tracking-widest text-emerald-400">
              MECHANICS
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-100 uppercase tracking-tight mt-1">
              ALL CLEAR ✓
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto mt-2">
              No active equipment issues. All reported frac pumps are currently operational. Zero open failures or downtime logged.
            </p>
          </div>
          <div className="pt-2">
            <span className="inline-block px-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-400">
              Live updates active • New issues will appear automatically
            </span>
          </div>
        </div>
      ) : (
        /* ======================================================================= */
        /* ACTIVE ISSUES CARDS LIST (MOBILE-FIRST, LARGE, HIGH-CONTRAST)           */
        /* ======================================================================= */
        <div className="space-y-6">
          {/* Quick Filter Reset Banner if filtered */}
          {filterType !== 'all' && (
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs">
              <span className="text-slate-400 font-mono">
                Showing filter: <strong className="text-amber-400 uppercase">{filterType}</strong>
              </span>
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className="text-amber-400 font-bold underline cursor-pointer hover:text-amber-300"
              >
                Show All Issues ({allActiveIssues.length})
              </button>
            </div>
          )}

          {/* IF FILTERED TO SPOT CHECK */}
          {filterType === 'spot-check' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h2 className="text-base font-black uppercase tracking-wider text-sky-400 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  <span>SPOT CHECKS ({spotCheckItems.length})</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {spotCheckItems.map(renderIssueCard)}
              </div>
            </div>
          )}

          {/* IF FILTERED TO SPECIFIC TYPE */}
          {filterType === 'down-repairing' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h2 className="text-base font-black uppercase tracking-wider text-rose-400 flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4" />
                  <span>DOWN &amp; REPAIRING ({downAndRepairing.length})</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {downAndRepairing.map(renderIssueCard)}
              </div>
            </div>
          )}

          {filterType === 'derated' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h2 className="text-base font-black uppercase tracking-wider text-orange-400 flex items-center gap-2">
                  <Gauge className="w-4 h-4" />
                  <span>DERATED EQUIPMENT ({deratedItems.length})</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {deratedItems.map(renderIssueCard)}
              </div>
            </div>
          )}

          {filterType === 'watch' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h2 className="text-base font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span>WATCH ITEMS ({watchItems.length})</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {watchItems.map(renderIssueCard)}
              </div>
            </div>
          )}

          {/* ALL VIEW: GROUPED BY SPOT CHECKS, DOWN/REPAIRING, DERATED, AND WATCH ITEMS */}
          {filterType === 'all' && (
            <>
              {/* GROUP 0: SPOT CHECKS */}
              {spotCheckItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-sky-400 flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4" />
                      <span>SPOT CHECKS ({spotCheckItems.length})</span>
                    </h2>
                    <span className="text-[11px] font-mono text-slate-500">
                      Out of Service
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {spotCheckItems.map(renderIssueCard)}
                  </div>
                </div>
              )}

              {/* GROUP 1: DOWN / REPAIRING */}
              {downAndRepairing.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-rose-400 flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4" />
                      <span>DOWN &amp; REPAIRING ({downAndRepairing.length})</span>
                    </h2>
                    <span className="text-[11px] font-mono text-slate-500">
                      High Priority
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {downAndRepairing.map(renderIssueCard)}
                  </div>
                </div>
              )}

              {/* GROUP 2: DERATED */}
              {deratedItems.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-orange-400 flex items-center gap-2">
                      <Gauge className="w-4 h-4" />
                      <span>DERATED EQUIPMENT ({deratedItems.length})</span>
                    </h2>
                    <span className="text-[11px] font-mono text-slate-500">
                      Operational Limitation
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {deratedItems.map(renderIssueCard)}
                  </div>
                </div>
              )}

              {/* GROUP 3: WATCH ITEMS (LOWER ON PAGE, VISUALLY DISTINCT) */}
              {watchItems.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      <span>WATCH ITEMS ({watchItems.length})</span>
                    </h2>
                    <span className="text-[11px] font-mono text-slate-500">
                      Monitoring Next Shift
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {watchItems.map(renderIssueCard)}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Bottom Context Notice */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl text-center text-xs font-mono text-slate-400 space-y-1">
            <p>
              Displaying all currently open &amp; unresolved spread issues. Running pumps are hidden.
            </p>
            <p className="text-[11px] text-slate-500">
              When datavan operators return an issue to service, it clears from this screen in real-time.
            </p>
          </div>
        </div>
      )}

      {/* Embedded Down Equipment Print Modal */}
      <ActiveSpreadIssuesPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        defaultReport="down-equipment"
      />
    </div>
  );
};
