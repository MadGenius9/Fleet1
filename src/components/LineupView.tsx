import React, { useState } from 'react';
import { useFleet, sortStations } from '../context/FleetContext';
import {
  Fuel,
  MapPin,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Layers,
  XCircle,
  RefreshCw,
  ArrowLeftRight,
  Boxes
} from 'lucide-react';

interface LineupViewProps {
  onGoToEntry?: () => void;
  onGoToInventory?: () => void;
}

export const LineupView: React.FC<LineupViewProps> = ({ onGoToEntry, onGoToInventory }) => {
  const {
    fleet,
    assignPumpToStation,
    swapPumpOnStation,
    removePumpFromStation,
    deletePumpFromFleet,
    clearAllPumps,
    addStation,
    deleteStation,
    getPumpsForStation,
    getStationForPump
  } = useFleet();

  // 1. Duplicate Assignment Confirmation Modal State
  const [conflictModal, setConflictModal] = useState<{
    pump: string;
    currentStation: string;
    targetStation: string;
  } | null>(null);

  // 3. Swap Pump Modal State
  const [swapModal, setSwapModal] = useState<{
    station: string;
    currentPump: string;
    replacementPump: string;
  } | null>(null);

  // Station Management State
  const [newStationName, setNewStationName] = useState('');
  const [stationError, setStationError] = useState('');

  // Delete & Clear Modals State
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [deletePumpTarget, setDeletePumpTarget] = useState<string | null>(null);
  const [deleteStationTarget, setDeleteStationTarget] = useState<string | null>(null);

  // Active sorted stations
  const sortedStations = React.useMemo(() => {
    return sortStations(fleet.stations);
  }, [fleet.stations]);

  // Attempt assign pump to station with duplicate check
  const handleAttemptAssign = (stationName: string, pumpName: string) => {
    if (!pumpName) return;
    const cleanPump = pumpName.trim();
    const existingStation = getStationForPump(cleanPump);

    if (existingStation && existingStation !== stationName) {
      // Pump is already on another station! Show move confirmation modal
      setConflictModal({
        pump: cleanPump,
        currentStation: existingStation,
        targetStation: stationName,
      });
      return;
    }

    // Direct assign
    assignPumpToStation(stationName, cleanPump, true);
  };

  // Confirm moving pump from current station to target station
  const confirmMovePump = async () => {
    if (!conflictModal) return;
    await assignPumpToStation(conflictModal.targetStation, conflictModal.pump, true);
    setConflictModal(null);
  };

  // Handle Swap Pump on Station
  const handleStartSwap = (stationName: string, currentPump: string) => {
    // Pick the first available alternative pump or first directory pump
    const availablePumps = fleet.pumps.filter((p) => p !== currentPump);
    const defaultReplacement = availablePumps[0] || '';
    setSwapModal({
      station: stationName,
      currentPump,
      replacementPump: defaultReplacement,
    });
  };

  const confirmSwap = async () => {
    if (!swapModal || !swapModal.replacementPump) return;
    await swapPumpOnStation(swapModal.station, swapModal.currentPump, swapModal.replacementPump);
    setSwapModal(null);
  };

  // Remove pump from station
  const handleRemoveFromStation = async (stationName: string, pumpName: string) => {
    await removePumpFromStation(stationName, pumpName);
  };

  // Confirm delete pump from fleet
  const confirmDeletePumpFromFleet = async () => {
    if (deletePumpTarget) {
      await deletePumpFromFleet(deletePumpTarget);
      setDeletePumpTarget(null);
    }
  };

  // Add extra station bay
  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newStationName.trim();
    if (!clean) {
      setStationError('Enter a station name or number.');
      return;
    }
    if (fleet.stations.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      setStationError(`Station "${clean}" already exists.`);
      return;
    }
    setStationError('');
    await addStation(clean);
    setNewStationName('');
  };

  // Calculate lineup stats
  const totalAssignedStations = sortedStations.filter(
    (st) => getPumpsForStation(st).length > 0
  ).length;

  return (
    <div className="space-y-6 pb-28 max-w-4xl mx-auto">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-black tracking-widest text-amber-400">
                SPREAD LINEUP
              </span>
              <span className="text-slate-600 font-bold">•</span>
              <span className="text-xs font-mono font-bold text-slate-300">
                FLEET 1
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight mt-0.5">
              Pump Lineup
            </h1>
            <div className="text-xs font-mono font-bold text-amber-400 mt-0.5">
              {totalAssignedStations} of {sortedStations.length} ACTIVE STATIONS
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onGoToInventory && (
              <button
                type="button"
                onClick={onGoToInventory}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>Manage Pump Inventory →</span>
              </button>
            )}

            {totalAssignedStations > 0 && onGoToEntry && (
              <button
                onClick={onGoToEntry}
                className="self-start sm:self-auto min-h-[44px] px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-amber-500/20"
              >
                <span>Enter Hours Sheet</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Station Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-black text-slate-200 uppercase tracking-wide">
              Active Station Assignments
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {totalAssignedStations} Active • {sortedStations.length - totalAssignedStations} Empty
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {sortedStations.map((stationName) => {
            const pumpsOnStation = getPumpsForStation(stationName);
            const currentPump = pumpsOnStation[0] || null;

            return (
              <div
                key={stationName}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 shadow-xs flex flex-col justify-between"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    <span className="font-black text-sm sm:text-base text-slate-100 uppercase">
                      {stationName}
                    </span>
                  </div>

                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                      currentPump
                        ? 'bg-emerald-950/80 border border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-900 border border-slate-800 text-slate-500'
                    }`}
                  >
                    {currentPump ? 'ACTIVE' : 'EMPTY'}
                  </span>
                </div>

                {/* Current Pump Assigned */}
                <div className="py-1">
                  {currentPump ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            Current Pump
                          </span>
                          <span className="font-mono font-black text-base text-slate-100">
                            {currentPump}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Change Pump Button */}
                        <button
                          type="button"
                          onClick={() => handleStartSwap(stationName, currentPump)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 text-amber-300 border border-slate-700 hover:border-amber-400/50 rounded-lg text-xs font-black uppercase transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                          title={`Change pump on ${stationName}`}
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          <span>CHANGE</span>
                        </button>

                        {/* Remove from Station */}
                        <button
                          type="button"
                          onClick={() => handleRemoveFromStation(stationName, currentPump)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-700/60 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          title={`Remove ${currentPump} from ${stationName}`}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900 border border-dashed border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="text-xs text-slate-500 font-mono italic">
                        No pump assigned
                      </div>

                      {/* Dropdown to assign from inventory */}
                      {fleet.pumps.length > 0 ? (
                        <div className="w-full sm:w-auto">
                          <select
                            value=""
                            onChange={(e) => handleAttemptAssign(stationName, e.target.value)}
                            className="w-full sm:w-auto bg-slate-950 border border-amber-500/30 hover:border-amber-400 text-amber-300 rounded-lg px-3 py-1.5 text-xs font-mono font-bold uppercase cursor-pointer focus:outline-none"
                          >
                            <option value="">+ ASSIGN PUMP...</option>
                            {fleet.pumps.map((p) => {
                              const assignedTo = getStationForPump(p);
                              return (
                                <option key={p} value={p}>
                                  {p} {assignedTo ? `(on ${assignedTo})` : '• Standby'}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          Add pumps in Pump Inventory first.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. CONFLICT MODAL: Prevent Accidental Duplicate Active Station Assignments */}
      {conflictModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-black text-lg text-slate-100 uppercase">
                Pump Already Assigned
              </h3>
            </div>
            <p className="text-sm text-slate-300">
              <strong>{conflictModal.pump}</strong> is currently assigned to <strong>{conflictModal.currentStation}</strong>.
            </p>
            <p className="text-xs text-slate-400">
              One physical pump can only be actively assigned to one station at a time. Do you want to move it?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConflictModal(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={confirmMovePump}
                className="min-h-[44px] px-5 py-2 text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors cursor-pointer"
              >
                MOVE TO {conflictModal.targetStation.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. SWAP PUMP MODAL */}
      {swapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <ArrowLeftRight className="w-6 h-6 shrink-0" />
              <h3 className="font-black text-lg text-slate-100 uppercase">
                Swap Pump on {swapModal.station}
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-0.5">Current Pump:</span>
                <span className="font-mono font-black text-sm text-slate-100">
                  {swapModal.currentPump}
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1 uppercase">
                  Choose Replacement Pump:
                </label>
                <select
                  value={swapModal.replacementPump}
                  onChange={(e) =>
                    setSwapModal((prev) => (prev ? { ...prev, replacementPump: e.target.value } : null))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-100 focus:outline-none focus:border-amber-400 uppercase cursor-pointer"
                >
                  {fleet.pumps
                    .filter((p) => p !== swapModal.currentPump)
                    .map((p) => {
                      const curSt = getStationForPump(p);
                      return (
                        <option key={p} value={p}>
                          {p} {curSt ? `(currently on ${curSt})` : '• Standby'}
                        </option>
                      );
                    })}
                </select>
              </div>

              <p className="text-[11px] text-slate-400">
                Move <strong>{swapModal.replacementPump}</strong> to <strong>{swapModal.station}</strong>? Earlier days' historical records will remain untouched.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSwapModal(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={!swapModal.replacementPump}
                onClick={confirmSwap}
                className="min-h-[44px] px-5 py-2 text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors cursor-pointer"
              >
                CONFIRM SWAP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. CONFIRM DELETE PUMP FROM FLEET MODAL */}
      {deletePumpTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-lg text-slate-100">
                Delete {deletePumpTarget}?
              </h3>
            </div>
            <p className="text-sm text-slate-300">
              This will remove <strong>{deletePumpTarget}</strong> from location inventory and active lineup. Past hour records stay safe in history.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                onClick={() => setDeletePumpTarget(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePumpFromFleet}
                className="min-h-[44px] px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Pump</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
