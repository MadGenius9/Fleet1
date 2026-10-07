import React, { useState, useEffect } from 'react';
import type { PumpOpsEvent, PumpOpStatus } from '../types';
import {
  X,
  Clock,
  Edit2,
  AlertCircle,
  AlertOctagon,
  Wrench,
  Gauge,
  Eye,
  CheckCircle,
} from 'lucide-react';

interface EditPumpIssueModalProps {
  event: PumpOpsEvent;
  onClose: () => void;
  onSave: (eventId: string, updates: Partial<PumpOpsEvent>) => Promise<void>;
  technicianName?: string;
}

const CATEGORIES = [
  'FLUID END',
  'POWER END',
  'ENGINE',
  'TRANSMISSION / DRIVE',
  'FUEL',
  'ELECTRICAL / CONTROLS',
  'SUCTION',
  'DISCHARGE / IRON',
  'COMMUNICATION / DATA',
  'OTHER',
];

const FLUID_END_COMPONENTS = [
  'PACKING',
  'D-RINGS',
  'VALVE / SEAT',
  'PLUNGER',
  'LEAK',
  'OTHER',
];

const POWER_END_COMPONENTS = [
  'CROSSHEAD',
  'BEARING',
  'LUBE / OIL PRESSURE',
  'CONNECTING ROD',
  'CRANKSHAFT',
  'OTHER',
];

const ENGINE_COMPONENTS = [
  'COOLANT / OVERHEAT',
  'OIL PRESSURE',
  'ECM / CODES',
  'TURBO / EXHAUST',
  'FUEL FILTER',
  'OTHER',
];

const TRANSMISSION_COMPONENTS = [
  'TORQUE CONVERTER',
  'SLIPPING / CLUTCH',
  'HIGH TEMP',
  'DRIVELINE / U-JOINT',
  'OTHER',
];

const COMMON_NOTE_CHIPS = [
  'Packing leaking heavy',
  'Pressure would not hold',
  'Maintenance notified',
  'Waiting on parts',
  'Blown packing',
  'Suction starving',
  'High temp alarm',
  'Replaced valve & seat',
  'Running fine now',
];

