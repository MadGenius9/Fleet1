import React, { useState, useMemo, useEffect } from 'react';
import { useFleet, sortStations, extractStationNumber } from '../context/FleetContext';
import type { ShiftType, PumpOpsEvent, PumpOpStatus, SpotCheckHoleResult } from '../types';
import { ActiveSpreadIssuesPrintModal } from './ActiveSpreadIssuesPrintModal';
import { ActivityTimeline } from './ActivityTimeline';
import { EditPumpIssueModal } from './EditPumpIssueModal';
import { SpotCheckModal, type LinkedIssueStatus } from './SpotCheckModal';
import { SpotCheckDetailModal } from './SpotCheckDetailModal';
import { formatCompactIssue } from './reports/reportUtils';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wrench,
  Sliders,
  Calendar,
  Sun,
  Moon,
  Plus,
  ArrowRight,
  ArrowLeftRight,
  Eye,
  Check,
  X,
  Printer,
  Mail,
  Lock,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  AlertCircle,
  HelpCircle,
  Layers,
  Sparkles,
  Flame,
  Radio,
  Share2,
  Edit2,
  ClipboardCheck,
} from 'lucide-react';

export type PumpOpsSubTab = 'live' | 'activity' | 'handoff';

interface PumpOpsViewProps {
  onGoToLineup?: () => void;
  onGoToInventory?: () => void;
  onGoToEntry?: () => void;
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
  'OTHER'
];

const FLUID_END_COMPONENTS = [
  'PACKING',
  'D-RINGS',
  'VALVE / SEAT',
  'PLUNGER',
  'LEAK',
  'OTHER'
];

const POWER_END_COMPONENTS = [
  'CROSSHEAD',
  'BEARING',
  'LUBE / OIL PRESSURE',
  'CONNECTING ROD',
  'CRANKSHAFT',
  'OTHER'
];

const ENGINE_COMPONENTS = [
  'COOLANT / OVERHEAT',
  'OIL PRESSURE',
  'ECM / CODES',
  'TURBO / EXHAUST',
  'FUEL FILTER',
  'OTHER'
];

const TRANSMISSION_COMPONENTS = [
  'TORQUE CONVERTER',
  'SLIPPING / CLUTCH',
  'HIGH TEMP',
  'DRIVELINE / U-JOINT',
  'OTHER'
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
  'Running fine now'
];

const SHIFT_NOTE_CHIPS = [
  'Started seeing dirty water late in shift.',
  'Fuel truck expected around 19:00.',
  'Pump standby ready if needed.',
  'Watch discharge pressure on east iron.',
  'Blender feed pressure fluctuating.',
  'All units greased and checked.'
];

