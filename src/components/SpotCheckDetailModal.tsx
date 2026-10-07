import React from 'react';
import type { PumpOpsEvent } from '../types';
import { X, ClipboardCheck, Edit2, Calendar, Clock, Eye, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SpotCheckDetailModalProps {
  event: PumpOpsEvent;
  onClose: () => void;
  onEdit: (event: PumpOpsEvent) => void;
}

export const SpotCheckDetailModal: React.FC<SpotCheckDetailModalProps> = ({
  event,
  onClose,
  onEdit,
}) => {
  const timeStr = new Date(event.startedAt || event.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 stroke-[2.5]" />
                <span>VALVES & SEATS SPOT CHECK</span>
              </span>
            </div>

            <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight mt-0.5">
              {event.station || 'Station'} • Pump {event.pump}
            </h3>

            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              {timeStr} • {event.date} ({event.shift === 'night' ? 'Night' : 'Day'})
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Checked Holes 1 to 5 Details */}
        <div className="space-y-2">
          <label className="text-[11px] font-mono font-black uppercase text-slate-400 tracking-wider block">
            HOLE INSPECTION RESULTS
          </label>

          {(!event.checks || event.checks.length === 0) ? (
            <div className="bg-slate-950 p-4 text-center text-xs font-mono text-slate-500 rounded-xl">
              No specific hole results recorded.
            </div>
          ) : (
            <div className="space-y-1.5">
              {event.checks.map((c) => {
                const isGood = c.condition === 'GOOD';
                const isWatch = c.condition === 'WATCH';
                const isBad = c.condition === 'BAD';

                return (
                  <div
                    key={c.hole}
                    className={`flex items-center justify-between p-2.5 rounded-xl border font-mono text-xs ${
                      isGood
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                        : isWatch
                        ? 'bg-indigo-950/30 border-indigo-500/40 text-indigo-300 font-bold'
                        : 'bg-rose-950/30 border-rose-500/40 text-rose-300 font-black'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-200">
                        HOLE {c.hole}
                      </span>
                      {c.part && (
                        <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-300">
                          {c.part}
                        </span>
                      )}
                      {c.recheckNextStage && (
                        <span className="text-[10px] text-indigo-300 bg-indigo-950/80 px-1 rounded border border-indigo-500/30">
                          RECHECK
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 font-bold">
                      {isGood && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      {isWatch && <Eye className="w-3.5 h-3.5 text-indigo-400" />}
                      {isBad && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                      <span>{c.condition}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Notes */}
        {event.notes && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1 font-mono">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">
              Notes:
            </span>
            <p className="text-slate-200 italic">
              "{event.notes}"
            </p>
          </div>
        )}

        {/* Footer info: Operator and edits */}
        <div className="text-[11px] font-mono text-slate-400 space-y-0.5 pt-1">
          <div>Reported by {event.operator || 'Operator'}</div>
          {event.lastEditedBy && (
            <div className="text-slate-500">
              Last edited by {event.lastEditedBy} at{' '}
              {new Date(event.lastEditedAt || event.updatedAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
          )}
        </div>

        {/* Bottom Actions: Edit and Close */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(event);
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 hover:text-amber-400 text-slate-300 font-bold text-xs uppercase rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            <Edit2 className="w-3.5 h-3.5 text-amber-400" />
            <span>EDIT SPOT CHECK</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase rounded-xl cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