export const EditPumpIssueModal: React.FC<EditPumpIssueModalProps> = ({
  event,
  onClose,
  onSave,
  technicianName,
}) => {
  // Capture initial updatedAt for multi-device optimistic concurrency warning
  const initialUpdatedAt = event.updatedAt || event.createdAt || event.startedAt;

  // Detect whether this is a watch-only item (never marked DOWN, REPAIRING, or DERATED)
  const isInitiallyWatchOnly =
    event.eventType === 'watch_item' ||
    (!['DOWN', 'REPAIRING', 'DERATED'].includes(event.status) && Boolean(event.watchNextShift));

  // 1. Operational status: DOWN | REPAIRING | DERATED (or WATCH if watch-only)
  const [selectedStatus, setSelectedStatus] = useState<PumpOpStatus | 'WATCH'>(
    ['DOWN', 'REPAIRING', 'DERATED'].includes(event.status)
      ? event.status
      : 'WATCH'
  );

  // 2. Watch Next Shift toggle (boolean)
  const [watchNextShift, setWatchNextShift] = useState<boolean>(Boolean(event.watchNextShift));

  // 3. Issue fields
  const [category, setCategory] = useState<string>(event.category || 'FLUID END');
  const [component, setComponent] = useState<string>(event.component || 'PACKING');
  const [holes, setHoles] = useState<number[]>(
    Array.isArray(event.holes) ? [...event.holes] : []
  );
  const [notes, setNotes] = useState<string>(event.notes || '');
  const [limitation, setLimitation] = useState<string>(event.limitation || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // If the event is modified in the background while this modal is open
  useEffect(() => {
    if (event.updatedAt && event.updatedAt > initialUpdatedAt) {
      setConflictWarning('ISSUE UPDATED ON ANOTHER DEVICE');
    }
  }, [event.updatedAt, initialUpdatedAt]);

  const handleReloadLatest = () => {
    setSelectedStatus(
      ['DOWN', 'REPAIRING', 'DERATED'].includes(event.status)
        ? event.status
        : 'WATCH'
    );
    setCategory(event.category || 'FLUID END');
    setComponent(event.component || 'PACKING');
    setHoles(Array.isArray(event.holes) ? [...event.holes] : []);
    setNotes(event.notes || '');
    setWatchNextShift(Boolean(event.watchNextShift));
    setLimitation(event.limitation || '');
    setConflictWarning(null);
  };

  const toggleHole = (holeNum: number) => {
    setHoles((prev) => {
      if (prev.includes(holeNum)) {
        return prev.filter((h) => h !== holeNum);
      }
      return [...prev, holeNum].sort((a, b) => a - b);
    });
  };

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    if (newCat === 'FLUID END') {
      if (!FLUID_END_COMPONENTS.includes(component)) setComponent('PACKING');
    } else if (newCat === 'POWER END') {
      if (!POWER_END_COMPONENTS.includes(component)) setComponent('CROSSHEAD');
    } else if (newCat === 'ENGINE') {
      if (!ENGINE_COMPONENTS.includes(component)) setComponent('COOLANT / OVERHEAT');
    } else if (newCat === 'TRANSMISSION / DRIVE') {
      if (!TRANSMISSION_COMPONENTS.includes(component)) setComponent('TORQUE CONVERTER');
    } else {
      setComponent('GENERAL');
    }
  };

  // Direct clear watch action
  const handleClearWatch = async () => {
    setIsSubmitting(true);
    try {
      const now = Date.now();
      const updates: Partial<PumpOpsEvent> = {
        resolvedAt: now,
        watchNextShift: false,
        lastEditedAt: now,
        lastEditedBy: technicianName || 'Operator',
        notes: notes.trim()
          ? event.notes
            ? `${event.notes} • ${notes.trim()}`
            : notes.trim()
          : event.notes,
      };
      await onSave(event.id, updates);
      onClose();
    } catch (err) {
      console.error('Failed to clear watch item:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    try {
      const now = Date.now();
      const cleanNotes = notes.trim() ? notes.trim() : '';

      // Determine operational status and downAt
      let targetStatus: PumpOpStatus = event.status;
      let targetEventType = event.eventType;
      let targetDownAt: number | null | undefined = event.downAt;
      let targetRepairStartedAt = event.repairStartedAt;
      let targetResolvedAt = event.resolvedAt;

      if (selectedStatus === 'DOWN') {
        targetStatus = 'DOWN';
        targetEventType = 'pump_down';
        if (event.status === 'DOWN' || event.status === 'REPAIRING') {
          // Already down: retain original downtime start clock
          targetDownAt = event.downAt || event.startedAt;
        } else {
          // DERATED or WATCH -> DOWN: downtime starts NOW!
          targetDownAt = now;
        }
      } else if (selectedStatus === 'REPAIRING') {
        targetStatus = 'REPAIRING';
        targetEventType = 'repair_started';
        if (event.status === 'DOWN' || event.status === 'REPAIRING') {
          targetDownAt = event.downAt || event.startedAt;
        } else {
          targetDownAt = now;
        }
        if (!targetRepairStartedAt) {
          targetRepairStartedAt = now;
        }
      } else if (selectedStatus === 'DERATED') {
        targetStatus = 'DERATED';
        targetEventType = 'derated';
        // If it was never actually down, downAt is null
        if (event.status !== 'DOWN' && event.status !== 'REPAIRING') {
          targetDownAt = null;
        }
      } else if (selectedStatus === 'WATCH') {
        targetStatus = 'RUNNING';
        targetEventType = 'watch_item';
        targetDownAt = null;
      }

      // If issue was watch-only and operator turned off watchNextShift (and did not take pump DOWN/REPAIRING/DERATED)
      if (isInitiallyWatchOnly && !watchNextShift && (selectedStatus === 'WATCH' || targetStatus === 'RUNNING')) {
        targetResolvedAt = now;
      }

      const updates: Partial<PumpOpsEvent> = {
        category: category.trim(),
        component: component.trim(),
        holes: category === 'FLUID END' && holes.length > 0 ? holes : [],
        notes: cleanNotes,
        watchNextShift,
        status: targetStatus,
        eventType: targetEventType,
        downAt: targetDownAt,
        repairStartedAt: targetRepairStartedAt,
        resolvedAt: targetResolvedAt,
        lastEditedAt: now,
        lastEditedBy: technicianName || 'Operator',
      };

      if (targetStatus === 'DERATED') {
        updates.limitation = limitation.trim() ? limitation.trim() : undefined;
      } else {
        updates.limitation = undefined;
      }

      await onSave(event.id, updates);
      onClose();
    } catch (err) {
      console.error('Failed to update pump issue:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDeratedActive = selectedStatus === 'DERATED';
  const showClearWatchButton = Boolean(event.watchNextShift || event.eventType === 'watch_item');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" />
                <span>EDIT ISSUE</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase tracking-wider ${
                  selectedStatus === 'DOWN'
                    ? 'bg-rose-500 text-slate-950'
                    : selectedStatus === 'REPAIRING'
                    ? 'bg-amber-500 text-slate-950'
                    : selectedStatus === 'DERATED'
                    ? 'bg-orange-500 text-slate-950'
                    : 'bg-indigo-500 text-slate-950'
                }`}
              >
                {selectedStatus}
              </span>
            </div>

            <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight mt-0.5">
              {event.station || 'Station'} • Pump {event.pump}
            </h3>

            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Reported by {event.operator || 'Operator'}
              {event.lastEditedBy && (
                <span className="text-slate-500 ml-1.5">
                  • Edited by {event.lastEditedBy}
                </span>
              )}
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

        {/* Concurrency Conflict Warning if modified on another device */}
        {conflictWarning && (
          <div className="mt-3 p-3 bg-amber-500/20 border border-amber-500/50 rounded-xl text-amber-300 text-xs flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span className="font-bold">{conflictWarning}</span>
            </div>
            <button
              type="button"
              onClick={handleReloadLatest}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] rounded-lg uppercase cursor-pointer"
            >
              RELOAD LATEST
            </button>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto py-3 space-y-4 flex-1 pr-1">
          {/* ========================================================================= */}
          {/* 1. OPERATIONAL STATUS SELECTOR                                            */}
          {/* ========================================================================= */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono font-black uppercase text-slate-300 tracking-wider block">
                OPERATIONAL STATUS
              </label>
              {event.downAt && selectedStatus === 'DOWN' && (
                <span className="text-[10px] font-mono text-slate-400">
                  Down since {new Date(event.downAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className={`grid ${isInitiallyWatchOnly ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
              <button
                type="button"
                onClick={() => setSelectedStatus('DOWN')}
                className={`min-h-[44px] px-2 py-2 rounded-xl font-mono font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
                  selectedStatus === 'DOWN'
                    ? 'bg-rose-500 text-slate-950 shadow-md ring-2 ring-rose-400'
                    : 'bg-slate-950 text-rose-300/80 border border-slate-800 hover:border-rose-500/50'
                }`}
              >
                <AlertOctagon className="w-4 h-4 stroke-[2.5]" />
                <span>DOWN</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatus('REPAIRING')}
                className={`min-h-[44px] px-2 py-2 rounded-xl font-mono font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
                  selectedStatus === 'REPAIRING'
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400'
                    : 'bg-slate-950 text-amber-300/80 border border-slate-800 hover:border-amber-500/50'
                }`}
              >
                <Wrench className="w-4 h-4 stroke-[2.5]" />
                <span>REPAIRING</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatus('DERATED')}
                className={`min-h-[44px] px-2 py-2 rounded-xl font-mono font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
                  selectedStatus === 'DERATED'
                    ? 'bg-orange-500 text-slate-950 shadow-md ring-2 ring-orange-400'
                    : 'bg-slate-950 text-orange-300/80 border border-slate-800 hover:border-orange-500/50'
                }`}
              >
                <Gauge className="w-4 h-4 stroke-[2.5]" />
                <span>DERATED</span>
              </button>

              {isInitiallyWatchOnly && (
                <button
                  type="button"
                  onClick={() => setSelectedStatus('WATCH')}
                  className={`min-h-[44px] px-2 py-2 rounded-xl font-mono font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
                    selectedStatus === 'WATCH'
                      ? 'bg-indigo-500 text-white shadow-md ring-2 ring-indigo-400'
                      : 'bg-slate-950 text-indigo-300/80 border border-slate-800 hover:border-indigo-500/50'
                  }`}
                >
                  <Eye className="w-4 h-4 stroke-[2.5]" />
                  <span>WATCH</span>
                </button>
              )}
            </div>

            {selectedStatus === 'DOWN' && event.status !== 'DOWN' && (
              <p className="text-[11px] font-mono text-amber-300/90 pt-0.5">
                ⚡ Downtime clock will start when saved as DOWN ({new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})
              </p>
            )}
          </div>

          {/* Derated Limitation Field (Visible when status is DERATED) */}
          {isDeratedActive && (
            <div className="space-y-1 animate-in fade-in">
              <label className="text-[11px] font-mono font-black uppercase text-orange-400 tracking-wider block">
                MAX RATE / PRESSURE LIMITATION
              </label>
              <input
                type="text"
                value={limitation}
                onChange={(e) => setLimitation(e.target.value)}
                placeholder="e.g. Max 8 bpm, Maximum 1800 RPM..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. WATCH NEXT SHIFT TOGGLE (ON / OFF)                                     */}
          {/* ========================================================================= */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Eye className={`w-4 h-4 ${watchNextShift ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  WATCH NEXT SHIFT
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {watchNextShift
                  ? 'Flagged for incoming crew in shift handoff & reports'
                  : 'Not flagged for handoff watch list'}
              </span>
            </div>

            <div className="flex items-center rounded-xl bg-slate-900 p-1 border border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => setWatchNextShift(false)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-mono font-black uppercase transition-all cursor-pointer ${
                  !watchNextShift
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                OFF
              </button>
              <button
                type="button"
                onClick={() => setWatchNextShift(true)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-mono font-black uppercase transition-all cursor-pointer ${
                  watchNextShift
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ON
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 3. CATEGORY SELECTION                                                     */}
          {/* ========================================================================= */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono font-black uppercase text-slate-300 tracking-wider block">
              CATEGORY (SELECT ONE)
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryChange(cat)}
                  className={`min-h-[42px] px-2.5 py-2 rounded-xl font-bold text-xs uppercase tracking-tight text-center transition-all cursor-pointer ${
                    category === cat
                      ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                      : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Component Selection for Fluid End */}
          {category === 'FLUID END' && (
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider block">
                FLUID END COMPONENT
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {FLUID_END_COMPONENTS.map((comp) => (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => setComponent(comp)}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl font-bold text-xs uppercase tracking-tight transition-all cursor-pointer ${
                      component === comp
                        ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                        : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {comp}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. Holes 1 to 5 Multi-select (For Fluid End) */}
          {category === 'FLUID END' && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider">
                  HOLE / POSITION (MULTI-SELECT)
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  Selected: {holes.length > 0 ? `Hole ${holes.join(', ')}` : 'None'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((h) => {
                  const isSelected = holes.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggleHole(h)}
                      className={`min-h-[46px] rounded-xl font-mono font-black text-base transition-all cursor-pointer shadow-sm ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {h} {isSelected ? '✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Power End components */}
          {category === 'POWER END' && (
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider block">
                POWER END COMPONENT
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {POWER_END_COMPONENTS.map((comp) => (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => setComponent(comp)}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl font-bold text-xs uppercase tracking-tight cursor-pointer ${
                      component === comp
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-950 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {comp}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Engine components */}
          {category === 'ENGINE' && (
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider block">
                ENGINE COMPONENT
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {ENGINE_COMPONENTS.map((comp) => (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => setComponent(comp)}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl font-bold text-xs uppercase tracking-tight cursor-pointer ${
                      component === comp
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-950 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {comp}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transmission components */}
          {category === 'TRANSMISSION / DRIVE' && (
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider block">
                TRANSMISSION COMPONENT
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {TRANSMISSION_COMPONENTS.map((comp) => (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => setComponent(comp)}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl font-bold text-xs uppercase tracking-tight cursor-pointer ${
                      component === comp
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-950 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {comp}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Notes Chips */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-mono font-black uppercase text-slate-400 tracking-wider block">
              QUICK NOTE CHIPS (OPTIONAL)
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
              placeholder="Optional free-form notes / correction details..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 font-mono"
            />
          </div>
        </form>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800">
          <div>
            {showClearWatchButton && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleClearWatch}
                className="min-h-[42px] px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                title="Mark this watch item resolved without taking pump down"
              >
                <CheckCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>CLEAR WATCH</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
            >
              CANCEL
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit()}
              className="min-h-[42px] px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-amber-500/25 flex items-center gap-2 active:scale-95 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>SAVING...</span>
                </>
              ) : (
                <>
                  <Edit2 className="w-4 h-4 stroke-[2.5]" />
                  <span>SAVE CHANGES</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
