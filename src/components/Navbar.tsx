import React, { useState } from 'react';
import { useFleet } from '../context/FleetContext';
import {
  Wrench,
  Wifi,
  WifiOff,
  RefreshCw,
  Sliders,
  Calendar,
  Printer,
  Home,
  UserCheck,
  CheckCircle2,
  FileSpreadsheet,
  Edit3,
  Boxes,
  MoreHorizontal,
  X,
  ChevronRight,
  Flame,
  Activity,
  HardHat,
} from 'lucide-react';

export type ActiveTab =
  | 'home'
  | 'entry'
  | 'ops'
  | 'mechanics'
  | 'lineup'
  | 'inventory'
  | 'history'
  | 'print';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
}) => {
  const {
    syncStatus,
    queuedCount,
    syncErrors,
    retrySyncErrors,
    flushQueue,
    technicianName,
    setTechnicianName,
  } = useFleet();

  const [isEditingTech, setIsEditingTech] = useState(false);
  const [techInput, setTechInput] = useState(technicianName || '');
  const [flushing, setFlushing] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSyncErrorDetails, setShowSyncErrorDetails] = useState(false);

  const handleManualFlush = async () => {
    setFlushing(true);
    await flushQueue();
    setFlushing(false);
  };

  const handleRetryErrors = async () => {
    setFlushing(true);
    await retrySyncErrors();
    setFlushing(false);
  };

  const handleSaveTech = (e: React.FormEvent) => {
    e.preventDefault();
    if (techInput.trim()) {
      setTechnicianName(techInput.trim());
    }
    setIsEditingTech(false);
  };

  return (
    <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-40 print:hidden select-none">
      {/* Top Bar */}
      <div className="max-w-6xl mx-auto px-4 py-2.5 sm:py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
        {/* Logo and Brand */}
        <div className="flex items-center gap-2.5">
          <div className="bg-amber-500 text-slate-950 font-black p-2 rounded-xl flex items-center justify-center shadow-md shadow-amber-500/10">
            <Wrench className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-wider text-slate-100 uppercase">
              FLEET 1 PUMP HOURS
            </h1>
            <p className="text-[11px] text-slate-400 font-mono hidden sm:block">
              Digital Frac Spread Clipboard • Real-Time Sync
            </p>
          </div>
        </div>

        {/* Sync Status & Technician info */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Obvious Offline / Sync Status Indicator */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold border transition-colors select-none ${
              syncStatus === 'live' && queuedCount === 0
                ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                : syncStatus === 'live' && queuedCount > 0
                ? 'bg-amber-950/60 border-amber-500/30 text-amber-300'
                : 'bg-rose-950/60 border-rose-500/30 text-rose-300'
            }`}
            title={
              syncStatus === 'live'
                ? queuedCount === 0
                  ? 'All readings synced with cloud'
                  : `${queuedCount} readings syncing...`
                : `${queuedCount} readings queued offline`
            }
          >
            {syncStatus === 'live' && queuedCount === 0 && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>LIVE ✓</span>
              </>
            )}
            {syncStatus === 'live' && queuedCount > 0 && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>SYNCING ({queuedCount})</span>
              </>
            )}
            {syncStatus !== 'live' && (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>OFFLINE ({queuedCount} QUEUED)</span>
              </>
            )}
          </div>

          {/* Sync Errors Report Indicator */}
          {syncErrors.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSyncErrorDetails(!showSyncErrorDetails)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-rose-950 text-rose-300 border border-rose-500/50 rounded-lg hover:bg-rose-900 transition-colors animate-pulse cursor-pointer shadow-sm shadow-rose-900/30"
                title={`${syncErrors.length} writes failed to sync. Click to inspect & retry.`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>SYNC ERROR ({syncErrors.length})</span>
              </button>

              {showSyncErrorDetails && (
                <div className="fixed inset-x-4 top-16 sm:absolute sm:right-0 sm:left-auto sm:top-full sm:mt-2 sm:w-96 bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl z-50 text-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Sync Error Report
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSyncErrorDetails(false)}
                      className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Failed writes remain preserved and recoverable in local storage. They are never discarded.
                  </p>

                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
                    {syncErrors.map((err) => (
                      <div key={err.id} className="p-2 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="truncate max-w-[180px]">{err.path}</span>
                          <span>Retries: {err.retryCount}</span>
                        </div>
                        <div className="text-rose-300 text-[11px] break-words">{err.error}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={handleRetryErrors}
                      disabled={flushing}
                      className="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${flushing ? 'animate-spin' : ''}`} />
                      <span>Retry All Failed Writes</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Queued Flush Button */}
          {queuedCount > 0 && (
            <button
              onClick={handleManualFlush}
              disabled={flushing}
              className="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors animate-pulse cursor-pointer"
              title="Push queued reads now"
            >
              <RefreshCw className={`w-3 h-3 ${flushing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          )}

          {/* Technician identifier toggle: "Logging as Joe [ Change ]" */}
          <div className="relative">
            <button
              onClick={() => {
                setTechInput(technicianName || '');
                setIsEditingTech(!isEditingTech);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-200 transition-colors cursor-pointer"
              title="Logged in technician"
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              <span className="max-w-[80px] sm:max-w-[120px] truncate">
                {technicianName ? `Logging as ${technicianName}` : 'Set Name'}
              </span>
              <span className="text-[10px] text-amber-400 underline ml-0.5">Change</span>
            </button>

            {isEditingTech && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl z-50">
                <form onSubmit={handleSaveTech} className="space-y-2">
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-300">
                    Who is entering hours?
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={techInput}
                    onChange={(e) => setTechInput(e.target.value)}
                    placeholder="e.g. Joe, Chuck O., Tech 1"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                    maxLength={50}
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingTech(false)}
                      className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg cursor-pointer"
                    >
                      Save Name
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <nav className="border-t border-slate-900 bg-slate-950/80">
        <div className="max-w-6xl mx-auto px-2 flex items-center justify-between">
          {/* MOBILE NAVIGATION: 3 PROMINENT ACTIONS (ENTER HOURS, PUMP OPS, MECHANICS) + MORE */}
          <div className="flex sm:hidden items-center gap-1 p-1.5 w-full fixed bottom-0 inset-x-0 bg-slate-950 border-t border-slate-800 mobile-bottom-nav">
            <button onClick={() => { setShowMoreMenu(false); onTabChange('home'); }}
              className={`flex-1 min-h-[48px] rounded-xl text-[10px] font-black flex flex-col items-center justify-center gap-1 ${activeTab === 'home' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'}`}>
              <Home className="w-4 h-4" /><span>HOME</span>
            </button>
            <button
              onClick={() => {
                setShowMoreMenu(false);
                onTabChange('entry');
              }}
              className={`flex-1 min-h-[44px] px-1 py-2 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-wider flex flex-col sm:flex-row items-center justify-center gap-1 transition-all cursor-pointer ${
                activeTab === 'entry'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white bg-slate-900/60'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" />
              <span>HOURS</span>
            </button>

            <button
              onClick={() => {
                setShowMoreMenu(false);
                onTabChange('ops');
              }}
              className={`flex-1 min-h-[44px] px-1 py-2 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-wider flex flex-col sm:flex-row items-center justify-center gap-1 transition-all cursor-pointer ${
                activeTab === 'ops'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white bg-slate-900/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <span>PUMP OPS</span>
            </button>

            <button
              onClick={() => {
                setShowMoreMenu(false);
                onTabChange('mechanics');
              }}
              className={`flex-1 min-h-[44px] px-1 py-2 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-wider flex flex-col sm:flex-row items-center justify-center gap-1 transition-all cursor-pointer ${
                activeTab === 'mechanics'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white bg-slate-900/60'
              }`}
            >
              <HardHat className="w-3.5 h-3.5 shrink-0" />
              <span>MECHANICS</span>
            </button>

            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={`flex-1 min-h-[48px] px-1 py-2 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-wider flex flex-col sm:flex-row items-center justify-center gap-1 transition-all cursor-pointer ${
                ['lineup', 'inventory', 'history', 'print'].includes(activeTab) || showMoreMenu
                  ? 'bg-slate-800 text-amber-400 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white bg-slate-900/60'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              <span>MORE</span>
            </button>
          </div>

          {/* DESKTOP NAVIGATION: ALL TABS VISIBLE */}
          <div className="hidden sm:flex items-center gap-1 py-1 w-auto">
            <button
              onClick={() => onTabChange('home')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Today's Hours</span>
            </button>

            <button
              onClick={() => onTabChange('entry')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'entry'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              <span>Enter Hours</span>
            </button>

            <button
              onClick={() => onTabChange('ops')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'ops'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Pump Ops</span>
            </button>

            <button
              onClick={() => onTabChange('mechanics')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'mechanics'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <HardHat className="w-4 h-4" />
              <span>Mechanics</span>
            </button>

            <button
              onClick={() => onTabChange('lineup')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'lineup'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Pump Lineup</span>
            </button>

            <button
              onClick={() => onTabChange('inventory')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Pump Inventory</span>
            </button>

            <button
              onClick={() => onTabChange('history')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>History</span>
            </button>

            <button
              onClick={() => onTabChange('print')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'print'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>
      </nav>

      {/* MOBILE MORE MENU SHEET */}
      {showMoreMenu && (
        <div className="sm:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 space-y-4 shadow-2xl mobile-more-sheet animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs uppercase font-mono font-bold text-amber-400 block">
                  MORE OPTIONS
                </span>
                <span className="text-base font-black text-slate-100">
                  Spread &amp; Records Management
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreMenu(false)}
                className="w-9 h-9 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onTabChange('lineup');
                }}
                className={`w-full min-h-[54px] p-3.5 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer ${
                  activeTab === 'lineup'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${activeTab === 'lineup' ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-500/10 text-amber-400'}`}>
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black">Pump Lineup</div>
                    <div className={`text-xs ${activeTab === 'lineup' ? 'text-slate-900/80' : 'text-slate-400'}`}>
                      Spread station assignments &amp; positions
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-60" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onTabChange('inventory');
                }}
                className={`w-full min-h-[54px] p-3.5 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer ${
                  activeTab === 'inventory'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${activeTab === 'inventory' ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-500/10 text-amber-400'}`}>
                    <Boxes className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black">Pump Inventory</div>
                    <div className={`text-xs ${activeTab === 'inventory' ? 'text-slate-900/80' : 'text-slate-400'}`}>
                      All physical pumps on location &amp; standby
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-60" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onTabChange('history');
                }}
                className={`w-full min-h-[54px] p-3.5 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${activeTab === 'history' ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-500/10 text-amber-400'}`}>
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black">History</div>
                    <div className={`text-xs ${activeTab === 'history' ? 'text-slate-900/80' : 'text-slate-400'}`}>
                      Previous daily pump hour sheets &amp; logs
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-60" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onTabChange('print');
                }}
                className={`w-full min-h-[54px] p-3.5 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer ${
                  activeTab === 'print'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${activeTab === 'print' ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-500/10 text-amber-400'}`}>
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black">Print Sheet</div>
                    <div className={`text-xs ${activeTab === 'print' ? 'text-slate-900/80' : 'text-slate-400'}`}>
                      Office print report &amp; CSV export
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-60" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
