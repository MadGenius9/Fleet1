import React, { useState, useEffect } from 'react';
import type {
  PumpOpsEvent,
  SpotCheckHoleResult,
  SpotCheckCondition,
  SpotCheckPart,
  PumpOpStatus,
} from '../types';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Eye,
  AlertOctagon,
  Gauge,
  ClipboardCheck,
  Clock,
  Sparkles,
} from 'lucide-react';


interface SpotCheckModalProps {
  station: string;
  pump: string;
  existingEvent?: PumpOpsEvent | null; // For EDIT SPOT CHECK
  onClose: () => void;
  onSaveSpotCheck: (
    data: {
      station: string;
      pump: string;
      checks: SpotCheckHoleResult[];
      notes?: string;
    },
    existingId?: string
  ) => Promise<PumpOpsEvent>;
  technicianName?: string;
}

const COMMON_NOTE_CHIPS = [
  'Valves & seats look good',
  'Seat starting to wash',
  'Valve pitted slightly',
  'Checked after pressure spike',
  'Replaced valve & seat',
];

export const SpotCheckModal: React.FC<SpotCheckModalProps> = ({
  station,
  pump,
  existingEvent,
  onClose,
  onSaveSpotCheck,
  technicianName,
}) => {
  const isEditing = Boolean(existingEvent);

  // Hole checks: Hole 1 through 5
  // Initialize from existingEvent or default all 5 holes unselected / good
  const initialChecksMap = (): Record<number, { condition?: SpotCheckCondition; part?: SpotCheckPart; recheck?: boolean }> => {
    const map: Record<number, { condition?: SpotCheckCondition; part?: SpotCheckPart; recheck?: boolean }> = {
      1: {},
      2: {},
      3: {},
      4: {},
      5: {},
    };
    if (existingEvent?.checks && Array.isArray(existingEvent.checks)) {
      existingEvent.checks.forEach((c) => {
        if (c.hole >= 1 && c.hole <= 5) {
          map[c.hole] = {
            condition: c.condition,
            part: c.part,
          };
        }
      });
    }
    return map;
  };

  const [holeChecks, setHoleChecks] = useState(initialChecksMap);
  const [notes, setNotes] = useState<string>(existingEvent?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setHoleCondition = (hole: number, condition: SpotCheckCondition) => {
    setHoleChecks((prev) => {
      const current = prev[hole] || {};
      // If clicking already selected condition, keep it
      return {
        ...prev,
        [hole]: {
          ...current,
          condition,
          // default part to BOTH if not yet set
          part: current.part || 'BOTH',
        },
      };
    });
  };

  const setHolePart = (hole: number, part: SpotCheckPart) => {
    setHoleChecks((prev) => {
      const current = prev[hole] || {};
      return {
        ...prev,
        [hole]: {
          ...current,
          part: current.part === part ? undefined : part,
        },
      };
    });
  };

  // Quick action: Mark all 5 holes GOOD
  const handleMarkAllGood = () => {
    setHoleChecks({
      1: { condition: 'GOOD', part: 'BOTH' },
      2: { condition: 'GOOD', part: 'BOTH' },
      3: { condition: 'GOOD', part: 'BOTH' },
      4: { condition: 'GOOD', part: 'BOTH' },
      5: { condition: 'GOOD', part: 'BOTH' },
    });
  };

  const handleSave = async () => {
    // Collect checked holes
    const checks: SpotCheckHoleResult[] = [];
    let hasBad = false;
    let hasWatch = false;

    for (let h = 1; h <= 5; h++) {
      const item = holeChecks[h];
      if (item && item.condition) {
        checks.push({
          hole: h,
          condition: item.condition,
          part: item.part,
        });
        if (item.condition === 'BAD') hasBad = true;
        if (item.condition === 'WATCH') hasWatch = true;
      }
    }

    if (checks.length === 0) {
      setErrorMessage('Please check at least one hole condition (e.g. Hole 1 Good).');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const cleanNotes = notes.trim() || undefined;

      await onSaveSpotCheck(
        {
          station,
          pump,
          checks,
          notes: cleanNotes,
        },
        existingEvent?.id
      );

      // The Spot Check event itself is now the active out-of-service issue (or updated in place).
      // Close cleanly without creating duplicate linked issues.
      onClose();
    } catch (err) {
      console.error('Failed to save spot check:', err);
      setErrorMessage('Error saving spot check. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 max-w-lg w-full max-h-[94vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 stroke-[2.5]" />
                <span>{isEditing ? 'EDIT SPOT CHECK' : 'SPOT CHECK'}</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                VALVES & SEATS
              </span>
            </div>

            <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight mt-0.5">
              {station || 'Station'} • Pump {pump}
            </h3>

            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Non-failure operational check • Logged by {technicianName || 'Operator'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto py-3 space-y-4 flex-1 pr-1">
          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold px-3 py-2 rounded-xl flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-white ml-2 text-sm"
              >
                ✕
              </button>
            </div>
          )}

          {/* Quick Mark All Good button */}
          <div className="flex items-center justify-end bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
            <button
              type="button"
              onClick={handleMarkAllGood}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-black uppercase tracking-tight cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>MARK ALL 5 GOOD</span>
            </button>
          </div>

          {/* Holes 1 through 5 List */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-mono font-black uppercase text-slate-300 tracking-wider block">
              HOLE CONDITIONS (HOLES 1 — 5)
            </label>

            {[1, 2, 3, 4, 5].map((holeNum) => {
              const check = holeChecks[holeNum] || {};
              const isGood = check.condition === 'GOOD';
              const isWatch = check.condition === 'WATCH';
              const isBad = check.condition === 'BAD';
              const isChecked = Boolean(check.condition);

              return (
                <div
                  key={holeNum}
                  className={`bg-slate-950 border rounded-xl p-3 transition-all space-y-2 ${
                    isGood
                      ? 'border-emerald-500/40 bg-emerald-950/10'
                      : isWatch
                      ? 'border-indigo-500/50 bg-indigo-950/20'
                      : isBad
                      ? 'border-rose-500/50 bg-rose-950/20'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Top row: Hole Label + Condition buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-slate-100">
                        HOLE {holeNum}
                      </span>
                      {isChecked && (
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                            isGood
                              ? 'text-emerald-400 bg-emerald-950/60'
                              : isWatch
                              ? 'text-indigo-400 bg-indigo-950/60'
                              : 'text-rose-400 bg-rose-950/60'
                          }`}
                        >
                          {check.condition}
                        </span>
                      )}
                    </div>

                    {/* Condition selection buttons: GOOD | WATCH | BAD */}
                    <div className="grid grid-cols-3 gap-1.5 sm:w-64">
                      <button
                        type="button"
                        onClick={() => setHoleCondition(holeNum, 'GOOD')}
                        className={`min-h-[42px] px-2 py-1.5 rounded-xl font-mono font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          isGood
                            ? 'bg-emerald-500 text-slate-950 shadow-md ring-2 ring-emerald-300'
                            : 'bg-slate-900 text-emerald-400 border border-slate-800 hover:border-emerald-500/40'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>GOOD</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setHoleCondition(holeNum, 'WATCH')}
                        className={`min-h-[42px] px-2 py-1.5 rounded-xl font-mono font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          isWatch
                            ? 'bg-indigo-500 text-white shadow-md ring-2 ring-indigo-300'
                            : 'bg-slate-900 text-indigo-300 border border-slate-800 hover:border-indigo-500/40'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>WATCH</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setHoleCondition(holeNum, 'BAD')}
                        className={`min-h-[42px] px-2 py-1.5 rounded-xl font-mono font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          isBad
                            ? 'bg-rose-500 text-slate-950 shadow-md ring-2 ring-rose-300'
                            : 'bg-slate-900 text-rose-300 border border-slate-800 hover:border-rose-500/40'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>BAD</span>
                      </button>
                    </div>
                  </div>

                  {/* Optional Part detail & Recheck flag if hole is checked */}
                  {isChecked && (
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {/* Optional Part selection: VALVE | SEAT | BOTH */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">
                          Part:
                        </span>
                        {(['VALVE', 'SEAT', 'BOTH'] as SpotCheckPart[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setHolePart(holeNum, p)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                              check.part === p
                                ? 'bg-amber-500 text-slate-950 font-black'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>


                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Optional Notes */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-mono font-black uppercase text-slate-400 tracking-wider block">
              OPTIONAL NOTES
            </label>
            <div className="flex flex-wrap gap-1">
              {COMMON_NOTE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setNotes(chip)}
                  className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded text-[11px] cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Seat starting to wash, valve looks good, notes about findings..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 font-mono"
            />
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSave}
            className="min-h-[44px] px-6 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-amber-500/25 flex items-center gap-2 active:scale-95 transition-all"
          >
            {isSubmitting ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                <span>SAVING...</span>
              </>
            ) : (
              <>
                <ClipboardCheck className="w-4 h-4 stroke-[2.5]" />
                <span>SAVE SPOT CHECK</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
