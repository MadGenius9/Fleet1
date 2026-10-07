import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import { removeQueuedWrite } from '../lib/firebase';

interface AssignmentConflictModalProps {
  onReviewLineup: () => void;
}

export const AssignmentConflictModal: React.FC<AssignmentConflictModalProps> = ({
  onReviewLineup,
}) => {
  const { assignmentConflicts, dismissAssignmentConflict, syncErrors, flushQueue } = useFleet();

  if (!assignmentConflicts || assignmentConflicts.length === 0) {
    return null;
  }

  // Show the most recent conflict
  const activeConflict = assignmentConflicts[0];

  const handleReviewLineup = () => {
    dismissAssignmentConflict(activeConflict.id);
    onReviewLineup();
  };

  const handleCancelChange = () => {
    // Find matching permanent conflict in offline queue if present and cancel it
    const matchingError = syncErrors.find(
      (e) =>
        e.isConflict &&
        e.conflictDetails?.station === activeConflict.station &&
        e.conflictDetails?.requestedPump === activeConflict.requestedPump
    );
    if (matchingError) {
      removeQueuedWrite(matchingError.id);
      flushQueue();
    }
    dismissAssignmentConflict(activeConflict.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-amber-500 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block font-mono">
              CONCURRENT UPDATE DETECTED
            </span>
            <h3 className="font-black text-lg sm:text-xl text-slate-100 uppercase tracking-tight">
              STATION ASSIGNMENT CHANGED
            </h3>
          </div>
        </div>

        {/* Message */}
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Another device updated this station.
        </p>

        {/* Details Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5 font-mono text-xs">
          <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800/80">
            <span className="uppercase text-[11px] font-bold">Target Station:</span>
            <span className="font-black text-amber-400 text-sm">{activeConflict.station}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Current Pump:
              </span>
              <span className="text-base font-black text-emerald-400 block">
                {activeConflict.currentPump}
              </span>
              <span className="text-[9px] text-slate-500 block">Confirmed on spread</span>
            </div>

            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Requested Pump:
              </span>
              <span className="text-base font-black text-amber-400 block">
                {activeConflict.requestedPump}
              </span>
              <span className="text-[9px] text-slate-500 block">Conflicting swap</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <p className="text-[11px] text-slate-400">
          The conflicting swap was rejected to preserve confirmed station assignments. Your historical readings and operational data remain safe.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleCancelChange}
            className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>CANCEL CHANGE</span>
          </button>
          <button
            type="button"
            onClick={handleReviewLineup}
            className="min-h-[44px] px-5 py-2 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>REVIEW LINEUP</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