export const PumpOpsView: React.FC<PumpOpsViewProps> = ({
  onGoToLineup,
  onGoToInventory,
  onGoToEntry
}) => {
  const {
    fleet,
    todayDateStr,
    activeShift,
    setActiveShift,
    technicianName,
    pumpOpsEvents,
    recordPumpOpEvent,
    updatePumpOpEvent,
    startRepair,
    returnToService,
    markDerated,
    recordWatchItem,
    getPumpCurrentStatus,
    shiftNotes,
    setShiftNotes,
    finalizeShiftHandoff,
    getPumpsForStation,
    swapPumpOnStation,
  } = useFleet();

  const [activeTab, setActiveTab] = useState<PumpOpsSubTab>('live');
  const [date, setDate] = useState<string>(todayDateStr);
  const [shift, setShift] = useState<ShiftType>(activeShift || 'day');

  // Print Active Spread Issues modal state
  const [showPrintIssuesModal, setShowPrintIssuesModal] = useState<boolean>(false);
  const [emailDraftNotice, setEmailDraftNotice] = useState<boolean>(false);

  // Swap Pump Modal state
  const [swapModal, setSwapModal] = useState<{
    station: string;
    currentPump: string;
  } | null>(null);
  const [selectedReplacementPump, setSelectedReplacementPump] = useState<string>('');
  const [customReplacementInput, setCustomReplacementInput] = useState<string>('');
  const [swapNotes, setSwapNotes] = useState<string>('');
  const [isSubmittingSwap, setIsSubmittingSwap] = useState<boolean>(false);

  // Live incoming operator state for handoff
  const [incomingOperator, setIncomingOperator] = useState<string>('');

  // Local shift notes input buffer to prevent lag while typing
  const currentShiftNotesKey = `${date}_${shift}`;
  const [localShiftNotes, setLocalShiftNotes] = useState<string>(
    shiftNotes[currentShiftNotesKey] || ''
  );

  useEffect(() => {
    setLocalShiftNotes(shiftNotes[currentShiftNotesKey] || '');
  }, [currentShiftNotesKey, shiftNotes]);

  // 1. MODAL: PUMP DOWN BOTTOM SHEET
  const [pumpDownModal, setPumpDownModal] = useState<{
    station: string;
    pump: string;
  } | null>(null);

  const [downCategory, setDownCategory] = useState<string>('FLUID END');
  const [downComponent, setDownComponent] = useState<string>('PACKING');
  const [downHoles, setDownHoles] = useState<number[]>([3]);
  const [downNotes, setDownNotes] = useState<string>('');
  const [downWatchNext, setDownWatchNext] = useState<boolean>(false);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // 2. MODAL: DERATE PUMP
  const [derateModal, setDerateModal] = useState<{
    station: string;
    pump: string;
  } | null>(null);
  const [derateReason, setDerateReason] = useState<string>('Packing seep');
  const [derateLimitation, setDerateLimitation] = useState<string>('');
  const [derateNotes, setDerateNotes] = useState<string>('');

  // 3. MODAL: WATCH NEXT SHIFT ITEM
  const [watchModal, setWatchModal] = useState<{
    station: string;
    pump: string;
  } | null>(null);
  const [watchCategory, setWatchCategory] = useState<string>('FLUID END');
  const [watchComponent, setWatchComponent] = useState<string>('PACKING');
  const [watchHoles, setWatchHoles] = useState<number[]>([2]);
  const [watchNotes, setWatchNotes] = useState<string>('Starting to seep but still running.');

  // 4. MODAL: PUMP OPERATIONAL HISTORY
  const [historyModalPump, setHistoryModalPump] = useState<string | null>(null);

  // 5. MODAL: REPAIR NOTE / RETURN CONFIRMATION
  const [actionPromptModal, setActionPromptModal] = useState<{
    type: 'repair' | 'return';
    eventId: string;
    pump: string;
    station: string;
  } | null>(null);
  const [actionPromptNote, setActionPromptNote] = useState<string>('');

  // 6. FINALIZE HANDOFF SUCCESS NOTIFICATION
  const [showFinalizeSuccess, setShowFinalizeSuccess] = useState(false);

  // 7. MODAL: EDIT ISSUE IN PLACE
  const [editIssueModalEvent, setEditIssueModalEvent] = useState<PumpOpsEvent | null>(null);

  // 8. MODAL: SPOT CHECK (VALVES & SEATS)
  const [spotCheckModal, setSpotCheckModal] = useState<{
    station: string;
    pump: string;
    existingEvent?: PumpOpsEvent | null;
  } | null>(null);
  const [selectedSpotCheckDetail, setSelectedSpotCheckDetail] = useState<PumpOpsEvent | null>(null);

  // Filtered operational events for the selected date & shift
  const shiftEvents = useMemo(() => {
    return pumpOpsEvents.filter(
      (ev) => ev.date === date && ev.shift === shift
    ).sort((a, b) => b.startedAt - a.startedAt);
  }, [pumpOpsEvents, date, shift]);

  // Active lineup stations
  const activeStations = useMemo(() => {
    return sortStations(fleet.stations);
  }, [fleet.stations]);

  // Overall list of all unique pumps on location
  const allLocationPumps = useMemo(() => {
    const set = new Set<string>();
    fleet.pumps.forEach((p) => set.add(p.trim()));
    Object.values(fleet.stationPumps || {}).forEach((pList) => {
      if (Array.isArray(pList)) pList.forEach((p) => set.add(p.trim()));
    });
    return Array.from(set).filter(Boolean);
  }, [fleet.pumps, fleet.stationPumps]);

  // Assigned pumps set
  const assignedPumpsSet = useMemo(() => {
    const set = new Set<string>();
    Object.values(fleet.stationPumps || {}).forEach((pList) => {
      if (Array.isArray(pList)) pList.forEach((p) => set.add(p.trim().toLowerCase()));
    });
    return set;
  }, [fleet.stationPumps]);

  // Standby pumps (in inventory, not in lineup)
  const standbyPumps = useMemo(() => {
    return allLocationPumps.filter(
      (p) => !assignedPumpsSet.has(p.trim().toLowerCase())
    );
  }, [allLocationPumps, assignedPumpsSet]);

  // All active (unresolved) issues across the spread
  const activeIssues = useMemo(() => {
    // Unresolved issues (DOWN, REPAIRING, DERATED)
    return pumpOpsEvents.filter((ev) => {
      const isUnresolved = !ev.resolvedAt;
      const isProblemStatus = ['DOWN', 'REPAIRING', 'DERATED'].includes(ev.status);
      return isUnresolved && isProblemStatus;
    }).sort((a, b) => b.startedAt - a.startedAt);
  }, [pumpOpsEvents]);

  // Active watch items
  const watchItems = useMemo(() => {
    return pumpOpsEvents.filter((ev) => {
      const isUnresolved = !ev.resolvedAt;
      return isUnresolved && Boolean(ev.watchNextShift);
    }).sort((a, b) => b.startedAt - a.startedAt);
  }, [pumpOpsEvents]);

  // Completed repairs for selected date & shift
  const completedRepairs = useMemo(() => {
    return shiftEvents.filter(
      (ev) => ev.resolvedAt && (ev.eventType === 'pump_down' || ev.status === 'RUNNING') && (ev.downtimeMinutes ?? 0) > 0
    );
  }, [shiftEvents]);

  // Pump Swaps for selected date & shift
  const pumpSwaps = useMemo(() => {
    return shiftEvents.filter((ev) => ev.eventType === 'pump_swap');
  }, [shiftEvents]);

  // Live status summary counts
  const statusCounts = useMemo(() => {
    let running = 0;
    let down = 0;
    let spotCheck = 0;
    let repairing = 0;
    let derated = 0;

    activeStations.forEach((st) => {
      const pump = getPumpsForStation(st)[0];
      if (!pump) return;
      const stInfo = getPumpCurrentStatus(pump, date, shift);
      if (stInfo.activeEvent?.eventType === 'spot_check') {
        spotCheck++;
      } else if (stInfo.status === 'RUNNING') running++;
      else if (stInfo.status === 'DOWN') down++;
      else if (stInfo.status === 'REPAIRING') repairing++;
      else if (stInfo.status === 'DERATED') derated++;
    });

    return {
      running,
      down,
      spotCheck,
      repairing,
      derated,
      watch: watchItems.length,
      standby: standbyPumps.length,
      totalActive: activeStations.filter((st) => getPumpsForStation(st).length > 0).length,
    };
  }, [activeStations, getPumpsForStation, getPumpCurrentStatus, date, shift, watchItems.length, standbyPumps.length]);

  // Finalized handoff snapshot for this date & shift
  const handoffSnapshot = useMemo(() => {
    const key = `${date}_${shift}`;
    return fleet.finalizedHandoffs?.[key];
  }, [fleet.finalizedHandoffs, date, shift]);

  // Hole multi-select toggle
  const toggleHole = (holeNum: number) => {
    setDownHoles((prev) => {
      if (prev.includes(holeNum)) {
        const next = prev.filter((h) => h !== holeNum);
        return next.length > 0 ? next : [holeNum];
      }
      return [...prev, holeNum].sort((a, b) => a - b);
    });
  };

  const toggleWatchHole = (holeNum: number) => {
    setWatchHoles((prev) => {
      if (prev.includes(holeNum)) {
        const next = prev.filter((h) => h !== holeNum);
        return next.length > 0 ? next : [holeNum];
      }
      return [...prev, holeNum].sort((a, b) => a - b);
    });
  };

  // Open Swap Pump modal
  const handleOpenSwap = (station: string, currentPump: string) => {
    setSwapModal({ station, currentPump });
    const candidateStandby = standbyPumps.find((p) => p.trim().toLowerCase() !== currentPump.trim().toLowerCase()) || '';
    setSelectedReplacementPump(candidateStandby);
    setCustomReplacementInput('');
    setSwapNotes('');
  };

  // Confirm Swap Pump
  const handleConfirmSwap = async () => {
    if (!swapModal) return;
    const replacement = customReplacementInput.trim() || selectedReplacementPump.trim();
    if (!replacement) return;
    if (replacement.toLowerCase() === swapModal.currentPump.trim().toLowerCase()) return;

    setIsSubmittingSwap(true);
    try {
      await swapPumpOnStation(
        swapModal.station,
        swapModal.currentPump,
        replacement,
        swapNotes.trim() ? swapNotes.trim() : undefined
      );
      setSwapModal(null);
    } catch (err) {
      console.error('Error swapping pump on station:', err);
    } finally {
      setIsSubmittingSwap(false);
    }
  };

  // Open Pump Down modal for a station/pump
  const handleOpenPumpDown = (station: string, pump: string) => {
    setPumpDownModal({ station, pump });
    setDownCategory('FLUID END');
    setDownComponent('PACKING');
    setDownHoles([3]);
    setDownNotes('');
    setDownWatchNext(false);
  };

  // Submit Pump Down event
  const handleSubmitPumpDown = async () => {
    if (!pumpDownModal) return;
    setIsSubmittingEvent(true);
    try {
      await recordPumpOpEvent({
        date,
        shift,
        station: pumpDownModal.station,
        pump: pumpDownModal.pump,
        eventType: 'pump_down',
        status: 'DOWN',
        category: downCategory,
        component: downComponent,
        holes: downCategory === 'FLUID END' ? downHoles : undefined,
        notes: downNotes.trim() ? downNotes.trim() : undefined,
        watchNextShift: downWatchNext,
        operator: technicianName || 'Operator',
        startedAt: Date.now(),
      });
      setPumpDownModal(null);
    } catch (err) {
      console.error('Error recording pump down event:', err);
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  // Submit Derate event
  const handleSubmitDerate = async () => {
    if (!derateModal) return;
    setIsSubmittingEvent(true);
    try {
      await markDerated({
        date,
        shift,
        station: derateModal.station,
        pump: derateModal.pump,
        reason: derateReason,
        limitation: derateLimitation.trim() ? derateLimitation.trim() : undefined,
        notes: derateNotes.trim() ? derateNotes.trim() : undefined,
      });
      setDerateModal(null);
    } catch (err) {
      console.error('Error marking pump derated:', err);
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  // Submit Watch Item event
  const handleSubmitWatch = async () => {
    if (!watchModal) return;
    setIsSubmittingEvent(true);
    try {
      await recordWatchItem({
        date,
        shift,
        station: watchModal.station,
        pump: watchModal.pump,
        category: watchCategory,
        component: watchComponent,
        holes: watchCategory === 'FLUID END' ? watchHoles : undefined,
        notes: watchNotes.trim() ? watchNotes.trim() : undefined,
      });
      setWatchModal(null);
    } catch (err) {
      console.error('Error recording watch item:', err);
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  // Confirm Action Prompt (Start Repair or Return to Service)
  const handleConfirmActionPrompt = async () => {
    if (!actionPromptModal) return;
    setIsSubmittingEvent(true);
    try {
      if (actionPromptModal.type === 'repair') {
        await startRepair(actionPromptModal.eventId, actionPromptNote.trim());
      } else {
        await returnToService(actionPromptModal.eventId, actionPromptNote.trim());
      }
      setActionPromptModal(null);
      setActionPromptNote('');
    } catch (err) {
      console.error('Error updating pump event action:', err);
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  // Immediate start of Spot Check on a pump (takes pump out-of-service, downtime begins, NO modal opens)
  const handleStartSpotCheck = async (station: string, pump: string) => {
    const now = Date.now();
    await recordPumpOpEvent({
      date,
      shift,
      station,
      pump,
      eventType: 'spot_check',
      spotCheckType: 'valves_seats',
      status: 'DOWN',
      category: 'FLUID END',
      component: 'VALVES & SEATS',
      checks: [], // Results Pending
      notes: '',
      operator: technicianName || 'Operator',
      startedAt: now,
      downAt: now,
    });
  };

  // Open Spot Check modal (ONLY for entering or editing results on an existing active spot check)
  const handleOpenSpotCheck = (station: string, pump: string, existingEvent?: PumpOpsEvent | null) => {
    setSpotCheckModal({
      station,
      pump,
      existingEvent: existingEvent || null,
    });
  };

  // Save Spot Check
  const handleSaveSpotCheck = async (
    data: {
      station: string;
      pump: string;
      checks: SpotCheckHoleResult[];
      notes?: string;
      recheckNextStage?: boolean;
    },
    existingId?: string
  ): Promise<PumpOpsEvent> => {
    const now = Date.now();
    if (existingId) {
      const updates: Partial<PumpOpsEvent> = {
        checks: data.checks,
        notes: data.notes,
        recheckNextStage: data.recheckNextStage,
        lastEditedAt: now,
        lastEditedBy: technicianName || 'Operator',
      };
      await updatePumpOpEvent(existingId, updates);
      const existing = pumpOpsEvents.find((e) => e.id === existingId);
      return {
        ...(existing || {}),
        ...updates,
      } as PumpOpsEvent;
    }

    return await recordPumpOpEvent({
      date,
      shift,
      station: data.station,
      pump: data.pump,
      eventType: 'spot_check',
      spotCheckType: 'valves_seats',
      status: 'DOWN',
      category: 'FLUID END',
      component: 'VALVES & SEATS',
      checks: data.checks,
      notes: data.notes,
      recheckNextStage: data.recheckNextStage,
      operator: technicianName || 'Operator',
      startedAt: now,
      downAt: now,
    });
  };

  // Convert Spot Check to Active Failure (preserves downAt, startedAt, updates SAME event)
  const handleConvertSpotCheckToFailure = (spotCheckEvent: PumpOpsEvent) => {
    const badOrWatchHoles = (spotCheckEvent.checks || [])
      .filter((c) => c.condition === 'BAD' || c.condition === 'WATCH')
      .map((c) => c.hole);
    const convertedMock: PumpOpsEvent = {
      ...spotCheckEvent,
      eventType: 'pump_down',
      status: 'DOWN',
      category: 'FLUID END',
      component: 'VALVES & SEATS',
      holes: badOrWatchHoles.length > 0 ? badOrWatchHoles : spotCheckEvent.holes || [],
      downAt: spotCheckEvent.downAt || spotCheckEvent.startedAt,
      startedAt: spotCheckEvent.startedAt,
    };
    setEditIssueModalEvent(convertedMock);
  };

  // Create linked issue from Spot Check (WATCH / DOWN / DERATED)
  const handleCreateLinkedIssueFromSpotCheck = async (params: {
    status: LinkedIssueStatus;
    holes: number[];
    notes?: string;
    sourceSpotCheckId: string;
    limitation?: string;
  }) => {
    const now = Date.now();
    if (!spotCheckModal) return;

    if (params.status === 'DOWN') {
      await recordPumpOpEvent({
        date,
        shift,
        station: spotCheckModal.station,
        pump: spotCheckModal.pump,
        eventType: 'pump_down',
        status: 'DOWN',
        category: 'FLUID END',
        component: 'VALVES & SEATS',
        holes: params.holes,
        notes: params.notes,
        operator: technicianName || 'Operator',
        startedAt: now,
        downAt: now,
        sourceSpotCheckId: params.sourceSpotCheckId,
        createdFromSpotCheck: true,
      });
    } else if (params.status === 'DERATED') {
      await recordPumpOpEvent({
        date,
        shift,
        station: spotCheckModal.station,
        pump: spotCheckModal.pump,
        eventType: 'derated',
        status: 'DERATED',
        category: 'FLUID END',
        component: 'VALVES & SEATS',
        holes: params.holes,
        limitation: params.limitation,
        notes: params.notes,
        operator: technicianName || 'Operator',
        startedAt: now,
        downAt: null,
        sourceSpotCheckId: params.sourceSpotCheckId,
        createdFromSpotCheck: true,
      });
    } else {
      // WATCH
      await recordPumpOpEvent({
        date,
        shift,
        station: spotCheckModal.station,
        pump: spotCheckModal.pump,
        eventType: 'watch_item',
        status: 'RUNNING',
        category: 'FLUID END',
        component: 'VALVES & SEATS',
        holes: params.holes,
        notes: params.notes,
        watchNextShift: true,
        operator: technicianName || 'Operator',
        startedAt: now,
        downAt: null,
        sourceSpotCheckId: params.sourceSpotCheckId,
        createdFromSpotCheck: true,
      });
    }
  };

  // Save Shift Notes with debounce / blur
  const handleSaveShiftNotes = (text: string) => {
    setLocalShiftNotes(text);
    setShiftNotes(date, shift, text);
  };

  // Finalize Handoff Snapshot
  const handleFinalizeHandoff = async () => {
    const lineupRows = activeStations.map((st) => {
      const p = getPumpsForStation(st)[0] || '';
      const stInfo = getPumpCurrentStatus(p, date, shift);
      let summary = '';
      if (stInfo.activeEvent) {
        summary = `${stInfo.activeEvent.category || ''} ${stInfo.activeEvent.component || ''}`;
      }
      return {
        station: st,
        pump: p,
        status: stInfo.status,
        activeIssueSummary: summary.trim() || undefined,
      };
    });

    await finalizeShiftHandoff({
      date,
      shift,
      finalizedAt: Date.now(),
      finalizedBy: technicianName || 'Operator',
      incomingOperator: incomingOperator.trim() || undefined,
      outgoingOperator: technicianName || 'Operator',
      shiftNotes: localShiftNotes,
      lineup: lineupRows,
      activeIssues,
      watchItems,
      completedRepairs,
      pumpSwaps,
    });

    setShowFinalizeSuccess(true);
    setTimeout(() => setShowFinalizeSuccess(false), 4000);
  };

  // Print Handoff
  const handlePrintHandoff = () => {
    window.print();
  };

  // Generate Email Handoff mailto link
  const handleEmailHandoff = () => {
    const subject = encodeURIComponent(
      `Fleet 1 Pump Operator Handoff - ${date} (${shift === 'day' ? 'Day Shift' : 'Night Shift'})`
    );

    let bodyText = `FLEET 1 PUMP OPERATOR SHIFT HANDOFF\n`;
    bodyText += `Date: ${date}\n`;
    bodyText += `Shift: ${shift === 'day' ? 'Day Shift' : 'Night Shift'}\n`;
    bodyText += `Outgoing Operator: ${technicianName || 'Operator'}\n`;
    if (incomingOperator) bodyText += `Incoming Operator: ${incomingOperator}\n`;
    bodyText += `\n========================================\n`;
    bodyText += `CURRENT SPREAD STATUS:\n`;
    bodyText += `${statusCounts.running} Running | ${statusCounts.down} Down ${statusCounts.spotCheck > 0 ? `| ${statusCounts.spotCheck} Spot Check ` : ''}| ${statusCounts.repairing} Repairing | ${statusCounts.derated} Derated\n`;
    bodyText += `\n========================================\n`;
    bodyText += `ACTIVE ISSUES (${activeIssues.length}):\n`;
    if (activeIssues.length === 0) {
      bodyText += `None - all spread pumps operating normally.\n`;
    } else {
      activeIssues.forEach((issue) => {
        const downStart = issue.downAt || issue.startedAt;
        const downtime = Math.max(1, Math.round((Date.now() - downStart) / 60000));
        const statusLabel = issue.eventType === 'spot_check' ? 'SPOT CHECK' : issue.status;
        bodyText += `• Station ${issue.station} / Pump ${issue.pump} [${statusLabel} - ${downtime} min]:\n`;
        if (issue.eventType === 'spot_check') {
          bodyText += `  Valves & Seats Spot Check`;
          if (issue.checks && issue.checks.length > 0) {
            const checksSummary = issue.checks.map(c => `H${c.hole} ${c.condition}${c.part ? `-${c.part}` : ''}`).join(', ');
            bodyText += ` [${checksSummary}]`;
          }
        } else {
          bodyText += `  ${issue.category || ''} - ${issue.component || ''}`;
          if (issue.holes && issue.holes.length > 0) bodyText += ` (Hole ${issue.holes.join(', ')})`;
        }
        if (issue.notes) bodyText += `\n  Notes: ${issue.notes}`;
        bodyText += `\n`;
      });
    }

    bodyText += `\n========================================\n`;
    bodyText += `WATCH NEXT SHIFT (${watchItems.length}):\n`;
    if (watchItems.length === 0) {
      bodyText += `None\n`;
    } else {
      watchItems.forEach((w) => {
        bodyText += `• Pump ${w.pump} (${w.station}): ${w.component || ''}`;
        if (w.holes && w.holes.length > 0) bodyText += ` (Hole ${w.holes.join(', ')})`;
        if (w.notes) bodyText += ` - "${w.notes}"`;
        bodyText += `\n`;
      });
    }

    bodyText += `\n========================================\n`;
    bodyText += `COMPLETED REPAIRS (${completedRepairs.length}):\n`;
    if (completedRepairs.length === 0) {
      bodyText += `None\n`;
    } else {
      completedRepairs.forEach((r) => {
        bodyText += `• Pump ${r.pump} (${r.station}): ${r.component || ''} - Downtime: ${r.downtimeMinutes || 0} min\n`;
      });
    }

    bodyText += `\n========================================\n`;
    bodyText += `PUMP SWAPS (${pumpSwaps.length}):\n`;
    if (pumpSwaps.length === 0) {
      bodyText += `None\n`;
    } else {
      pumpSwaps.forEach((s) => {
        bodyText += `• ${s.station}: Pump ${s.replacedPump} → Pump ${s.pump}\n`;
      });
    }

    bodyText += `\n========================================\n`;
    bodyText += `GENERAL SHIFT NOTES:\n`;
    bodyText += localShiftNotes.trim() ? `${localShiftNotes.trim()}\n` : `None entered.\n`;

    const mailtoUrl = `mailto:?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
    window.location.href = mailtoUrl;
    setEmailDraftNotice(true);
    setTimeout(() => setEmailDraftNotice(false), 7000);
  };

  // Events filtered for history modal
  const historyPumpEvents = useMemo(() => {
    if (!historyModalPump) return [];
    return pumpOpsEvents
      .filter((ev) => ev.pump.trim().toLowerCase() === historyModalPump.trim().toLowerCase())
      .sort((a, b) => b.startedAt - a.startedAt);
  }, [pumpOpsEvents, historyModalPump]);

  return (
    <div className="space-y-4 pb-28 max-w-5xl mx-auto">
      {/* 1. TOP HEADER & OPERATIONAL BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3.5 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>DATAVAN PUMP OPS &amp; SHIFT HANDOFF</span>
              </span>
              <span className="text-slate-600 font-bold">•</span>
              <span className="text-xs font-mono font-bold text-slate-300">
                {date}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight mt-0.5 flex items-center gap-2">
              <span>Pump Operations</span>
              <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                LIVE
              </span>
            </h1>
          </div>

          {/* Quick Print Spread Issues Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPrintIssuesModal(true)}
              className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-800 hover:border-amber-500/40 rounded-xl text-xs font-mono font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
              title="Print active spread issues and downtime report"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>PRINT SPREAD ISSUES</span>
            </button>
          </div>
        </div>

        {/* Shift Toggle & Secondary Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80 items-center">
          {/* Shift Segmented Control */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setShift('day');
                setActiveShift('day');
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                shift === 'day'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white bg-slate-900/60'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>DAY SHIFT</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShift('night');
                setActiveShift('night');
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                shift === 'night'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white bg-slate-900/60'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>NIGHT SHIFT</span>
            </button>
          </div>

          {/* Metric Status Ribbon */}
          <div className="flex items-center justify-between sm:justify-end gap-2 overflow-x-auto pb-1 sm:pb-0 font-mono text-xs font-bold">
            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg whitespace-nowrap">
              {statusCounts.running} RUNNING
            </span>
            {statusCounts.down > 0 && (
              <span className="px-2.5 py-1 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-lg whitespace-nowrap animate-pulse">
                {statusCounts.down} DOWN
              </span>
            )}
            {statusCounts.spotCheck > 0 && (
              <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg whitespace-nowrap">
                {statusCounts.spotCheck} SPOT CHECK
              </span>
            )}
            {statusCounts.repairing > 0 && (
              <span className="px-2.5 py-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg whitespace-nowrap">
                {statusCounts.repairing} REPAIRING
              </span>
            )}
            {statusCounts.derated > 0 && (
              <span className="px-2.5 py-1 bg-orange-500/15 text-orange-400 border border-orange-500/30 rounded-lg whitespace-nowrap">
                {statusCounts.derated} DERATED
              </span>
            )}
            {statusCounts.watch > 0 && (
              <span className="px-2.5 py-1 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-lg whitespace-nowrap">
                {statusCounts.watch} WATCH
              </span>
            )}
          </div>
        </div>

        {/* 3 Main Tabs: LIVE STATUS | ACTIVITY | HANDOFF */}
        <div className="pt-1">
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`min-h-[44px] py-2 px-2 rounded-lg font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'live'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white bg-slate-900/40'
              }`}
            >
              <Activity className="w-4 h-4 shrink-0" />
              <span>LIVE STATUS</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`min-h-[44px] py-2 px-2 rounded-lg font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'activity'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white bg-slate-900/40'
              }`}
            >
              <History className="w-4 h-4 shrink-0" />
              <span>ACTIVITY</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('handoff')}
              className={`min-h-[44px] py-2 px-2 rounded-lg font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'handoff'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white bg-slate-900/40'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>HANDOFF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIVE STATUS SCREEN                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'live' && (
        <div className="space-y-4">
          {/* ACTIVE ISSUES CALLOUT (HIGH VISIBILITY SECTION) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className={`w-5 h-5 ${activeIssues.length > 0 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`} />
                <h2 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-tight">
                  ACTIVE SPREAD ISSUES
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintIssuesModal(true)}
                  className="px-2.5 sm:px-3 py-1 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-lg text-xs font-mono font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                  title="Print active spread issues and downtime report"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PRINT ISSUES</span>
                </button>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                  activeIssues.length > 0
                    ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {activeIssues.length} UNRESOLVED
                </span>
              </div>
            </div>

            {activeIssues.length === 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center text-xs text-slate-400 font-mono">
                All spread pumps are currently running normally. No open failures or downtime.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeIssues.map((issue) => {
                  const downStart = issue.downAt || issue.startedAt;
                  const downtime = Math.max(1, Math.round((Date.now() - downStart) / 60000));
                  const isSpotCheck = issue.eventType === 'spot_check';
                  const displayLabel = isSpotCheck ? 'SPOT CHECK' : issue.status;

                  return (
                    <div
                      key={issue.id}
                      className={`border rounded-xl p-3.5 space-y-2.5 transition-all shadow-md ${
                        isSpotCheck
                          ? 'bg-sky-950/30 border-sky-500/50'
                          : issue.status === 'DOWN'
                          ? 'bg-rose-950/30 border-rose-600/50'
                          : issue.status === 'REPAIRING'
                          ? 'bg-amber-950/30 border-amber-500/50'
                          : 'bg-orange-950/30 border-orange-500/50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-black text-slate-100 uppercase">
                              {issue.station}
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="font-mono font-bold text-amber-300 text-sm">
                              PUMP {issue.pump}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-slate-400 mt-0.5">
                            {isSpotCheck ? (
                              <>Spot Check since {new Date(downStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>
                            ) : issue.status === 'DOWN' || issue.status === 'REPAIRING' ? (
                              <>
                                Down since {new Date(downStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                {issue.downAt && issue.downAt !== issue.startedAt && (
                                  <span className="text-slate-500 ml-1.5">
                                    (Opened {new Date(issue.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                Since {new Date(issue.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {issue._pendingSync && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse"
                              title="Direct Firestore write pending, stored in offline queue"
                            >
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span>SYNC PENDING</span>
                            </span>
                          )}

                          <span
                            className={`px-2 py-1 rounded text-xs font-mono font-black uppercase tracking-wider ${
                              isSpotCheck
                                ? 'bg-sky-500 text-slate-950'
                                : issue.status === 'DOWN'
                                ? 'bg-rose-500 text-slate-950'
                                : issue.status === 'REPAIRING'
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-orange-500 text-slate-950'
                            }`}
                          >
                            {displayLabel} • {downtime}M
                          </span>
                        </div>
                      </div>

                      {/* Problem details */}
                      {isSpotCheck ? (
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 text-xs space-y-1.5">
                          <div className="font-black text-slate-200 flex items-center justify-between">
                            <span className="text-amber-300 font-mono">
                              VALVES &amp; SEATS
                            </span>
                            {(!issue.checks || issue.checks.length === 0) ? (
                              <span className="text-[11px] font-mono text-amber-400 font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                                <span>Results Pending</span>
                              </span>
                            ) : (
                              <span className="text-[11px] font-mono text-sky-400 font-bold">
                                {formatCompactIssue(issue)}
                              </span>
                            )}
                          </div>
                          {issue.checks && issue.checks.length > 0 && (
                            <div className="grid grid-cols-5 gap-1 pt-0.5">
                              {issue.checks.map((chk) => (
                                <div
                                  key={chk.hole}
                                  className={`px-1 py-1 rounded text-center font-mono text-[11px] font-bold border ${
                                    chk.condition === 'BAD'
                                      ? 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                                      : chk.condition === 'WATCH'
                                      ? 'bg-amber-950/80 border-amber-500/60 text-amber-300'
                                      : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                  }`}
                                >
                                  <div>H{chk.hole}</div>
                                  <div className="text-[9px] uppercase tracking-tighter">
                                    {chk.condition}
                                    {chk.part ? ` (${chk.part === 'VALVE' ? 'V' : chk.part === 'SEAT' ? 'S' : 'B'})` : ''}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {issue.notes && (
                            <div className="text-slate-300 italic text-[11px] pt-0.5">
                              "{issue.notes}"
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2 text-xs space-y-1">
                          <div className="font-bold text-slate-200">
                            {issue.category || 'ISSUE'} — {issue.component || 'FAILURE'}
                            {issue.holes && issue.holes.length > 0 && (
                              <span className="text-amber-400 ml-1.5 font-mono">
                                Hole {issue.holes.join(', ')}
                              </span>
                            )}
                          </div>
                          {issue.limitation && (
                            <div className="text-orange-300 font-mono text-[11px]">
                              Limit: {issue.limitation}
                            </div>
                          )}
                          {issue.notes && (
                            <div className="text-slate-400 italic text-[11px]">
                              "{issue.notes}"
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fast Action Buttons */}
                      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (isSpotCheck) {
                              handleOpenSpotCheck(issue.station, issue.pump, issue);
                            } else {
                              setEditIssueModalEvent(issue);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 ${
                            isSpotCheck
                              ? 'bg-sky-600 hover:bg-sky-500 text-slate-950 shadow-sky-600/20'
                              : 'bg-slate-800 hover:bg-slate-700 hover:text-amber-400 text-slate-300 border border-slate-700'
                          }`}
                          title={isSpotCheck ? `Record results for Pump ${issue.pump}` : `Edit active issue details for Pump ${issue.pump}`}
                        >
                          <ClipboardCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>
                            {isSpotCheck
                              ? (!issue.checks || issue.checks.length === 0 ? 'ENTER RESULTS' : 'EDIT RESULTS')
                              : 'EDIT ISSUE'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSwap(issue.station, issue.pump)}
                          className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500 hover:text-white text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                          title={`Swap out Pump ${issue.pump} on ${issue.station}`}
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>SWAP PUMP</span>
                        </button>
                        {(issue.status === 'DOWN' || isSpotCheck) && (
                          <button
                            type="button"
                            onClick={() =>
                              setActionPromptModal({
                                type: 'repair',
                                eventId: issue.id,
                                pump: issue.pump,
                                station: issue.station,
                              })
                            }
                            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-black uppercase transition-all cursor-pointer"
                          >
                            START REPAIR
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setActionPromptModal({
                              type: 'return',
                              eventId: issue.id,
                              pump: issue.pump,
                              station: issue.station,
                            })
                          }
                          className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-black uppercase transition-all cursor-pointer shadow-sm"
                        >
                          RETURN TO SERVICE
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryModalPump(issue.pump)}
                          className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer"
                          title="View Pump History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* WATCH NEXT SHIFT SECTION (IF ANY WATCH ITEMS) */}
          {watchItems.length > 0 && (
            <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400">
                  <Eye className="w-5 h-5" />
                  <h3 className="text-base font-black uppercase tracking-tight text-slate-100">
                    WATCH NEXT SHIFT
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-500/40 rounded">
                  {watchItems.length} FLAGGED
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {watchItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-950 border border-indigo-500/30 rounded-xl p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-200">
                        PUMP {item.pump} ({item.station})
                      </span>
                      <span className="text-[10px] uppercase font-mono font-bold text-indigo-400 px-1.5 py-0.5 bg-indigo-950/60 rounded border border-indigo-500/30">
                        WATCH ITEM
                      </span>
                    </div>
                    <div className="text-slate-300 font-bold">
                      {item.category} — {item.component}
                      {item.holes && item.holes.length > 0 && (
                        <span className="text-indigo-400 ml-1 font-mono">
                          (Hole {item.holes.join(', ')})
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-slate-400 italic text-[11px]">
                        "{item.notes}"
                      </p>
                    )}
                    <div className="pt-1.5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await updatePumpOpEvent(item.id, {
                            resolvedAt: Date.now(),
                            watchNextShift: false,
                            lastEditedAt: Date.now(),
                            lastEditedBy: technicianName || 'Operator',
                          });
                        }}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 border border-emerald-500/40 rounded-lg text-[11px] font-black uppercase transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                        title={`Clear watch on Pump ${item.pump}`}
                      >
                        <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                        <span>CLEAR WATCH</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditIssueModalEvent(item)}
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 rounded-lg text-[11px] font-black uppercase transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                        title={`Edit watch item for Pump ${item.pump}`}
                      >
                        <Edit2 className="w-3 h-3 text-amber-400" />
                        <span>EDIT ISSUE</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SPREAD LINEUP STATION CARDS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-lg font-black text-slate-100 uppercase tracking-tight">
                  CURRENT LINEUP STATIONS
                </h3>
                <p className="text-xs text-slate-400">
                  Operational status directly tied to Fleet 1 lineup
                </p>
              </div>

              {onGoToLineup && (
                <button
                  type="button"
                  onClick={onGoToLineup}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Configure Lineup</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeStations.map((stationName) => {
                const assignedPump = getPumpsForStation(stationName)[0] || '';
                const stInfo = getPumpCurrentStatus(assignedPump, date, shift);
                const isSpotCheck = stInfo.activeEvent?.eventType === 'spot_check';
                const isDown = !isSpotCheck && stInfo.status === 'DOWN';
                const isRepairing = stInfo.status === 'REPAIRING';
                const isDerated = stInfo.status === 'DERATED';
                const isRunning = stInfo.status === 'RUNNING';

                return (
                  <div
                    key={stationName}
                    className={`bg-slate-900 border rounded-2xl p-4 shadow-md flex flex-col justify-between transition-all ${
                      isSpotCheck
                        ? 'border-sky-500/60 bg-sky-950/20'
                        : isDown
                        ? 'border-rose-500/60 bg-rose-950/15'
                        : isRepairing
                        ? 'border-amber-500/60 bg-amber-950/15'
                        : isDerated
                        ? 'border-orange-500/60 bg-orange-950/15'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Top Header: Station & Status Badge */}
                      <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2 mb-2.5">
                        <div>
                          <h4 className="text-xl font-black text-slate-100 uppercase tracking-tight">
                            {stationName}
                          </h4>
                          <span className="font-mono font-bold text-sm text-slate-300">
                            {assignedPump ? `PUMP ${assignedPump}` : 'NO PUMP ASSIGNED'}
                          </span>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black uppercase tracking-wider ${
                            isSpotCheck
                              ? 'bg-sky-500 text-slate-950 shadow-sm shadow-sky-500/20'
                              : isDown
                              ? 'bg-rose-500 text-slate-950 shadow-sm shadow-rose-500/20'
                              : isRepairing
                              ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                              : isDerated
                              ? 'bg-orange-500 text-slate-950 shadow-sm shadow-orange-500/20'
                              : isRunning && assignedPump
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {assignedPump ? (isSpotCheck ? 'SPOT CHECK' : stInfo.status) : 'EMPTY'}
                        </span>
                      </div>

                      {/* Active issue note if not running */}
                      {stInfo.activeEvent && (
                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 mb-3 text-xs space-y-1">
                          <div className="flex items-center justify-between text-amber-300 font-bold">
                            <span>
                              {isSpotCheck
                                ? 'VALVES & SEATS SPOT CHECK'
                                : `${stInfo.activeEvent.category || 'ISSUE'} — ${stInfo.activeEvent.component}`}
                            </span>
                            {stInfo.downtimeMinutes !== undefined && (
                              <span className={`font-mono ${isSpotCheck ? 'text-sky-300' : 'text-rose-400'}`}>
                                {isSpotCheck ? `${stInfo.downtimeMinutes}m` : `${stInfo.downtimeMinutes}m down`}
                              </span>
                            )}
                          </div>
                          {isSpotCheck && stInfo.activeEvent.checks && stInfo.activeEvent.checks.length > 0 ? (
                            <div className="flex flex-wrap gap-1 font-mono text-[10px] pt-0.5">
                              {stInfo.activeEvent.checks.map((chk) => (
                                <span
                                  key={chk.hole}
                                  className={`px-1.5 py-0.5 rounded border ${
                                    chk.condition === 'BAD'
                                      ? 'bg-rose-950/70 border-rose-500/50 text-rose-300'
                                      : chk.condition === 'WATCH'
                                      ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                                      : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
                                  }`}
                                >
                                  H{chk.hole} {chk.condition}{chk.part ? ` (${chk.part})` : ''}
                                </span>
                              ))}
                            </div>
                          ) : stInfo.activeEvent.holes && stInfo.activeEvent.holes.length > 0 ? (
                            <div className="text-slate-400 font-mono text-[11px]">
                              Hole {stInfo.activeEvent.holes.join(', ')}
                            </div>
                          ) : null}
                          {stInfo.activeEvent.notes && (
                            <div className="text-slate-400 italic text-[11px]">
                              "{stInfo.activeEvent.notes}"
                            </div>
                          )}
                        </div>
                      )}

                      {/* Watch Item alert pill */}
                      {stInfo.watchEvent && !stInfo.activeEvent && (
                        <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-lg p-2 mb-3 text-xs">
                          <span className="text-indigo-300 font-bold block">
                            👁️ Watch: {stInfo.watchEvent.component}
                          </span>
                          {stInfo.watchEvent.notes && (
                            <span className="text-slate-400 italic text-[11px]">
                              "{stInfo.watchEvent.notes}"
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Operational Action Buttons */}
                    {assignedPump ? (
                      <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                        {isRunning && (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenPumpDown(stationName, assignedPump)}
                              className="w-full min-h-[42px] py-2 px-3 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer transition-all"
                            >
                              <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
                              <span>PUMP DOWN</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartSpotCheck(stationName, assignedPump)}
                              className="w-full min-h-[42px] py-2 px-3 bg-slate-800 hover:bg-slate-700/90 active:scale-95 text-amber-300 hover:text-amber-200 border border-amber-500/35 hover:border-amber-400/60 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
                            >
                              <ClipboardCheck className="w-4 h-4 text-amber-400 stroke-[2.5]" />
                              <span>SPOT CHECK</span>
                            </button>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDerateModal({ station: stationName, pump: assignedPump })}
                                className="min-h-[38px] py-1.5 px-2 bg-slate-800 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 border border-slate-700 rounded-lg font-bold text-xs uppercase cursor-pointer"
                              >
                                DERATE
                              </button>
                              <button
                                type="button"
                                onClick={() => setWatchModal({ station: stationName, pump: assignedPump })}
                                className="min-h-[38px] py-1.5 px-2 bg-slate-800 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 border border-slate-700 rounded-lg font-bold text-xs uppercase cursor-pointer"
                              >
                                WATCH ITEM
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenSwap(stationName, assignedPump)}
                              className="w-full min-h-[38px] py-1.5 px-3 bg-indigo-600/20 hover:bg-indigo-600 hover:text-white text-indigo-300 border border-indigo-500/40 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>SWAP PUMP</span>
                            </button>
                          </div>
                        )}

                        {(isDown || isSpotCheck) && stInfo.activeEvent && (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenSwap(stationName, assignedPump)}
                              className="w-full min-h-[42px] py-2 px-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 transition-all"
                            >
                              <ArrowLeftRight className="w-4 h-4 stroke-[2.5]" />
                              <span>SWAP OUT PUMP</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenSpotCheck(stationName, assignedPump, isSpotCheck ? stInfo.activeEvent : undefined)}
                              className="w-full min-h-[38px] py-1.5 px-3 bg-slate-800 hover:bg-slate-700/90 active:scale-95 text-amber-300 hover:text-amber-200 border border-amber-500/35 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                              <span>
                                {isSpotCheck
                                  ? (stInfo.activeEvent?.checks && stInfo.activeEvent.checks.length > 0 ? 'EDIT RESULTS' : 'ENTER RESULTS')
                                  : 'SPOT CHECK'}
                              </span>
                            </button>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setActionPromptModal({
                                    type: 'repair',
                                    eventId: stInfo.activeEvent!.id,
                                    pump: assignedPump,
                                    station: stationName,
                                  })
                                }
                                className="min-h-[40px] py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                              >
                                START REPAIR
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setActionPromptModal({
                                    type: 'return',
                                    eventId: stInfo.activeEvent!.id,
                                    pump: assignedPump,
                                    station: stationName,
                                  })
                                }
                                className="min-h-[40px] py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                              >
                                RETURN TO SERVICE
                              </button>
                            </div>
                          </div>
                        )}

                        {isRepairing && stInfo.activeEvent && (
                          <div className="space-y-1.5">
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenSwap(stationName, assignedPump)}
                                className="min-h-[42px] py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>SWAP PUMP</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setActionPromptModal({
                                    type: 'return',
                                    eventId: stInfo.activeEvent!.id,
                                    pump: assignedPump,
                                    station: stationName,
                                  })
                                }
                                className="min-h-[42px] py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md"
                              >
                                RETURN TO SERVICE
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenSpotCheck(stationName, assignedPump)}
                              className="w-full min-h-[38px] py-1.5 px-3 bg-slate-800 hover:bg-slate-700/90 active:scale-95 text-amber-300 hover:text-amber-200 border border-amber-500/35 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                              <span>SPOT CHECK</span>
                            </button>
                          </div>
                        )}

                        {isDerated && stInfo.activeEvent && (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenSwap(stationName, assignedPump)}
                              className="w-full min-h-[40px] py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20"
                            >
                              <ArrowLeftRight className="w-4 h-4 stroke-[2.5]" />
                              <span>SWAP OUT PUMP</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenSpotCheck(stationName, assignedPump)}
                              className="w-full min-h-[40px] py-1.5 px-3 bg-slate-800 hover:bg-slate-700/90 active:scale-95 text-amber-300 hover:text-amber-200 border border-amber-500/35 hover:border-amber-400/60 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
                            >
                              <ClipboardCheck className="w-4 h-4 text-amber-400 stroke-[2.5]" />
                              <span>SPOT CHECK</span>
                            </button>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenPumpDown(stationName, assignedPump)}
                                className="min-h-[40px] py-1.5 px-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase rounded-xl cursor-pointer"
                              >
                                TAKE DOWN
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setActionPromptModal({
                                    type: 'return',
                                    eventId: stInfo.activeEvent!.id,
                                    pump: assignedPump,
                                    station: stationName,
                                  })
                                }
                                className="min-h-[40px] py-1.5 px-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase rounded-xl cursor-pointer"
                              >
                                CLEAR DERATE
                              </button>
                            </div>
                          </div>
                        )}

                        {/* View History & Edit Issue action row */}
                        <div className="pt-1 flex items-center justify-between border-t border-slate-800/40 mt-1">
                          {(stInfo.activeEvent || stInfo.watchEvent) ? (
                            <button
                              type="button"
                              onClick={() => setEditIssueModalEvent(stInfo.activeEvent || stInfo.watchEvent || null)}
                              className="text-[11px] font-mono font-bold text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
                              title="Edit Issue Details"
                            >
                              <Edit2 className="w-3 h-3 text-amber-400" />
                              <span>Edit Issue</span>
                            </button>
                          ) : <div />}

                          <button
                            type="button"
                            onClick={() => setHistoryModalPump(assignedPump)}
                            className="text-[11px] font-mono text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer"
                          >
                            <History className="w-3 h-3" />
                            <span>History</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => handleOpenSwap(stationName, '')}
                          className="w-full min-h-[40px] py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase rounded-xl cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
                        >
                          <ArrowLeftRight className="w-4 h-4" />
                          <span>ASSIGN STANDBY PUMP</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* STANDBY / OUT OF LINEUP PUMPS ON LOCATION */}
          {standbyPumps.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-tight">
                    STANDBY PUMPS ON LOCATION
                  </h3>
                  <p className="text-xs text-slate-400">
                    Pumps physically on location not assigned to active stations
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-800 text-slate-300 rounded">
                  {standbyPumps.length} STANDBY
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {standbyPumps.map((p) => {
                  const stInfo = getPumpCurrentStatus(p, date, shift);
                  const hasOpenIssue = Boolean(stInfo.activeEvent);

                  return (
                    <div
                      key={p}
                      className={`bg-slate-950 border rounded-xl p-3 space-y-1.5 transition-all ${
                        hasOpenIssue
                          ? 'border-rose-500/40 bg-rose-950/20'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-sm text-slate-100">
                          PUMP {p}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            hasOpenIssue
                              ? 'bg-rose-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {hasOpenIssue ? stInfo.status : 'STANDBY'}
                        </span>
                      </div>

                      {hasOpenIssue && stInfo.activeEvent && (
                        <div className="text-[11px] text-rose-300 font-mono">
                          {stInfo.activeEvent.category} — {stInfo.activeEvent.component}
                        </div>
                      )}

                      <div className="pt-1 flex items-center justify-between border-t border-slate-800/60">
                        <button
                          type="button"
                          onClick={() => setHistoryModalPump(p)}
                          className="text-[11px] font-mono text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer"
                        >
                          <History className="w-3 h-3" />
                          <span>History</span>
                        </button>

                        {hasOpenIssue && stInfo.activeEvent && (
                          <button
                            type="button"
                            onClick={() =>
                              setActionPromptModal({
                                type: 'return',
                                eventId: stInfo.activeEvent!.id,
                                pump: p,
                                station: 'Standby',
                              })
                            }
                            className="text-[11px] font-bold text-emerald-400 hover:underline cursor-pointer"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ACTIVITY TIMELINE                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'activity' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-xl font-black text-slate-100 uppercase tracking-tight flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <span>Operational Activity Timeline</span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Historical activity grouped by calendar date • Today expanded • Older days collapsed
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-amber-400 self-start sm:self-auto">
              {pumpOpsEvents.length} TOTAL EVENTS
            </span>
          </div>

          <ActivityTimeline
            events={pumpOpsEvents}
            onSelectPumpHistory={(p) => setHistoryModalPump(p)}
            onEditSpotCheck={(event) =>
              handleOpenSpotCheck(event.station, event.pump, event)
            }
            onViewSpotCheckDetail={(event) => setSelectedSpotCheckDetail(event)}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SHIFT HANDOFF REPORT                                               */}
      {/* ========================================================================= */}
      {activeTab === 'handoff' && (
        <div className="space-y-4">
          {/* Printable Report Card Container */}
          <div
            id="shift-handoff-printable"
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-6 print:bg-white print:text-black print:border-none print:shadow-none print:p-0"
          >
            {/* Header: Title, Date, Shift, Operators */}
            <div className="border-b border-slate-800 print:border-black pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <span className="text-xs font-mono font-black uppercase tracking-widest text-amber-400 print:text-black">
                  FLEET 1 • PUMP OPERATOR SHIFT HANDOFF
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-100 print:text-black tracking-tight mt-0.5">
                  Shift Handoff Report
                </h2>
                <div className="flex items-center gap-2 mt-1 text-xs font-mono font-bold text-slate-300 print:text-black">
                  <span>{date}</span>
                  <span>•</span>
                  <span className="uppercase text-amber-400 print:text-black">
                    {shift === 'day' ? '☀️ DAY SHIFT' : '🌙 NIGHT SHIFT'}
                  </span>
                  {handoffSnapshot?.finalizedAt && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-400 print:text-black">
                        FINALIZED AT {new Date(handoffSnapshot.finalizedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons for Handoff: Print, Email, Finalize */}
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => setShowPrintIssuesModal(true)}
                  className="px-3 py-2 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                  title="Print Active Spread Issues Only"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PRINT SPREAD ISSUES</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintHandoff}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Print Complete Handoff Sheet"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span>PRINT HANDOFF</span>
                </button>
                <button
                  type="button"
                  onClick={handleEmailHandoff}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Open email draft with handoff summary"
                >
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                  <span>OPEN EMAIL DRAFT</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeHandoff}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase transition-all cursor-pointer shadow-md shadow-amber-500/20 flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>FINALIZE</span>
                </button>
              </div>
            </div>

            {/* Email Draft Notice Banner */}
            {emailDraftNotice && (
              <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-300 flex items-center justify-between gap-2 animate-in fade-in duration-200 print:hidden">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    <strong>Email draft opened in your email client.</strong> Please review and click Send from your email app. Note: Fleet 1 does not claim emails are delivered until sent through your email provider.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailDraftNotice(false)}
                  className="text-slate-400 hover:text-white font-mono text-xs px-1.5 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Operator Handshake Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 print:bg-slate-100 print:text-black border border-slate-800 print:border-black rounded-xl p-3.5">
              <div>
                <span className="text-[11px] font-mono uppercase font-bold text-slate-400 print:text-slate-600 block">
                  OUTGOING OPERATOR
                </span>
                <span className="font-mono font-black text-base text-slate-100 print:text-black">
                  {technicianName || 'Field Tech (Unassigned)'}
                </span>
              </div>
              <div>
                <label className="text-[11px] font-mono uppercase font-bold text-slate-400 print:text-slate-600 block">
                  INCOMING OPERATOR
                </label>
                <input
                  type="text"
                  value={incomingOperator}
                  onChange={(e) => setIncomingOperator(e.target.value)}
                  placeholder="Enter incoming operator name..."
                  className="w-full bg-slate-900 print:bg-white border border-slate-700 print:border-black rounded-lg px-2.5 py-1 text-sm font-mono font-bold text-slate-100 print:text-black focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* 1. CURRENT LINEUP OVERVIEW */}
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 print:text-black border-b border-slate-800 print:border-black pb-1">
                1. Current Lineup
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1 font-mono text-xs">
                {activeStations.map((st) => {
                  const p = getPumpsForStation(st)[0] || '—';
                  const stInfo = getPumpCurrentStatus(p, date, shift);
                  const isSpotCheck = stInfo.activeEvent?.eventType === 'spot_check';
                  return (
                    <div
                      key={st}
                      className={`p-2 rounded-lg border flex items-center justify-between ${
                        isSpotCheck
                          ? 'bg-sky-950/30 border-sky-500/50 text-sky-300 print:bg-sky-100 print:text-black'
                          : stInfo.status === 'DOWN'
                          ? 'bg-rose-950/30 border-rose-500/50 text-rose-300 print:bg-rose-100 print:text-black'
                          : stInfo.status === 'REPAIRING'
                          ? 'bg-amber-950/30 border-amber-500/50 text-amber-300 print:bg-amber-100 print:text-black'
                          : stInfo.status === 'DERATED'
                          ? 'bg-orange-950/30 border-orange-500/50 text-orange-300 print:bg-orange-100 print:text-black'
                          : 'bg-slate-950 border-slate-800 text-slate-300 print:bg-white print:border-slate-300 print:text-black'
                      }`}
                    >
                      <span className="font-bold">{st}</span>
                      <span className="font-black">Pump {p}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. ACTIVE ISSUES (CRITICAL UNRESOLVED) */}
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-rose-400 print:text-black border-b border-slate-800 print:border-black pb-1">
                2. Active Issues ({activeIssues.length})
              </h3>
              {activeIssues.length === 0 ? (
                <p className="text-xs font-mono text-slate-400 print:text-black italic">
                  None — zero open failures at shift change.
                </p>
              ) : (
                <div className="space-y-2 pt-1">
                  {activeIssues.map((issue) => {
                    const downStart = issue.downAt || issue.startedAt;
                    const downtime = Math.max(1, Math.round((Date.now() - downStart) / 60000));
                    const isSpotCheck = issue.eventType === 'spot_check';
                    const displayStatus = isSpotCheck ? 'SPOT CHECK' : issue.status;

                    return (
                      <div
                        key={issue.id}
                        className={`bg-slate-950 print:bg-white border rounded-xl p-3 text-xs space-y-1 ${
                          isSpotCheck ? 'border-sky-500/40 print:border-black' : 'border-rose-500/40 print:border-black'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-100 print:text-black font-mono">
                            Pump {issue.pump} ({issue.station})
                          </span>
                          <span className={`font-bold font-mono ${isSpotCheck ? 'text-sky-400' : 'text-rose-400'} print:text-black`}>
                            {displayStatus} • {downtime} min downtime
                          </span>
                        </div>
                        {isSpotCheck ? (
                          <div className="space-y-1">
                            <div className="font-bold text-slate-200 print:text-black">
                              Valves &amp; Seats Spot Check
                            </div>
                            {issue.checks && issue.checks.length > 0 && (
                              <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                                {issue.checks.map((chk) => (
                                  <span
                                    key={chk.hole}
                                    className={`px-1.5 py-0.5 rounded border ${
                                      chk.condition === 'BAD'
                                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-300 print:border-black print:text-black'
                                        : chk.condition === 'WATCH'
                                        ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 print:border-black print:text-black'
                                        : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 print:border-black print:text-black'
                                    }`}
                                  >
                                    H{chk.hole} {chk.condition}{chk.part ? ` (${chk.part})` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="font-bold text-slate-200 print:text-black">
                            {issue.category} — {issue.component}
                            {issue.holes && issue.holes.length > 0 && ` (Hole ${issue.holes.join(', ')})`}
                          </div>
                        )}
                        {issue.limitation && (
                          <div className="text-orange-300 print:text-black font-mono text-[11px]">
                            Limitation: {issue.limitation}
                          </div>
                        )}
                        {issue.notes && (
                          <div className="text-slate-400 print:text-black italic">
                            "{issue.notes}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. WATCH NEXT SHIFT */}
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-indigo-400 print:text-black border-b border-slate-800 print:border-black pb-1">
                3. Watch Next Shift ({watchItems.length})
              </h3>
              {watchItems.length === 0 ? (
                <p className="text-xs font-mono text-slate-400 print:text-black italic">
                  None
                </p>
              ) : (
                <div className="space-y-2 pt-1">
                  {watchItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-950 print:bg-white border border-indigo-500/40 print:border-black rounded-xl p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-100 print:text-black font-mono">
                          Pump {item.pump} ({item.station})
                        </span>
                        <span className="text-indigo-400 print:text-black font-mono font-bold">
                          WATCH ITEM
                        </span>
                      </div>
                      <div className="font-bold text-slate-200 print:text-black">
                        {item.category} — {item.component}
                        {item.holes && item.holes.length > 0 && ` (Hole ${item.holes.join(', ')})`}
                      </div>
                      {item.notes && (
                        <div className="text-slate-400 print:text-black italic">
                          "{item.notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. COMPLETED REPAIRS */}
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-emerald-400 print:text-black border-b border-slate-800 print:border-black pb-1">
                4. Completed Repairs ({completedRepairs.length})
              </h3>
              {completedRepairs.length === 0 ? (
                <p className="text-xs font-mono text-slate-400 print:text-black italic">
                  None recorded during this shift.
                </p>
              ) : (
                <div className="space-y-2 pt-1">
                  {completedRepairs.map((r) => (
                    <div
                      key={r.id}
                      className="bg-slate-950 print:bg-white border border-emerald-500/40 print:border-black rounded-xl p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-100 print:text-black font-mono">
                          Pump {r.pump} ({r.station})
                        </span>
                        <span className="font-bold font-mono text-emerald-400 print:text-black">
                          Downtime: {r.downtimeMinutes || 0} min
                        </span>
                      </div>
                      <div className="text-slate-300 print:text-black">
                        {r.category} — {r.component}
                        {r.holes && r.holes.length > 0 && ` (Hole ${r.holes.join(', ')})`}
                      </div>
                      {r.notes && (
                        <div className="text-slate-400 print:text-black italic">
                          "{r.notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. PUMP SWAPS */}
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 print:text-black border-b border-slate-800 print:border-black pb-1">
                5. Pump Swaps ({pumpSwaps.length})
              </h3>
              {pumpSwaps.length === 0 ? (
                <p className="text-xs font-mono text-slate-400 print:text-black italic">
                  None — lineup remained unchanged during this shift.
                </p>
              ) : (
                <div className="space-y-2 pt-1">
                  {pumpSwaps.map((s) => (
                    <div
                      key={s.id}
                      className="bg-slate-950 print:bg-white border border-amber-500/40 print:border-black rounded-xl p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-100 print:text-black font-mono">
                          {s.station}: Pump {s.replacedPump} → Pump {s.pump}
                        </span>
                        <span className="text-slate-400 print:text-black font-mono text-[11px]">
                          {new Date(s.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      {s.notes && (
                        <div className="text-slate-400 print:text-black italic">
                          "{s.notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 6. GENERAL SHIFT-WIDE HANDOFF NOTES */}
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 print:text-black border-b border-slate-800 print:border-black pb-1">
                6. General Shift Notes
              </h3>

              {/* Quick suggestions chips in app view */}
              <div className="flex flex-wrap gap-1.5 pb-1 print:hidden">
                {SHIFT_NOTE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      const updated = localShiftNotes.trim()
                        ? `${localShiftNotes.trim()}\n${chip}`
                        : chip;
                      handleSaveShiftNotes(updated);
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-mono cursor-pointer transition-colors"
                  >
                    + {chip}
                  </button>
                ))}
              </div>

              <textarea
                rows={4}
                value={localShiftNotes}
                onChange={(e) => handleSaveShiftNotes(e.target.value)}
                placeholder="Enter shift-wide operational observations, water/fuel updates, spread notes..."
                className="w-full bg-slate-950 print:bg-white border border-slate-700 print:border-black rounded-xl p-3 text-sm font-mono text-slate-100 print:text-black focus:outline-none focus:border-amber-400 leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: STRUCTURED PUMP DOWN MODAL                                       */}
      {/* ========================================================================= */}
      {pumpDownModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-xs font-mono font-black uppercase tracking-widest text-rose-400">
                  {pumpDownModal.station}
                </span>
                <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight">
                  Record Pump Down
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Taking <strong className="text-amber-300">Pump {pumpDownModal.pump}</strong> down for maintenance
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPumpDownModal(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto py-3 space-y-4 flex-1 pr-1">
              {/* 1. Category Selection */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-black uppercase text-slate-300 tracking-wider block">
                  CATEGORY (SELECT ONE)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setDownCategory(cat);
                        if (cat === 'FLUID END') setDownComponent('PACKING');
                        else if (cat === 'POWER END') setDownComponent('CROSSHEAD');
                        else if (cat === 'ENGINE') setDownComponent('COOLANT / OVERHEAT');
                        else if (cat === 'TRANSMISSION / DRIVE') setDownComponent('TORQUE CONVERTER');
                        else setDownComponent('GENERAL');
                      }}
                      className={`min-h-[42px] px-2.5 py-2 rounded-xl font-bold text-xs uppercase tracking-tight text-center transition-all cursor-pointer ${
                        downCategory === cat
                          ? 'bg-rose-500 text-slate-950 font-black shadow-md shadow-rose-500/20'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Component Selection for Fluid End */}
              {downCategory === 'FLUID END' && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider block">
                    FLUID END COMPONENT
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {FLUID_END_COMPONENTS.map((comp) => (
                      <button
                        key={comp}
                        type="button"
                        onClick={() => setDownComponent(comp)}
                        className={`min-h-[40px] px-2 py-1.5 rounded-xl font-bold text-xs uppercase tracking-tight transition-all cursor-pointer ${
                          downComponent === comp
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

              {/* 3. Holes 1 to 5 Multi-select (For Fluid End) */}
              {downCategory === 'FLUID END' && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider">
                      HOLE / POSITION (MULTI-SELECT)
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      Selected: {downHoles.length > 0 ? `Hole ${downHoles.join(', ')}` : 'None'}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((h) => {
                      const isSelected = downHoles.includes(h);
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
                          {h}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Power End components */}
              {downCategory === 'POWER END' && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider block">
                    POWER END COMPONENT
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {POWER_END_COMPONENTS.map((comp) => (
                      <button
                        key={comp}
                        type="button"
                        onClick={() => setDownComponent(comp)}
                        className={`min-h-[40px] px-2 py-1.5 rounded-xl font-bold text-xs uppercase tracking-tight cursor-pointer ${
                          downComponent === comp
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
              {downCategory === 'ENGINE' && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider block">
                    ENGINE COMPONENT
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ENGINE_COMPONENTS.map((comp) => (
                      <button
                        key={comp}
                        type="button"
                        onClick={() => setDownComponent(comp)}
                        className={`min-h-[40px] px-2 py-1.5 rounded-xl font-bold text-xs uppercase tracking-tight cursor-pointer ${
                          downComponent === comp
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
              {downCategory === 'TRANSMISSION / DRIVE' && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-mono font-black uppercase text-amber-400 tracking-wider block">
                    TRANSMISSION COMPONENT
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {TRANSMISSION_COMPONENTS.map((comp) => (
                      <button
                        key={comp}
                        type="button"
                        onClick={() => setDownComponent(comp)}
                        className={`min-h-[40px] px-2 py-1.5 rounded-xl font-bold text-xs uppercase tracking-tight cursor-pointer ${
                          downComponent === comp
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
                      onClick={() => setDownNotes(chip)}
                      className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded text-[11px] cursor-pointer"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  value={downNotes}
                  onChange={(e) => setDownNotes(e.target.value)}
                  placeholder="Optional free-form notes..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Watch Next Shift toggle */}
              <label className="flex items-center gap-2 p-2.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={downWatchNext}
                  onChange={(e) => setDownWatchNext(e.target.checked)}
                  className="w-4 h-4 text-amber-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="text-xs font-bold text-slate-200">
                  Flag as "Watch Next Shift" item in handoff
                </span>
              </label>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPumpDownModal(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isSubmittingEvent}
                onClick={handleSubmitPumpDown}
                className="min-h-[44px] px-6 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-rose-600/25 flex items-center gap-2"
              >
                {isSubmittingEvent ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>RECORDING...</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
                    <span>RECORD PUMP DOWN</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DERATE PUMP                                                      */}
      {/* ========================================================================= */}
      {derateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-xs font-mono font-bold text-orange-400">
                  {derateModal.station}
                </span>
                <h3 className="text-lg font-black text-slate-100 uppercase">
                  Mark Pump {derateModal.pump} Derated
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDerateModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Reason for Derate:
                </label>
                <input
                  type="text"
                  value={derateReason}
                  onChange={(e) => setDerateReason(e.target.value)}
                  placeholder="e.g. Packing seep, High vibration, Turbo lag..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Max Rate / Pressure Limitation (Optional):
                </label>
                <input
                  type="text"
                  value={derateLimitation}
                  onChange={(e) => setDerateLimitation(e.target.value)}
                  placeholder="e.g. Max 8 bpm, Do not exceed 7,500 psi..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Notes (Optional):
                </label>
                <textarea
                  rows={2}
                  value={derateNotes}
                  onChange={(e) => setDerateNotes(e.target.value)}
                  placeholder="Additional operational instructions..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDerateModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isSubmittingEvent}
                onClick={handleSubmitDerate}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-xs uppercase rounded-xl"
              >
                MARK DERATED
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: WATCH ITEM                                                       */}
      {/* ========================================================================= */}
      {watchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-xs font-mono font-bold text-indigo-400">
                  {watchModal.station}
                </span>
                <h3 className="text-lg font-black text-slate-100 uppercase">
                  Flag Watch Item — Pump {watchModal.pump}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setWatchModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Category:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {['FLUID END', 'POWER END', 'ENGINE', 'ELECTRICAL'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setWatchCategory(c)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs uppercase ${
                        watchCategory === c
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-950 text-slate-300 border border-slate-800'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Component / Concern:
                </label>
                <input
                  type="text"
                  value={watchComponent}
                  onChange={(e) => setWatchComponent(e.target.value)}
                  placeholder="e.g. Packing seep, Discharge iron wear..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              {watchCategory === 'FLUID END' && (
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Hole (Optional):
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => toggleWatchHole(h)}
                        className={`py-1 rounded font-mono font-bold ${
                          watchHoles.includes(h)
                            ? 'bg-indigo-500 text-white'
                            : 'bg-slate-950 border border-slate-800 text-slate-300'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Observations / Handoff Note:
                </label>
                <textarea
                  rows={2}
                  value={watchNotes}
                  onChange={(e) => setWatchNotes(e.target.value)}
                  placeholder="e.g. Starting to seep but still running..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setWatchModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isSubmittingEvent}
                onClick={handleSubmitWatch}
                className="px-5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs uppercase rounded-xl"
              >
                SAVE WATCH ITEM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: PUMP OPERATIONAL HISTORY MODAL                                   */}
      {/* ========================================================================= */}
      {historyModalPump && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-amber-400">
                  OPERATIONAL LOG
                </span>
                <h3 className="text-xl font-black text-slate-100 uppercase">
                  Pump {historyModalPump} History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalPump(null)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto py-3 space-y-2.5 flex-1 pr-1">
              {historyPumpEvents.length === 0 ? (
                <div className="bg-slate-950 p-6 text-center text-xs text-slate-400 font-mono rounded-xl">
                  No recorded operational events for Pump {historyModalPump}.
                </div>
              ) : (
                historyPumpEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1 font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300">
                        {ev.date} ({ev.shift === 'day' ? 'Day' : 'Night'})
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 uppercase">
                        {ev.eventType === 'spot_check'
                          ? 'V&S SPOT CHECK'
                          : ev.eventType === 'pump_swap'
                          ? 'SWAP'
                          : ev.status}
                      </span>
                    </div>

                    {ev.eventType === 'spot_check' ? (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="text-xs font-bold text-amber-300">
                          Valves & Seats Spot Check
                        </div>
                        <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                          {ev.checks?.map((c) => (
                            <span
                              key={c.hole}
                              className={`px-1.5 py-0.5 rounded border ${
                                c.condition === 'GOOD'
                                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                                  : c.condition === 'WATCH'
                                  ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-300'
                                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300 font-bold'
                              }`}
                            >
                              H{c.hole} {c.condition}{c.part ? ` (${c.part})` : ''}
                            </span>
                          ))}
                        </div>
                        <div className="flex justify-end pt-0.5">
                          <button
                            type="button"
                            onClick={() => setSelectedSpotCheckDetail(ev)}
                            className="text-[10px] text-amber-400 hover:text-amber-300 underline font-bold cursor-pointer"
                          >
                            View Spot Check Details →
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="font-bold text-slate-200">
                        {ev.category} {ev.component ? `— ${ev.component}` : ''}
                        {ev.holes && ev.holes.length > 0 && ` (Hole ${ev.holes.join(', ')})`}
                      </div>
                    )}

                    {ev.downtimeMinutes !== null && ev.downtimeMinutes !== undefined && (
                      <div className="text-emerald-400 text-[11px]">
                        Downtime: {ev.downtimeMinutes} min
                      </div>
                    )}

                    {ev.notes && (
                      <div className="text-slate-400 italic text-[11px]">
                        "{ev.notes}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setHistoryModalPump(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: REPAIR / RETURN ACTION PROMPT                                     */}
      {/* ========================================================================= */}
      {actionPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div>
              <span className="text-xs font-mono font-bold text-amber-400">
                {actionPromptModal.station} • PUMP {actionPromptModal.pump}
              </span>
              <h3 className="text-lg font-black text-slate-100 uppercase mt-0.5">
                {actionPromptModal.type === 'repair'
                  ? 'Start Repair?'
                  : 'Return to Service?'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {actionPromptModal.type === 'repair'
                  ? 'Marks this pump as currently under active repair by mechanics.'
                  : 'Calculates total downtime and sets pump operational status back to Running.'}
              </p>
            </div>

            <div>
              <label className="text-[11px] font-mono font-bold text-slate-400 block mb-1">
                Optional Note / Action Taken:
              </label>
              <input
                type="text"
                autoFocus
                value={actionPromptNote}
                onChange={(e) => setActionPromptNote(e.target.value)}
                placeholder={
                  actionPromptModal.type === 'repair'
                    ? 'e.g. Mechanics pulled packing gland...'
                    : 'e.g. Packing repacked, pressure tested good...'
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-400 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActionPromptModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isSubmittingEvent}
                onClick={handleConfirmActionPrompt}
                className={`px-5 py-2 text-xs font-black uppercase rounded-xl cursor-pointer ${
                  actionPromptModal.type === 'repair'
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                }`}
              >
                {actionPromptModal.type === 'repair'
                  ? 'START REPAIR'
                  : 'RETURN TO SERVICE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: SWAP PUMP ON STATION                                             */}
      {/* ========================================================================= */}
      {swapModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-xs font-mono font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>SWAP PUMP ON {swapModal.station}</span>
                </span>
                <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight mt-0.5">
                  Change Station Pump
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  Currently assigned: <strong className="text-amber-300 font-bold">Pump {swapModal.currentPump || 'None'}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSwapModal(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="overflow-y-auto py-3 space-y-4 flex-1 pr-1">
              {/* Informational Guidance */}
              <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3 text-xs space-y-1 text-slate-300">
                <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>Station {swapModal.station} will be assigned the replacement pump.</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {swapModal.currentPump ? (
                    <>
                      If <strong className="text-amber-300">Pump {swapModal.currentPump}</strong> has an open problem (Down/Repairing), that failure stays attached to Pump {swapModal.currentPump} in Standby inventory so mechanics can keep working on it.
                    </>
                  ) : (
                    'Assign a standby pump to this empty spread station.'
                  )}
                </p>
              </div>

              {/* Select from Available Standby Pumps on Location */}
              <div className="space-y-2">
                <label className="text-[11px] font-mono font-black uppercase text-slate-300 tracking-wider flex items-center justify-between">
                  <span>AVAILABLE STANDBY PUMPS ({standbyPumps.length})</span>
                  <span className="text-slate-500 font-normal">Tap to select</span>
                </label>

                {standbyPumps.length === 0 ? (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-400 font-mono">
                    No standby pumps currently in directory. Enter a replacement pump number below.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {standbyPumps.map((pumpNum) => {
                      const isSelected = selectedReplacementPump.trim().toLowerCase() === pumpNum.trim().toLowerCase() && !customReplacementInput.trim();
                      const pumpInfo = getPumpCurrentStatus(pumpNum, date, shift);
                      const hasOpenIssue = pumpInfo.status === 'DOWN' || pumpInfo.status === 'REPAIRING';

                      return (
                        <button
                          key={pumpNum}
                          type="button"
                          onClick={() => {
                            setSelectedReplacementPump(pumpNum);
                            setCustomReplacementInput('');
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[58px] ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black'
                              : 'bg-slate-950 hover:bg-slate-850 border-slate-800 hover:border-slate-700 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-black">
                              PUMP {pumpNum}
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 stroke-[3]" />
                            )}
                          </div>
                          <span className={`text-[10px] font-mono uppercase ${
                            isSelected
                              ? 'text-slate-900 font-bold'
                              : hasOpenIssue
                              ? 'text-rose-400 font-bold'
                              : 'text-slate-500'
                          }`}>
                            {hasOpenIssue ? `${pumpInfo.status} ISSUE` : 'STANDBY READY'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Or Enter Custom / New Pump Number */}
              <div className="space-y-1.5 bg-slate-950 border border-slate-800 rounded-xl p-3">
                <label className="text-[11px] font-mono font-bold uppercase text-slate-400 block">
                  OR ENTER REPLACEMENT PUMP NUMBER:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customReplacementInput}
                    onChange={(e) => {
                      setCustomReplacementInput(e.target.value);
                      if (e.target.value.trim()) {
                        setSelectedReplacementPump('');
                      }
                    }}
                    placeholder="e.g. 184"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-400 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                  />
                  {customReplacementInput && (
                    <button
                      type="button"
                      onClick={() => setCustomReplacementInput('')}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Selected Swap Preview Card */}
              <div className="bg-slate-950 border border-indigo-500/40 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    SWAP PREVIEW:
                  </span>
                  <div className="flex items-center gap-2 mt-0.5 font-mono text-sm">
                    <span className="font-black text-slate-200">
                      {swapModal.currentPump ? `Pump ${swapModal.currentPump}` : 'Empty'}
                    </span>
                    <ArrowRight className="w-4 h-4 text-amber-400" />
                    <span className="font-black text-amber-400">
                      {customReplacementInput.trim() ? `Pump ${customReplacementInput.trim()}` : selectedReplacementPump.trim() ? `Pump ${selectedReplacementPump.trim()}` : '(Select a pump)'}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40">
                  {swapModal.station}
                </span>
              </div>

              {/* Optional Swap Notes */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-bold uppercase text-slate-300 block">
                  OPTIONAL SWAP NOTE / REASON:
                </label>
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {[
                    'Blown packing - swapped to standby',
                    'Swapped due to fluid end issue',
                    'Power end failure swap',
                    'Rotation to cold standby',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setSwapNotes(chip)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-mono cursor-pointer transition-colors"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={swapNotes}
                  onChange={(e) => setSwapNotes(e.target.value)}
                  placeholder="e.g. Swapped out due to blown packing on Hole 3"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSwapModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={
                  isSubmittingSwap ||
                  (!customReplacementInput.trim() && !selectedReplacementPump.trim()) ||
                  (customReplacementInput.trim().toLowerCase() === swapModal.currentPump.trim().toLowerCase()) ||
                  (selectedReplacementPump.trim().toLowerCase() === swapModal.currentPump.trim().toLowerCase() && !customReplacementInput.trim())
                }
                onClick={handleConfirmSwap}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {isSubmittingSwap
                    ? 'SWAPPING...'
                    : `CONFIRM SWAP → PUMP ${customReplacementInput.trim() || selectedReplacementPump.trim() || '...'}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT ACTIVE SPREAD ISSUES MODAL */}
      <ActiveSpreadIssuesPrintModal
        isOpen={showPrintIssuesModal}
        onClose={() => setShowPrintIssuesModal(false)}
        initialDate={date}
        initialShift={shift}
      />

      {/* EDIT ISSUE IN PLACE MODAL */}
      {editIssueModalEvent && (
        <EditPumpIssueModal
          event={editIssueModalEvent}
          onClose={() => setEditIssueModalEvent(null)}
          onSave={async (eventId, updates) => {
            await updatePumpOpEvent(eventId, updates);
          }}
          technicianName={technicianName}
        />
      )}

      {/* SPOT CHECK MODAL (VALVES & SEATS) */}
      {spotCheckModal && (
        <SpotCheckModal
          station={spotCheckModal.station}
          pump={spotCheckModal.pump}
          existingEvent={spotCheckModal.existingEvent}
          onClose={() => setSpotCheckModal(null)}
          onSaveSpotCheck={handleSaveSpotCheck}
          onCreateLinkedIssue={handleCreateLinkedIssueFromSpotCheck}
          technicianName={technicianName}
        />
      )}

      {/* SPOT CHECK DETAIL MODAL */}
      {selectedSpotCheckDetail && (
        <SpotCheckDetailModal
          event={selectedSpotCheckDetail}
          onClose={() => setSelectedSpotCheckDetail(null)}
          onEdit={(ev) => {
            setSelectedSpotCheckDetail(null);
            handleOpenSpotCheck(ev.station, ev.pump, ev);
          }}
        />
      )}

      {/* FINALIZED HANDOFF POPUP ALERT */}
      {showFinalizeSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-slate-950 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-2xl animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
          <span>Handoff Snapshot Finalized &amp; Synced!</span>
        </div>
      )}
    </div>
  );
};
