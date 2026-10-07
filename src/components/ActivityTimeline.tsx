import React, { useState, useEffect, useMemo } from 'react';
import type { PumpOpsEvent, ShiftType } from '../types';
import {
  History,
  AlertTriangle,
  Wrench,
  Check,
  ArrowLeftRight,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronRight,
  Clock,
  Search,
  Filter,
  Calendar,
  X,
  ClipboardCheck,
  Edit2,
} from 'lucide-react';

interface ActivityTimelineProps {
  events: PumpOpsEvent[];
  onSelectPumpHistory?: (pump: string) => void;
  onEditSpotCheck?: (event: PumpOpsEvent) => void;
  onViewSpotCheckDetail?: (event: PumpOpsEvent) => void;
  onViewSpotCheck?: (event: PumpOpsEvent) => void;
}

/**
 * Returns YYYY-MM-DD in user's local jobsite time
 */
export function getLocalEventDate(ev: PumpOpsEvent): string {
  const ts = ev.startedAt || ev.createdAt;
  if (ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return ev.date || 'unknown';
}

/**
 * Returns today's YYYY-MM-DD in local time
 */
export function getLocalTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Formats a YYYY-MM-DD date string into friendly title
 * e.g. "OCTOBER 6, 2026"
 */
export function formatFriendlyDateHeader(dateStr: string, isToday: boolean): string {
  const parts = dateStr.split('-');
  let formatted = dateStr;
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    formatted = d.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (isToday) {
    return `TODAY — ${formatted.toUpperCase()}`;
  }
  return formatted.toUpperCase();
}

/**
 * Format total minutes to compact string: "1h 42m" or "35m"
 */
function formatMinutes(totalMins: number): string {
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

interface DateGroupSummary {
  dateKey: string;
  isToday: boolean;
  events: PumpOpsEvent[];
  totalEvents: number;
  downCount: number;
  repairCount: number;
  deratedCount: number;
  swapCount: number;
  watchCount: number;
  totalDowntimeMinutes: number;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  events,
  onSelectPumpHistory,
  onEditSpotCheck,
  onViewSpotCheckDetail,
  onViewSpotCheck,
}) => {
  const handleViewSpotCheck = onViewSpotCheck || onViewSpotCheckDetail;
  // Midnight rollover watcher: checks local date every 15 seconds
  const [localToday, setLocalToday] = useState<string>(getLocalTodayStr);

  useEffect(() => {
    const checkTimer = setInterval(() => {
      const nowToday = getLocalTodayStr();
      setLocalToday((prev) => (prev !== nowToday ? nowToday : prev));
    }, 15000);
    return () => clearInterval(checkTimer);
  }, []);

  // Remember manual date expand/collapse toggles during the session
  const [userToggledDates, setUserToggledDates] = useState<Record<string, boolean>>({});

  useEffect(() => { setUserToggledDates({}); }, [localToday]);

  // Optional search / filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'down' | 'repair' | 'swaps' | 'watch' | 'spot_check'>('all');

  // Check if a specific date is currently expanded
  const isDateExpanded = (dateKey: string) => {
    if (userToggledDates[dateKey] !== undefined) {
      return userToggledDates[dateKey];
    }
    // Only TODAY is expanded by default; previous days are collapsed
    return dateKey === localToday;
  };

  const handleToggleDate = (dateKey: string) => {
    setUserToggledDates((prev) => ({
      ...prev,
      [dateKey]: !isDateExpanded(dateKey),
    }));
  };

  const handleExpandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    dateGroups.forEach((g) => {
      allExpanded[g.dateKey] = true;
    });
    setUserToggledDates(allExpanded);
  };

  const handleCollapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    dateGroups.forEach((g) => {
      allCollapsed[g.dateKey] = false;
    });
    setUserToggledDates(allCollapsed);
  };

  // Filter events by search query & type filter
  const filteredEvents = useMemo(() => {
    let list = events;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((ev) => {
        const pMatch = (ev.pump || '').toLowerCase().includes(q);
        const stMatch = (ev.station || '').toLowerCase().includes(q);
        const compMatch = (ev.component || '').toLowerCase().includes(q);
        const catMatch = (ev.category || '').toLowerCase().includes(q);
        const notesMatch = (ev.notes || '').toLowerCase().includes(q);
        const spotCheckMatch = ev.eventType === 'spot_check' && (
          'spot check'.includes(q) ||
          'valves & seats'.includes(q) ||
          'valves'.includes(q) ||
          'seats'.includes(q) ||
          (ev.checks && ev.checks.some((c) => c.condition.toLowerCase().includes(q) || (c.part && c.part.toLowerCase().includes(q))))
        );
        return pMatch || stMatch || compMatch || catMatch || notesMatch || spotCheckMatch;
      });
    }

    if (typeFilter !== 'all') {
      list = list.filter((ev) => {
        if (typeFilter === 'down') return ev.eventType === 'pump_down' || ev.status === 'DOWN';
        if (typeFilter === 'repair') return ev.eventType === 'repair_started' || ev.status === 'REPAIRING';
        if (typeFilter === 'swaps') return ev.eventType === 'pump_swap';
        if (typeFilter === 'watch') return ev.eventType === 'watch_item' || ev.watchNextShift;
        if (typeFilter === 'spot_check') return ev.eventType === 'spot_check';
        return true;
      });
    }

    return list;
  }, [events, searchQuery, typeFilter]);

  // Group events by local calendar date (newest calendar date first)
  const dateGroups: DateGroupSummary[] = useMemo(() => {
    const map = new Map<string, PumpOpsEvent[]>();

    filteredEvents.forEach((ev) => {
      const dateKey = getLocalEventDate(ev);
      const list = map.get(dateKey) || [];
      list.push(ev);
      map.set(dateKey, list);
    });

    // Make sure today's date group always exists if we have today events or as anchor
    if (!map.has(localToday) && !searchQuery && typeFilter === 'all') {
      map.set(localToday, []);
    }

    // Sort date keys descending (newest date first)
    const sortedKeys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    return sortedKeys.map((dateKey) => {
      // Sort events inside each date chronologically (newest first)
      const groupEvents = (map.get(dateKey) || []).sort(
        (a, b) => b.startedAt - a.startedAt
      );

      const downCount = groupEvents.filter(
        (e) => e.eventType === 'pump_down' || e.status === 'DOWN'
      ).length;
      const repairCount = groupEvents.filter(
        (e) => e.eventType === 'repair_started' || e.status === 'REPAIRING'
      ).length;
      const deratedCount = groupEvents.filter(
        (e) => e.eventType === 'derated' || e.status === 'DERATED'
      ).length;
      const swapCount = groupEvents.filter((e) => e.eventType === 'pump_swap').length;
      const watchCount = groupEvents.filter(
        (e) => e.eventType === 'watch_item' || e.watchNextShift
      ).length;

      // Calculate reliable total downtime from returned_to_service events on this date
      const returnEvents = groupEvents.filter(
        (e) =>
          e.eventType === 'returned_to_service' &&
          typeof e.downtimeMinutes === 'number' &&
          e.downtimeMinutes > 0
      );
      const totalDowntimeMinutes = returnEvents.reduce(
        (sum, e) => sum + (e.downtimeMinutes || 0),
        0
      );

      return {
        dateKey,
        isToday: dateKey === localToday,
        events: groupEvents,
        totalEvents: groupEvents.length,
        downCount,
        repairCount,
        deratedCount,
        swapCount,
        watchCount,
        totalDowntimeMinutes,
      };
    });
  }, [filteredEvents, localToday, searchQuery, typeFilter]);

  return (
    <div className="space-y-4">
      {/* ========================================================================= */}
      {/* 1. TIMELINE CONTROLS BAR: SEARCH & QUICK FILTER PILLS                     */}
      {/* ========================================================================= */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search activity by pump, station, issue, notes..."
              className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Accordion Toggles */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs font-mono">
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-mono font-bold text-slate-500 uppercase flex items-center gap-1 mr-1">
            <Filter className="w-3 h-3" />
            <span>Filter:</span>
          </span>
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              typeFilter === 'all'
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All Events ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('down')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              typeFilter === 'down'
                ? 'bg-rose-500 text-slate-950 font-black'
                : 'bg-slate-900 text-rose-400 hover:text-white border border-slate-800'
            }`}
          >
            Down Events
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('repair')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              typeFilter === 'repair'
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'bg-slate-900 text-amber-300 hover:text-white border border-slate-800'
            }`}
          >
            Repairs
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('swaps')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              typeFilter === 'swaps'
                ? 'bg-indigo-500 text-white font-black'
                : 'bg-slate-900 text-indigo-300 hover:text-white border border-slate-800'
            }`}
          >
            Pump Swaps
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('watch')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              typeFilter === 'watch'
                ? 'bg-blue-500 text-white font-black'
                : 'bg-slate-900 text-blue-300 hover:text-white border border-slate-800'
            }`}
          >
            Watch Items
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('spot_check')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              typeFilter === 'spot_check'
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'bg-slate-900 text-amber-400 hover:text-white border border-slate-800'
            }`}
          >
            Spot Checks
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DATE ACCORDIONS LIST                                                    */}
      {/* ========================================================================= */}
      {dateGroups.length === 0 ? (
        <div className="bg-slate-950 border border-dashed border-slate-800 rounded-2xl p-8 text-center space-y-2">
          <History className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-300">
            No operational events match your filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setTypeFilter('all');
            }}
            className="text-xs text-amber-400 underline font-bold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {dateGroups.map((group) => {
            const expanded = isDateExpanded(group.dateKey);
            const title = formatFriendlyDateHeader(group.dateKey, group.isToday);

            return (
              <div
                key={group.dateKey}
                className={`border rounded-2xl transition-all overflow-hidden ${
                  group.isToday
                    ? 'bg-slate-900/90 border-slate-700 shadow-xl'
                    : 'bg-slate-900/50 border-slate-800/80 shadow-md'
                }`}
              >
                {/* =============================================================== */}
                {/* ACCORDION HEADER (LARGE TAP TARGET FOR MOBILE & DESKTOP)        */}
                {/* =============================================================== */}
                <button
                  type="button"
                  onClick={() => handleToggleDate(group.dateKey)}
                  className={`w-full p-4 sm:p-4.5 text-left transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none ${
                    group.isToday
                      ? 'bg-slate-900 hover:bg-slate-850'
                      : 'hover:bg-slate-850/80'
                  }`}
                  aria-expanded={expanded}
                >
                  {/* Left: Date Title & Today Badge */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                        group.isToday
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'bg-slate-800/80 border-slate-700 text-slate-400'
                      }`}
                    >
                      <Calendar className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm sm:text-base font-black tracking-tight text-slate-100 uppercase">
                          {title}
                        </span>
                        {group.isToday && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black uppercase bg-amber-500 text-slate-950 shadow-xs">
                            TODAY
                          </span>
                        )}
                      </div>

                      {/* Summary Metrics (shown only when non-zero) */}
                      <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-slate-400 mt-0.5">
                        <span className="font-bold text-slate-300">
                          {group.totalEvents} {group.totalEvents === 1 ? 'EVENT' : 'EVENTS'}
                        </span>

                        {group.downCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-rose-400 font-bold">
                              {group.downCount} DOWN
                            </span>
                          </>
                        )}

                        {group.repairCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400 font-bold">
                              {group.repairCount} REPAIR
                            </span>
                          </>
                        )}

                        {group.deratedCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-orange-400 font-bold">
                              {group.deratedCount} DERATED
                            </span>
                          </>
                        )}

                        {group.swapCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-400 font-bold">
                              {group.swapCount} {group.swapCount === 1 ? 'SWAP' : 'SWAPS'}
                            </span>
                          </>
                        )}

                        {group.watchCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-blue-400 font-bold">
                              {group.watchCount} WATCH
                            </span>
                          </>
                        )}

                        {/* Optional reliable total downtime */}
                        {group.totalDowntimeMinutes > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400 font-bold">
                              Downtime: {formatMinutes(group.totalDowntimeMinutes)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Expand / Collapse Pill & Chevron */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                    <span
                      className={`text-[11px] font-mono font-bold uppercase px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                        expanded
                          ? 'bg-slate-800 text-slate-200 border-slate-700'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <span>{expanded ? 'COLLAPSE' : 'EXPAND'}</span>
                      {expanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                      )}
                    </span>
                  </div>
                </button>

                {/* =============================================================== */}
                {/* EXPANDED CONTENT: EVENTS LIST FOR THIS DATE                     */}
                {/* Performance safeguard: only rendered into DOM when expanded!  */}
                {/* =============================================================== */}
                {expanded && (
                  <div className="border-t border-slate-800 p-4 sm:p-5 bg-slate-950/60">
                    {group.events.length === 0 ? (
                      <div className="py-6 text-center text-xs font-mono text-slate-500">
                        No events logged for this date yet.
                      </div>
                    ) : (
                      <div className="space-y-3 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-800">
                        {group.events.map((ev) => {
                          const isDown = ev.eventType === 'pump_down';
                          const isRepair = ev.eventType === 'repair_started';
                          const isReturn = ev.eventType === 'returned_to_service';
                          const isSwap = ev.eventType === 'pump_swap';
                          const isDerated = ev.eventType === 'derated';
                          const isWatch = ev.eventType === 'watch_item';
                          const isSpotCheck = ev.eventType === 'spot_check';

                          const timeStr = new Date(ev.startedAt || ev.createdAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          });

                          return (
                            <div key={ev.id} className="relative flex items-start gap-3.5 pl-1.5">
                              {/* Timeline Node Badge */}
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border shadow-md ${
                                  isSpotCheck
                                    ? 'bg-amber-500 border-amber-400 text-slate-950'
                                    : isDown
                                    ? 'bg-rose-500 border-rose-400 text-slate-950'
                                    : isRepair
                                    ? 'bg-amber-500 border-amber-400 text-slate-950'
                                    : isReturn
                                    ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                    : isSwap
                                    ? 'bg-indigo-500 border-indigo-400 text-white'
                                    : isDerated
                                    ? 'bg-orange-500 border-orange-400 text-slate-950'
                                    : 'bg-blue-500 border-blue-400 text-white'
                                }`}
                              >
                                {isSpotCheck ? (
                                  <ClipboardCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                                ) : isDown ? (
                                  <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                                ) : isRepair ? (
                                  <Wrench className="w-3.5 h-3.5 stroke-[2.5]" />
                                ) : isReturn ? (
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                ) : isSwap ? (
                                  <ArrowLeftRight className="w-3.5 h-3.5 stroke-[2.5]" />
                                ) : isDerated ? (
                                  <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                                )}
                              </div>

                              {/* Timeline Event Card */}
                              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-1.5 shadow-sm">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {/* Timestamp & Shift Label */}
                                      <span className="font-mono text-xs font-bold text-slate-400">
                                        {timeStr}
                                      </span>
                                      <span className="text-[10px] font-mono font-black uppercase px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-amber-400/90">
                                        {ev.shift === 'night' ? 'NIGHT SHIFT' : 'DAY SHIFT'}
                                      </span>
                                      <span className="font-mono font-black text-sm text-slate-100">
                                        Pump {ev.pump}
                                        {ev.station ? ` / ${ev.station}` : ''}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {ev._pendingSync && (
                                      <span
                                        className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse"
                                        title="Direct write pending, stored in offline queue"
                                      >
                                        <Clock className="w-2.5 h-2.5 text-amber-400" />
                                        <span>SYNC PENDING</span>
                                      </span>
                                    )}

                                    <span
                                      className={`text-[10px] font-mono font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                                        isSpotCheck
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                          : isDown
                                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                          : isRepair
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                          : isReturn
                                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                          : isSwap
                                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                          : isDerated
                                          ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                      }`}
                                    >
                                      {isSpotCheck
                                        ? 'V&S SPOT CHECK'
                                        : isSwap
                                        ? 'PUMP SWAP'
                                        : isReturn
                                        ? 'RETURNED TO SERVICE'
                                        : ev.status}
                                    </span>
                                  </div>
                                </div>

                                {/* Event description */}
                                {isSpotCheck ? (
                                  <div className="space-y-1.5 pt-1">
                                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                                      {ev.checks?.map((c) => (
                                        <span
                                          key={c.hole}
                                          className={`px-2 py-0.5 rounded border ${
                                            c.condition === 'GOOD'
                                              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 font-bold'
                                              : c.condition === 'WATCH'
                                              ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-300 font-bold'
                                              : 'bg-rose-950/40 border-rose-500/30 text-rose-300 font-black'
                                          }`}
                                        >
                                          H{c.hole} {c.condition}{c.part ? ` — ${c.part}` : ''}
                                        </span>
                                      ))}
                                    </div>
                                    {ev.notes && (
                                      <div className="text-xs text-slate-300 italic font-mono">
                                        "{ev.notes}"
                                      </div>
                                    )}
                                    <div className="pt-1 flex items-center justify-end gap-2 flex-wrap">
                                      {handleViewSpotCheck && (
                                        <button
                                          type="button"
                                          onClick={() => handleViewSpotCheck(ev)}
                                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1"
                                        >
                                          <ClipboardCheck className="w-3 h-3 text-amber-400" />
                                          <span>VIEW DETAILS</span>
                                        </button>
                                      )}
                                      {onEditSpotCheck && (
                                        <button
                                          type="button"
                                          onClick={() => onEditSpotCheck(ev)}
                                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1"
                                        >
                                          <Edit2 className="w-3 h-3 text-amber-400" />
                                          <span>EDIT SPOT CHECK</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ) : isSwap ? (
                                  <div className="text-xs font-mono font-bold text-indigo-300">
                                    {ev.station}: Pump {ev.replacedPump} → Pump {ev.pump}
                                  </div>
                                ) : (
                                  <div className="text-xs font-bold text-slate-200">
                                    {ev.category} {ev.component ? `— ${ev.component}` : ''}
                                    {ev.holes && ev.holes.length > 0 && (
                                      <span className="text-amber-400 ml-1 font-mono">
                                        (Hole {ev.holes.join(', ')})
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Limitation if derated */}
                                {ev.limitation && (
                                  <div className="text-xs font-mono font-bold text-orange-300">
                                    Limit: {ev.limitation}
                                  </div>
                                )}

                                {/* Return to service downtime badge */}
                                {isReturn &&
                                  ev.downtimeMinutes !== null &&
                                  ev.downtimeMinutes !== undefined && (
                                    <div className="text-xs font-mono font-bold text-emerald-400">
                                      Total Downtime: {ev.downtimeMinutes} min
                                    </div>
                                  )}

                                {ev.notes && (
                                  <div className="text-xs text-slate-400 italic font-sans">
                                    "{ev.notes}"
                                  </div>
                                )}

                                <div className="text-[10px] font-mono text-slate-500 pt-0.5 flex items-center justify-between">
                                  <span>Logged by: {ev.operator}</span>
                                  {onSelectPumpHistory && (
                                    <button
                                      type="button"
                                      onClick={() => onSelectPumpHistory(ev.pump)}
                                      className="hover:text-amber-400 underline cursor-pointer"
                                    >
                                      All Pump {ev.pump} events →
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
