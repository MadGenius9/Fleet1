import React, { useState, useMemo } from 'react';
import { useFleet, sortStations, extractStationNumber } from '../context/FleetContext';
import {
  Boxes,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Sliders,
  MapPin,
  Clock,
  ArrowLeftRight,
  LogOut,
  Edit3,
  Search,
  X
} from 'lucide-react';

interface InventoryViewProps {
  onGoToLineup?: () => void;
  onGoToEntry?: (section?: 'lineup' | 'standby' | 'all', pump?: string) => void;
}

// Natural numeric sorting for pump numbers (e.g. 121, 137, 145, 171...)
function sortPumpList(pumps: string[]): string[] {
  return [...pumps].sort((a, b) => {
    const numA = (a.match(/\d+/) ? parseInt(a.match(/\d+/)![0], 10) : 999999);
    const numB = (b.match(/\d+/) ? parseInt(b.match(/\d+/)![0], 10) : 999999);
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  onGoToLineup,
  onGoToEntry
}) => {
  const {
    fleet,
    addPumpToDirectory,
    assignPumpToStation,
    removePumpFromStation,
    deletePumpFromFleet,
    getStationForPump,
    getPumpsForStation
  } = useFleet();

  // Add Pump State
  const [newPumpInput, setNewPumpInput] = useState('');
  const [addMode, setAddMode] = useState<'single' | 'multiple'>('single');
  const [searchTerm, setSearchTerm] = useState('');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Assign Standby Pump to Station Modal
  const [assignModal, setAssignModal] = useState<{
    pump: string;
    selectedStation: string;
  } | null>(null);

  // Remove / Delete Pump Target Modal
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Move to Standby Confirmation Modal
  const [standbyTarget, setStandbyTarget] = useState<{
    pump: string;
    currentStation: string;
  } | null>(null);

  // Automatically categorize pumps
  const { lineupPumpsWithStation, standbyPumps, totalLineupCount, totalStandbyCount } = useMemo(() => {
    const lineup: { pump: string; station: string }[] = [];
    const standby: string[] = [];

    // Check each pump in inventory
    fleet.pumps.forEach((pump) => {
      const assignedStation = getStationForPump(pump);
      if (assignedStation) {
        lineup.push({ pump, station: assignedStation });
      } else {
        standby.push(pump);
      }
    });

    // Sort lineup by station order (Station 1, Station 2...)
    lineup.sort((a, b) => {
      const stNumA = extractStationNumber(a.station);
      const stNumB = extractStationNumber(b.station);
      if (stNumA !== stNumB) return stNumA - stNumB;
      return a.station.localeCompare(b.station, undefined, { numeric: true });
    });

    // Sort standby naturally by pump number
    const sortedStandby = sortPumpList(standby);

    const term = searchTerm.trim().toLowerCase();
    const filteredLineup = term
      ? lineup.filter(
          (item) =>
            item.pump.toLowerCase().includes(term) ||
            item.station.toLowerCase().includes(term)
        )
      : lineup;

    const filteredStandby = term
      ? sortedStandby.filter((p) => p.toLowerCase().includes(term))
      : sortedStandby;

    return {
      lineupPumpsWithStation: filteredLineup,
      standbyPumps: filteredStandby,
      totalLineupCount: lineup.length,
      totalStandbyCount: sortedStandby.length,
    };
  }, [fleet.pumps, fleet.stationPumps, getStationForPump, searchTerm]);

  const totalPumps = fleet.pumps.length;

  // Handle Add Pump(s) to Inventory
  const handleAddPumps = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');

    const raw = newPumpInput.trim();
    if (!raw) {
      setAddError('Please enter a pump number.');
      return;
    }

    // Support comma or space separated list for quick bulk entry before jobs
    const tokens = raw
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      setAddError('Please enter a valid pump number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const added: string[] = [];
      const skipped: string[] = [];

      for (const token of tokens) {
        const clean = token.trim();
        const exists = fleet.pumps.some((p) => p.toLowerCase() === clean.toLowerCase());
        if (exists) {
          skipped.push(clean);
        } else {
          await addPumpToDirectory(clean);
          added.push(clean);
        }
      }

      if (added.length > 0 && skipped.length === 0) {
        setAddSuccess(
          added.length === 1
            ? `Pump ${added[0]} added to location inventory.`
            : `${added.length} pumps added to location inventory.`
        );
        setNewPumpInput('');
      } else if (added.length > 0 && skipped.length > 0) {
        setAddSuccess(`Added: ${added.join(', ')}. (Already in inventory: ${skipped.join(', ')})`);
        setNewPumpInput('');
      } else {
        setAddError(
          skipped.length === 1
            ? `Pump ${skipped[0]} is already in location inventory.`
            : `Pumps already in inventory: ${skipped.join(', ')}`
        );
      }

      setTimeout(() => {
        setAddSuccess('');
      }, 3500);
    } catch (err) {
      console.error('Error adding pump to inventory:', err);
      setAddError('Failed to add pump. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm moving a lineup pump to standby
  const handleConfirmMoveToStandby = async () => {
    if (!standbyTarget) return;
    try {
      await removePumpFromStation(standbyTarget.currentStation, standbyTarget.pump);
      setStandbyTarget(null);
    } catch (err) {
      console.error('Error moving pump to standby:', err);
    }
  };

  // Open modal to assign standby pump to station
  const handleOpenAssignModal = (pump: string) => {
    // Pick the first empty station if possible, else first station
    const sortedStationsList = sortStations(fleet.stations);
    const firstEmpty = sortedStationsList.find((s) => getPumpsForStation(s).length === 0);
    setAssignModal({
      pump,
      selectedStation: firstEmpty || sortedStationsList[0] || 'Station 1'
    });
  };

  // Confirm assign standby pump to station
  const handleConfirmAssign = async () => {
    if (!assignModal || !assignModal.selectedStation) return;
    try {
      await assignPumpToStation(assignModal.selectedStation, assignModal.pump, true);
      setAssignModal(null);
    } catch (err) {
      console.error('Error assigning pump to station:', err);
    }
  };

  // Confirm delete pump from inventory entirely
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePumpFromFleet(deleteTarget);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Error deleting pump from inventory:', err);
    }
  };

  return (
    <div className="space-y-6 pb-28 max-w-4xl mx-auto">
      {/* 1. TOP HEADER & INVENTORY TOTAL */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-black tracking-widest text-amber-400">
                PUMP INVENTORY
              </span>
              <span className="text-slate-600 font-bold">•</span>
              <span className="text-xs font-mono font-bold text-slate-300">
                FLEET 1 — PUMPS ON LOCATION
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight mt-1">
              Pump Inventory
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Every pump physically present on location. Active spread pumps appear in lineup; remaining units remain on standby.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onGoToLineup && (
              <button
                type="button"
                onClick={onGoToLineup}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>Pump Lineup</span>
              </button>
            )}
            {onGoToEntry && (
              <button
                type="button"
                onClick={() => onGoToEntry()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition-colors cursor-pointer shadow-md shadow-amber-500/20 flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Enter Hours</span>
              </button>
            )}
          </div>
        </div>

        {/* 24 PUMPS ON LOCATION - STATS HERO */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-amber-400 shrink-0">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-mono font-black text-slate-100 tracking-tight">
                {totalPumps} {totalPumps === 1 ? 'PUMP' : 'PUMPS'} ON LOCATION
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                FLEET 1 SPREAD INVENTORY
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="bg-slate-900 border border-emerald-500/30 px-3.5 py-2 rounded-xl text-center">
              <div className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                IN LINEUP
              </div>
              <div className="text-xl font-mono font-black text-slate-100">
                {totalLineupCount}
              </div>
            </div>

            <div className="bg-slate-900 border border-amber-500/30 px-3.5 py-2 rounded-xl text-center">
              <div className="text-xs font-black text-amber-400 uppercase tracking-wider">
                STANDBY
              </div>
              <div className="text-xl font-mono font-black text-slate-100">
                {totalStandbyCount}
              </div>
            </div>
          </div>
        </div>

        {/* SEARCH PUMPS & ADD TOGGLES */}
        <div className="space-y-3 pt-1">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search pumps by number or station..."
              className="w-full min-h-[46px] bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-10 py-2 text-sm font-mono font-bold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAddMode('single');
                setAddError('');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                addMode === 'single'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              + ADD PUMP
            </button>
            <button
              type="button"
              onClick={() => {
                setAddMode('multiple');
                setAddError('');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                addMode === 'multiple'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              ADD MULTIPLE
            </button>
          </div>

          {/* ADD PUMP FORM */}
          <form onSubmit={handleAddPumps} className="space-y-2">
            <label className="block text-xs uppercase tracking-wider font-bold text-slate-300">
              {addMode === 'single' ? 'Pump Number' : 'Enter Multiple Pumps (comma or space separated)'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newPumpInput}
                onChange={(e) => {
                  setNewPumpInput(e.target.value);
                  setAddError('');
                }}
                placeholder={addMode === 'single' ? 'e.g. 187' : 'e.g. 171, 184, 196, 205, 211'}
                className="flex-1 min-h-[48px] bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-base font-mono font-bold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 uppercase"
                maxLength={200}
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[48px] px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md shadow-amber-500/20 active:scale-95"
              >
                <Plus className="w-5 h-5 stroke-[3]" />
                <span>
                  {isSubmitting
                    ? 'Adding...'
                    : addMode === 'single'
                    ? '+ ADD PUMP'
                    : '+ ADD MULTIPLE'}
                </span>
              </button>
            </div>

            {addError && (
              <p className="text-xs text-rose-400 font-bold flex items-center gap-1.5 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{addError}</span>
              </p>
            )}

            {addSuccess && (
              <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{addSuccess}</span>
              </p>
            )}
          </form>
        </div>
      </div>

      {/* SECTION 1: IN LINEUP — {count} */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <h2 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wide">
              IN LINEUP — {lineupPumpsWithStation.length}
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Actively assigned to stations
          </span>
        </div>

        {lineupPumpsWithStation.length === 0 ? (
          <div className="bg-slate-950 border border-dashed border-slate-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-sm font-bold text-slate-400">No pumps currently assigned to stations.</p>
            <p className="text-xs text-slate-500">
              Assign standby pumps below to active stations or configure lineup on the Pump Lineup screen.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lineupPumpsWithStation.map(({ pump, station }) => (
              <div
                key={pump}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-xs transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="font-mono font-black text-lg text-slate-100">
                    {pump}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                      <MapPin className="w-3 h-3" />
                      <span>{station}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStandbyTarget({ pump, currentStation: station })}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                    title={`Move Pump ${pump} to Standby`}
                  >
                    <LogOut className="w-3 h-3" />
                    <span>To Standby</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: STANDBY — {count} */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <h2 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wide">
              STANDBY — {standbyPumps.length}
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            On location • Ready to assign or swap
          </span>
        </div>

        {standbyPumps.length === 0 ? (
          <div className="bg-slate-950 border border-dashed border-slate-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-sm font-bold text-slate-400">No pumps currently on standby.</p>
            <p className="text-xs text-slate-500">
              All {totalPumps} pumps in location inventory are currently assigned to active stations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {standbyPumps.map((pump) => (
              <div
                key={pump}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-xs transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="font-mono font-black text-lg text-slate-100">
                    {pump}
                  </div>
                  <div className="text-[11px] font-mono font-bold text-amber-400 bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 rounded-md inline-block">
                    Standby
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {onGoToEntry && (
                    <button
                      type="button"
                      onClick={() => onGoToEntry('standby', pump)}
                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                      title={`Enter Hours for Standby Pump ${pump}`}
                    >
                      <Edit3 className="w-3 h-3 stroke-[2.5]" />
                      <span>Hours</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenAssignModal(pump)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                    title={`Assign Pump ${pump} to a station`}
                  >
                    <span>Assign</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(pump)}
                    className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
                    title={`Delete Pump ${pump} from inventory`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL 1: MOVE TO STANDBY CONFIRMATION */}
      {standbyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <LogOut className="w-6 h-6 shrink-0" />
              <h3 className="font-black text-lg text-slate-100 uppercase">
                Move Pump {standbyTarget.pump} to Standby?
              </h3>
            </div>
            <p className="text-sm text-slate-300">
              This will unassign <strong>{standbyTarget.pump}</strong> from <strong>{standbyTarget.currentStation}</strong>. The pump will remain in your location inventory under Standby.
            </p>
            <p className="text-xs text-slate-400">
              Historical readings from previous days are safely preserved.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStandbyTarget(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmMoveToStandby}
                className="min-h-[44px] px-5 py-2 text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors cursor-pointer"
              >
                MOVE TO STANDBY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ASSIGN STANDBY PUMP TO STATION */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <MapPin className="w-6 h-6 shrink-0" />
              <h3 className="font-black text-lg text-slate-100 uppercase">
                Assign Pump {assignModal.pump}
              </h3>
            </div>
            <div className="space-y-3 text-xs">
              <label className="block text-slate-300 font-bold uppercase">
                Select Station on Spread:
              </label>
              <select
                value={assignModal.selectedStation}
                onChange={(e) =>
                  setAssignModal((prev) => (prev ? { ...prev, selectedStation: e.target.value } : null))
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-slate-100 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                {sortStations(fleet.stations).map((st) => {
                  const currentPumpOnSt = getPumpsForStation(st)[0];
                  return (
                    <option key={st} value={st}>
                      {st} {currentPumpOnSt ? `(Replace Pump ${currentPumpOnSt})` : '• Empty'}
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-slate-400">
                Pump {assignModal.pump} will move into active lineup at {assignModal.selectedStation}.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAssignModal(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmAssign}
                className="min-h-[44px] px-5 py-2 text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors cursor-pointer"
              >
                CONFIRM ASSIGN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE PUMP FROM INVENTORY CONFIRMATION */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-lg text-slate-100">
                Remove Pump {deleteTarget}?
              </h3>
            </div>
            <p className="text-sm text-slate-300">
              This will remove <strong>Pump {deleteTarget}</strong> from your Fleet 1 location inventory.
            </p>
            <p className="text-xs text-slate-400">
              Historical readings from previous daily sheets remain safely preserved in History.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="min-h-[44px] px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove from Inventory</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
