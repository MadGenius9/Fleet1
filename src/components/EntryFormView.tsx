import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useFleet, sortStations, extractStationNumber, sortPumpList } from '../context/FleetContext';
import type { ShiftType } from '../types';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  CloudCheck,
  Wifi,
  WifiOff,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sliders,
  FileText,
  Lock,
  Unlock,
  AlertCircle,
  X,
  Search,
  ChevronRight,
  ArrowRight,
  Plus,
  Sun,
  Moon
} from 'lucide-react';

interface EntryFormViewProps {
  initialDate?: string;
  initialShift?: ShiftType;
  initialSection?: 'lineup' | 'standby' | 'all';
  initialPump?: string;
  onDone: () => void;
  onGoToLineup: () => void;
}

export const EntryFormView: React.FC<EntryFormViewProps> = ({
  initialDate,
  initialShift,
  initialSection,
  initialPump,
  onDone,
  onGoToLineup,
}) => {
  const {
    fleet,
    todayDateStr,
    allLogs,
    activeShift,
    setActiveShift,
    syncStatus,
    queuedCount,
    technicianName,
    setTechnicianName,
    saveSingleReading,
    getPreviousReading,
    finalizeDailySheet,
    reopenDailySheet,
    isSheetFinalized,
    getPumpsForStation,
    getStationForPump,
    swapPumpOnStation,
    moveReadingPump,
    addPumpToDirectory,
    getPumpCurrentStatus,
    isShiftTransitionAvailable,
    detectedShift,
    detectedOpDate,
    acceptShiftTransition,
    dismissShiftTransition,
  } = useFleet();

  const [date, setDate] = useState<string>(initialDate || todayDateStr);
  const [shift, setShift] = useState<ShiftType>(initialShift || activeShift || 'day');

  // Active section view: 'lineup' (stations 1-24), 'standby' (standby pumps on pad), or 'all'
  const [entrySection, setEntrySection] = useState<'lineup' | 'standby' | 'all'>(
    initialSection || 'lineup'
  );

  // Sync section if initialSection changes (e.g. from HomeView Enter Standby Hours)
  useEffect(() => {
    if (initialSection) {
      setEntrySection(initialSection);
    }
  }, [initialSection]);

  // Raw input values per station: stationName -> { pumpHours, deckEngHours, notes }
  const [stationInputs, setStationInputs] = useState<
    Record<string, { pumpHours: string; deckEngHours: string; notes: string }>
  >({});
  const stationInputsRef = useRef(stationInputs);
  stationInputsRef.current = stationInputs;

  // Standby input values per pump: pumpNumber -> { pumpHours, deckEngHours, notes }
  const [standbyInputs, setStandbyInputs] = useState<
    Record<string, { pumpHours: string; deckEngHours: string; notes: string }>
  >({});
  const standbyInputsRef = useRef(standbyInputs);
  standbyInputsRef.current = standbyInputs;

  // Autosave status per station
  const [saveStatus, setSaveStatus] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'queued' | 'error'>
  >({});

  // Autosave status per standby pump
  const [standbySaveStatus, setStandbySaveStatus] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'queued' | 'error'>
  >({});

  // User confirmed intentional low or jump readings for stations
  const [confirmedWarnings, setConfirmedWarnings] = useState<
    Record<string, { pumpHours?: boolean; deckEngHours?: boolean }>
  >({});

  // User confirmed intentional low or jump readings for standby pumps
  const [standbyConfirmedWarnings, setStandbyConfirmedWarnings] = useState<
    Record<string, { pumpHours?: boolean; deckEngHours?: boolean }>
  >({});

  // Finalize Confirmation Modal
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Technician Name Prompt modal if name is not set
  const [showTechPrompt, setShowTechPrompt] = useState(() => !technicianName);
  const [techInputVal, setTechInputVal] = useState(technicianName || '');

  // Expanded notes state per station
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  // Expanded notes state per standby pump
  const [expandedStandbyNotes, setExpandedStandbyNotes] = useState<Record<string, boolean>>({});

  // Add Standby Pump Modal state
  const [showAddStandbyModal, setShowAddStandbyModal] = useState(false);
  const [newStandbyPumpVal, setNewStandbyPumpVal] = useState('');
  const [addStandbyError, setAddStandbyError] = useState<string | null>(null);
  const [isAddingStandby, setIsAddingStandby] = useState(false);
  const [quickAddStandbyVal, setQuickAddStandbyVal] = useState('');
  const [isAddingQuickStandby, setIsAddingQuickStandby] = useState(false);

  // Autosave debounce timers
  const standbyDebounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const stationDebounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // 1. CHANGE PUMP MODAL STATE
  const [changePumpTarget, setChangePumpTarget] = useState<{
    stationName: string;
    currentPump: string;
    searchTerm: string;
  } | null>(null);

  // 2. CONFLICT MODAL STATE (Selected pump is assigned to another station)
  const [moveConflictTarget, setMoveConflictTarget] = useState<{
    stationName: string;
    currentPump: string;
    selectedPump: string;
    otherStation: string;
  } | null>(null);

  // 3. READINGS DECISION MODAL STATE (Readings already entered or typed today)
  const [readingsDecisionTarget, setReadingsDecisionTarget] = useState<{
    stationName: string;
    currentPump: string;
    selectedPump: string;
    displayPumpHours: string;
    displayDeckHours: string;
    pumpHoursVal: number | null;
    deckHoursVal: number | null;
    notesVal: string;
  } | null>(null);

  // 4. ASSIGN UNASSIGNED SPREAD STATION MODAL STATE
  const [assignUnassignedStationModal, setAssignUnassignedStationModal] = useState(false);

  // 5. INLINE ADD PUMP STATE INSIDE CHANGE PUMP PICKER
  const [showAddPumpInline, setShowAddPumpInline] = useState(false);
  const [newPumpInputVal, setNewPumpInputVal] = useState('');
  const [addPumpError, setAddPumpError] = useState<string | null>(null);
  const [addPumpDuplicateMatch, setAddPumpDuplicateMatch] = useState<string | null>(null);
  const [isAddingPump, setIsAddingPump] = useState(false);

  // Determine active assigned stations in sorted station order (1, 2, 3...)
  const activeStations = useMemo(() => {
    const list = fleet.stations.filter((st) => {
      const assigned = getPumpsForStation(st);
      if (assigned.length > 0) return true;
      // Also keep if this station has a logged reading for today
      return allLogs.some(
        (l) => l.date === date && l.stationNumber === st && (l.pumpHours !== null || l.deckEngHours !== null)
      );
    });
    return sortStations(list);
  }, [fleet.stations, getPumpsForStation, allLogs, date]);

  // Stations in fleet that are not currently active on the walk
  const unassignedSpreadStations = useMemo(() => {
    const activeSet = new Set(activeStations);
    const unassigned = fleet.stations.filter((st) => !activeSet.has(st));
    return sortStations(unassigned);
  }, [fleet.stations, activeStations]);

  // Calculate standby vs assigned pumps for both the pump picker modal and standby entry tab
  const { standbyPumps, assignedPumps } = useMemo(() => {
    const allDirPumps = fleet.pumps || [];
    const assignedList: Array<{ pump: string; station: string }> = [];
    const assignedPumpsSet = new Set<string>();

    Object.entries(fleet.stationPumps || {}).forEach(([stName, pList]) => {
      if (Array.isArray(pList)) {
        pList.forEach((p) => {
          if (p) {
            assignedPumpsSet.add(p.trim().toLowerCase());
            assignedList.push({ pump: p, station: stName });
          }
        });
      }
    });

    const standbyList = allDirPumps.filter(
      (p) => !assignedPumpsSet.has(p.trim().toLowerCase())
    );

    // Also include any pump that has a standby log in allLogs for this date/shift
    allLogs.forEach((l) => {
      if (
        l.date === date &&
        (l.shift === shift || (!l.shift && shift === 'day')) &&
        l.stationNumber &&
        l.stationNumber.toLowerCase().includes('standby') &&
        l.pumpNumber
      ) {
        const cleanP = l.pumpNumber.trim();
        if (cleanP && !assignedPumpsSet.has(cleanP.toLowerCase()) && !standbyList.some((p) => p.trim().toLowerCase() === cleanP.toLowerCase())) {
          standbyList.push(cleanP);
        }
      }
    });

    // Sort natural/numeric
    const sortedStandby = sortPumpList(standbyList);
    assignedList.sort((a, b) => {
      const numA = extractStationNumber(a.station);
      const numB = extractStationNumber(b.station);
      if (numA !== numB) return numA - numB;
      return a.pump.localeCompare(b.pump, undefined, { numeric: true });
    });

    return { standbyPumps: sortedStandby, assignedPumps: assignedList };
  }, [fleet.pumps, fleet.stationPumps, allLogs, date, shift]);

  // Filtered pumps by search term in modal
  const filteredStandbyPumps = useMemo(() => {
    if (!changePumpTarget?.searchTerm) return standbyPumps;
    const term = changePumpTarget.searchTerm.trim().toLowerCase();
    return standbyPumps.filter((p) => p.toLowerCase().includes(term));
  }, [standbyPumps, changePumpTarget?.searchTerm]);

  const filteredAssignedPumps = useMemo(() => {
    if (!changePumpTarget?.searchTerm) return assignedPumps;
    const term = changePumpTarget.searchTerm.trim().toLowerCase();
    return assignedPumps.filter(
      (item) => item.pump.toLowerCase().includes(term) || item.station.toLowerCase().includes(term)
    );
  }, [assignedPumps, changePumpTarget?.searchTerm]);

  // Safely flush any typed inputs for the current shift before switching shifts
  const flushCurrentShiftInputs = useCallback(async () => {
    const curStations = stationInputsRef.current;
    const curStandby = standbyInputsRef.current;

    // 1. Flush spread stations
    for (const st of activeStations) {
      const input = curStations[st];
      if (!input) continue;
      const pump = getPumpsForStation(st)[0];
      if (!pump) continue;
      const pHours = input.pumpHours.trim() !== '' ? Number(input.pumpHours) : null;
      const dHours = input.deckEngHours.trim() !== '' ? Number(input.deckEngHours) : null;
      const notes = input.notes || '';
      if (pHours !== null || dHours !== null || notes.trim() !== '') {
        await saveSingleReading({
          date,
          shift,
          stationNumber: st,
          pumpNumber: pump,
          pumpHours: pHours,
          deckEngHours: dHours,
          notes,
        });
      }
    }

    // 2. Flush standby pumps
    for (const pump of standbyPumps) {
      const input = curStandby[pump];
      if (!input) continue;
      const pHours = input.pumpHours.trim() !== '' ? Number(input.pumpHours) : null;
      const dHours = input.deckEngHours.trim() !== '' ? Number(input.deckEngHours) : null;
      const notes = input.notes || '';
      if (pHours !== null || dHours !== null || notes.trim() !== '') {
        await saveSingleReading({
          date,
          shift,
          stationNumber: 'Standby',
          pumpNumber: pump,
          pumpHours: pHours,
          deckEngHours: dHours,
          notes,
        });
      }
    }
  }, [activeStations, date, getPumpsForStation, saveSingleReading, shift, standbyPumps]);

  const handleSwitchShift = useCallback(
    async (newShift: ShiftType) => {
      if (newShift === shift) return;
      await flushCurrentShiftInputs();
      setShift(newShift);
      setActiveShift(newShift);
    },
    [flushCurrentShiftInputs, setActiveShift, shift]
  );

  const lastDateShiftRef = useRef<string>(`${date}_${shift}`);

  // Load existing readings for the chosen date and shift
  useEffect(() => {
    const isNewDateOrShift = lastDateShiftRef.current !== `${date}_${shift}`;
    lastDateShiftRef.current = `${date}_${shift}`;

    const dateLogs = allLogs.filter(
      (l) => l.date === date && (l.shift === shift || (!l.shift && shift === 'day'))
    );
    const initialMap: Record<string, { pumpHours: string; deckEngHours: string; notes: string }> = {};

    activeStations.forEach((st) => {
      const pump = getPumpsForStation(st)[0];
      if (!pump) return;

      const matched = dateLogs.find(
        (l) => l.stationNumber === st && l.pumpNumber.trim().toLowerCase() === pump.trim().toLowerCase()
      );

      if (matched) {
        initialMap[st] = {
          pumpHours: matched.pumpHours !== null && matched.pumpHours !== undefined ? String(matched.pumpHours) : '',
          deckEngHours: matched.deckEngHours !== null && matched.deckEngHours !== undefined ? String(matched.deckEngHours) : '',
          notes: matched.notes || matched.info || '',
        };
      } else {
        initialMap[st] = {
          pumpHours: '',
          deckEngHours: '',
          notes: '',
        };
      }
    });

    // Always preserve any unsaved typed inputs so shift transitions never wipe work
    setStationInputs((prev) => {
      const nextMap: Record<string, { pumpHours: string; deckEngHours: string; notes: string }> = { ...initialMap };
      Object.keys(prev).forEach((st) => {
        if (nextMap[st] && prev[st]) {
          if (prev[st].pumpHours !== '' && nextMap[st].pumpHours === '') {
            nextMap[st].pumpHours = prev[st].pumpHours;
          }
          if (prev[st].deckEngHours !== '' && nextMap[st].deckEngHours === '') {
            nextMap[st].deckEngHours = prev[st].deckEngHours;
          }
          if (prev[st].notes !== '' && nextMap[st].notes === '') {
            nextMap[st].notes = prev[st].notes;
          }
        }
      });
      return nextMap;
    });

    // Populate standby pumps inputs
    const initialStandbyMap: Record<string, { pumpHours: string; deckEngHours: string; notes: string }> = {};
    standbyPumps.forEach((p) => {
      const matched = dateLogs.find(
        (l) =>
          l.stationNumber.toLowerCase().includes('standby') &&
          l.pumpNumber.trim().toLowerCase() === p.trim().toLowerCase()
      );

      if (matched) {
        initialStandbyMap[p] = {
          pumpHours: matched.pumpHours !== null && matched.pumpHours !== undefined ? String(matched.pumpHours) : '',
          deckEngHours: matched.deckEngHours !== null && matched.deckEngHours !== undefined ? String(matched.deckEngHours) : '',
          notes: matched.notes || matched.info || '',
        };
      } else {
        initialStandbyMap[p] = {
          pumpHours: '',
          deckEngHours: '',
          notes: '',
        };
      }
    });

    // Always preserve any unsaved typed standby inputs so shift transitions never wipe work
    setStandbyInputs((prev) => {
      const nextMap: Record<string, { pumpHours: string; deckEngHours: string; notes: string }> = { ...initialStandbyMap };
      Object.keys(prev).forEach((p) => {
        if (nextMap[p] && prev[p]) {
          if (prev[p].pumpHours !== '' && nextMap[p].pumpHours === '') {
            nextMap[p].pumpHours = prev[p].pumpHours;
          }
          if (prev[p].deckEngHours !== '' && nextMap[p].deckEngHours === '') {
            nextMap[p].deckEngHours = prev[p].deckEngHours;
          }
          if (prev[p].notes !== '' && nextMap[p].notes === '') {
            nextMap[p].notes = prev[p].notes;
          }
        }
      });
      return nextMap;
    });
  }, [date, shift, activeStations, standbyPumps, allLogs, getPumpsForStation]);

  // Finalization state for selected date and shift
  const finalizationInfo = useMemo(() => isSheetFinalized(date, shift), [isSheetFinalized, date, shift]);

  // Handle Input Changes
  const handleInputChange = (
    stationName: string,
    field: 'pumpHours' | 'deckEngHours' | 'notes',
    value: string
  ) => {
    setStationInputs((prev) => ({
      ...prev,
      [stationName]: {
        ...(prev[stationName] || { pumpHours: '', deckEngHours: '', notes: '' }),
        [field]: value,
      },
    }));

    // Reset warning confirmation if user changes number
    if (field === 'pumpHours' || field === 'deckEngHours') {
      setConfirmedWarnings((prev) => ({
        ...prev,
        [stationName]: {
          ...(prev[stationName] || {}),
          [field]: false,
        },
      }));
    }

    if (stationDebounceTimers.current[stationName]) {
      clearTimeout(stationDebounceTimers.current[stationName]);
    }
    stationDebounceTimers.current[stationName] = setTimeout(() => {
      handleAutosave(stationName);
    }, 750);
  };

  // Autosave handler when field loses focus (or note changed)
  const handleAutosave = async (stationName: string) => {
    if (stationDebounceTimers.current[stationName]) {
      clearTimeout(stationDebounceTimers.current[stationName]);
      delete stationDebounceTimers.current[stationName];
    }
    const pump = getPumpsForStation(stationName)[0];
    if (!pump) return;

    const current = stationInputsRef.current[stationName] || stationInputs[stationName] || { pumpHours: '', deckEngHours: '', notes: '' };

    // Blank must not become zero! Convert empty string to null
    const cleanPumpHours = current.pumpHours.trim() === '' ? null : Number(current.pumpHours);
    const cleanDeckHours = current.deckEngHours.trim() === '' ? null : Number(current.deckEngHours);

    // If both readings and notes are blank, and no record exists, skip saving
    const existing = allLogs.find(
      (l) =>
        l.date === date &&
        (l.shift === shift || (!l.shift && shift === 'day')) &&
        l.stationNumber === stationName &&
        l.pumpNumber === pump
    );
    if (cleanPumpHours === null && cleanDeckHours === null && !current.notes.trim() && !existing) {
      return;
    }

    setSaveStatus((prev) => ({ ...prev, [stationName]: 'saving' }));

    try {
      const res = await saveSingleReading({
        date,
        shift,
        stationNumber: stationName,
        pumpNumber: pump,
        pumpHours: cleanPumpHours,
        deckEngHours: cleanDeckHours,
        notes: current.notes.trim(),
      });

      setSaveStatus((prev) => ({ ...prev, [stationName]: res.status }));

      // Clear "saved" badge after 2.5 seconds
      if (res.status === 'saved') {
        setTimeout(() => {
          setSaveStatus((prev) => (prev[stationName] === 'saved' ? { ...prev, [stationName]: 'idle' } : prev));
        }, 2500);
      }
    } catch (err) {
      console.error('Autosave error for station:', stationName, err);
      setSaveStatus((prev) => ({ ...prev, [stationName]: 'error' }));
    }
  };

  // Station completion checks: A station is complete if at least pump hours reading is recorded
  const isStationComplete = (stationName: string) => {
    const val = stationInputs[stationName];
    if (!val) return false;
    const hasPumpHours = val.pumpHours.trim() !== '' && !isNaN(Number(val.pumpHours));
    return hasPumpHours;
  };

  const completedCount = useMemo(() => {
    return activeStations.filter((st) => isStationComplete(st)).length;
  }, [activeStations, stationInputs]);

  const totalCount = activeStations.length;
  const isAllComplete = totalCount > 0 && completedCount === totalCount;

  // Missing stations list
  const missingStations = useMemo(() => {
    return activeStations.filter((st) => !isStationComplete(st));
  }, [activeStations, stationInputs]);

  // Handle Standby Input Changes
  const handleStandbyInputChange = (
    pumpNumber: string,
    field: 'pumpHours' | 'deckEngHours' | 'notes',
    value: string
  ) => {
    setStandbyInputs((prev) => ({
      ...prev,
      [pumpNumber]: {
        ...(prev[pumpNumber] || { pumpHours: '', deckEngHours: '', notes: '' }),
        [field]: value,
      },
    }));

    if (field === 'pumpHours' || field === 'deckEngHours') {
      setStandbyConfirmedWarnings((prev) => ({
        ...prev,
        [pumpNumber]: {
          ...(prev[pumpNumber] || {}),
          [field]: false,
        },
      }));
    }

    if (standbyDebounceTimers.current[pumpNumber]) {
      clearTimeout(standbyDebounceTimers.current[pumpNumber]);
    }
    standbyDebounceTimers.current[pumpNumber] = setTimeout(() => {
      handleStandbyAutosave(pumpNumber);
    }, 750);
  };

  // Autosave handler for standby pump
  const handleStandbyAutosave = async (pumpNumber: string) => {
    if (standbyDebounceTimers.current[pumpNumber]) {
      clearTimeout(standbyDebounceTimers.current[pumpNumber]);
      delete standbyDebounceTimers.current[pumpNumber];
    }

    const current = standbyInputsRef.current[pumpNumber] || standbyInputs[pumpNumber] || { pumpHours: '', deckEngHours: '', notes: '' };

    const cleanPumpHours = current.pumpHours.trim() === '' ? null : Number(current.pumpHours);
    const cleanDeckHours = current.deckEngHours.trim() === '' ? null : Number(current.deckEngHours);

    const existing = allLogs.find(
      (l) =>
        l.date === date &&
        (l.shift === shift || (!l.shift && shift === 'day')) &&
        l.stationNumber.toLowerCase().includes('standby') &&
        l.pumpNumber.trim().toLowerCase() === pumpNumber.trim().toLowerCase()
    );

    if (cleanPumpHours === null && cleanDeckHours === null && !current.notes.trim() && !existing) {
      return;
    }

    setStandbySaveStatus((prev) => ({ ...prev, [pumpNumber]: 'saving' }));

    try {
      const res = await saveSingleReading({
        date,
        shift,
        stationNumber: 'Standby',
        pumpNumber,
        pumpHours: cleanPumpHours,
        deckEngHours: cleanDeckHours,
        notes: current.notes.trim(),
      });

      setStandbySaveStatus((prev) => ({ ...prev, [pumpNumber]: res.status }));

      if (res.status === 'saved') {
        setTimeout(() => {
          setStandbySaveStatus((prev) => (prev[pumpNumber] === 'saved' ? { ...prev, [pumpNumber]: 'idle' } : prev));
        }, 2500);
      }
    } catch (err) {
      console.error('Autosave error for standby pump:', pumpNumber, err);
      setStandbySaveStatus((prev) => ({ ...prev, [pumpNumber]: 'error' }));
    }
  };

  const isStandbyComplete = (pump: string) => {
    const val = standbyInputs[pump];
    if (!val) return false;
    const hasPump = val.pumpHours.trim() !== '' && !isNaN(Number(val.pumpHours));
    const hasDeck = val.deckEngHours.trim() !== '' && !isNaN(Number(val.deckEngHours));
    return hasPump || hasDeck;
  };

  const completedStandbyCount = useMemo(() => {
    return standbyPumps.filter((p) => isStandbyComplete(p)).length;
  }, [standbyPumps, standbyInputs]);

  const totalStandbyCount = standbyPumps.length;
  const isAllStandbyComplete = totalStandbyCount > 0 && completedStandbyCount === totalStandbyCount;

  const missingStandbyPumps = useMemo(() => {
    return standbyPumps.filter((p) => !isStandbyComplete(p));
  }, [standbyPumps, standbyInputs]);

  const scrollToStandbyPump = (pump: string) => {
    const elem = document.getElementById(`standby-row-${pump}`);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      elem.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => {
        elem.classList.remove('ring-2', 'ring-amber-400');
      }, 1500);
    }
    const input = document.getElementById(`input-pump-standby-${pump}`);
    if (input) {
      input.focus();
    }
  };

  const handleStandbyKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    pumpIndex: number,
    field: 'pumpHours' | 'deckEngHours',
    currentPump: string
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'pumpHours') {
        const deckInput = document.getElementById(`input-deck-standby-${currentPump}`);
        deckInput?.focus();
      } else {
        const nextPump = standbyPumps[pumpIndex + 1];
        if (nextPump) {
          const nextPumpInput = document.getElementById(`input-pump-standby-${nextPump}`);
          nextPumpInput?.focus();
          nextPumpInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  };

  // Jump to Station
  const scrollToStation = (stationName: string) => {
    const num = extractStationNumber(stationName);
    const elem = document.getElementById(`station-row-${num}`);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      elem.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => {
        elem.classList.remove('ring-2', 'ring-amber-400');
      }, 1500);
    }
  };

  // Auto-jump to initialPump if provided (e.g. from Home or Inventory)
  useEffect(() => {
    if (initialPump) {
      const isStandby = standbyPumps.some((p) => p.trim().toLowerCase() === initialPump.trim().toLowerCase());
      if (isStandby) {
        setEntrySection('standby');
        setTimeout(() => {
          scrollToStandbyPump(initialPump.trim());
        }, 250);
      } else {
        const station = getStationForPump(initialPump);
        if (station) {
          setEntrySection('lineup');
          setTimeout(() => {
            scrollToStation(station);
          }, 250);
        }
      }
    }
  }, [initialPump, standbyPumps, getStationForPump]);

  // Finalize sheet
  const handleFinalize = async () => {
    setIsFinalizing(true);
    try {
      await flushCurrentShiftInputs();
      await finalizeDailySheet(date, shift);
      setShowFinalizeModal(false);
    } catch (err) {
      console.error('Finalize error:', err);
    } finally {
      setIsFinalizing(false);
    }
  };

  // Reopen sheet
  const handleReopen = async () => {
    await reopenDailySheet(date, shift);
  };

  // Keyboard navigation: Enter on Pump Hours focuses Deck Hours, Enter on Deck Hours focuses next station Pump Hours
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    stationIndex: number,
    field: 'pumpHours' | 'deckEngHours',
    currentStationName: string
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'pumpHours') {
        const deckInput = document.getElementById(`input-deck-${currentStationName}`);
        deckInput?.focus();
      } else {
        const nextStation = activeStations[stationIndex + 1];
        if (nextStation) {
          const nextPumpInput = document.getElementById(`input-pump-${nextStation}`);
          nextPumpInput?.focus();
          nextPumpInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  };

  // 1. Open Change Pump modal for a station
  const handleOpenChangePump = (stationName: string, currentPump: string) => {
    setChangePumpTarget({
      stationName,
      currentPump,
      searchTerm: '',
    });
    setShowAddPumpInline(false);
    setNewPumpInputVal('');
    setAddPumpError(null);
    setAddPumpDuplicateMatch(null);
    setIsAddingPump(false);
  };

  // Close Change Pump modal
  const handleCloseChangePump = () => {
    setChangePumpTarget(null);
    setShowAddPumpInline(false);
    setNewPumpInputVal('');
    setAddPumpError(null);
    setAddPumpDuplicateMatch(null);
    setIsAddingPump(false);
  };

  // Add & Use a newly entered pump
  const handleAddAndUsePump = async () => {
    if (!changePumpTarget || isAddingPump) return;

    const cleanPump = newPumpInputVal.trim();
    if (!cleanPump) {
      setAddPumpError('PUMP NUMBER REQUIRED');
      return;
    }

    // Check if pump already exists in directory (case-insensitive)
    const existingMatch = fleet.pumps.find(
      (p) => p.trim().toLowerCase() === cleanPump.toLowerCase()
    );

    if (existingMatch) {
      setAddPumpError(`PUMP ${existingMatch} ALREADY EXISTS`);
      setAddPumpDuplicateMatch(existingMatch);
      return;
    }

    setIsAddingPump(true);
    try {
      // 1. Add to fleet directory via existing FleetContext function
      await addPumpToDirectory(cleanPump);

      // Clean inline state
      setShowAddPumpInline(false);
      setNewPumpInputVal('');
      setAddPumpError(null);
      setAddPumpDuplicateMatch(null);

      // 2. Immediately continue normal pump-change / reading-safety workflow!
      const { stationName, currentPump } = changePumpTarget;
      proceedToReadingsCheck(stationName, currentPump, cleanPump);
    } catch (err) {
      console.error('Failed to add pump to directory:', err);
      setAddPumpError('COULD NOT ADD PUMP — TRY AGAIN');
    } finally {
      setIsAddingPump(false);
    }
  };

  // Use an existing pump discovered through the duplicate check
  const handleUseExistingPump = (existingPump: string) => {
    if (!changePumpTarget) return;
    setShowAddPumpInline(false);
    setNewPumpInputVal('');
    setAddPumpError(null);
    setAddPumpDuplicateMatch(null);

    // Send through normal selection flow
    handleSelectPumpFromPicker(existingPump);
  };

  // 2. Select pump from picker modal
  const handleSelectPumpFromPicker = (selectedPump: string) => {
    if (!changePumpTarget) return;
    const { stationName, currentPump } = changePumpTarget;

    // If tapped the same pump, just close
    if (selectedPump.trim().toLowerCase() === currentPump.trim().toLowerCase()) {
      setChangePumpTarget(null);
      return;
    }

    // Check if pump is currently assigned to another station (Requirement 4)
    const otherStation = getStationForPump(selectedPump);
    if (otherStation && otherStation.trim().toLowerCase() !== stationName.trim().toLowerCase()) {
      setMoveConflictTarget({
        stationName,
        currentPump,
        selectedPump,
        otherStation,
      });
      return;
    }

    // Direct check for entered readings on current station
    proceedToReadingsCheck(stationName, currentPump, selectedPump);
  };

  // 3. Confirm move pump from other station
  const handleConfirmMoveFromOtherStation = () => {
    if (!moveConflictTarget) return;
    const { stationName, currentPump, selectedPump } = moveConflictTarget;
    setMoveConflictTarget(null);
    proceedToReadingsCheck(stationName, currentPump, selectedPump);
  };

  // 4. Check whether today's readings exist or unsaved values were typed
  const proceedToReadingsCheck = (
    stationName: string,
    currentPump: string,
    selectedPump: string
  ) => {
    const existingLog = allLogs.find(
      (l) =>
        l.date === date &&
        (l.shift === shift || (!l.shift && shift === 'day')) &&
        l.stationNumber === stationName &&
        l.pumpNumber.trim().toLowerCase() === currentPump.trim().toLowerCase()
    );
    const currentInput = stationInputs[stationName];

    const hasSavedReadings = Boolean(
      existingLog && (existingLog.pumpHours !== null || existingLog.deckEngHours !== null)
    );
    const hasUnsavedTyped = Boolean(
      currentInput &&
        (currentInput.pumpHours.trim() !== '' || currentInput.deckEngHours.trim() !== '')
    );

    if (!hasSavedReadings && !hasUnsavedTyped) {
      // Case A: No hours entered yet! Direct fast swap!
      executeDirectPumpChange(stationName, currentPump, selectedPump);
    } else {
      // Case B: Readings entered or typed!
      const pumpHoursStr =
        currentInput?.pumpHours.trim() !== ''
          ? currentInput.pumpHours
          : existingLog?.pumpHours != null
          ? String(existingLog.pumpHours)
          : '';
      const deckHoursStr =
        currentInput?.deckEngHours.trim() !== ''
          ? currentInput.deckEngHours
          : existingLog?.deckEngHours != null
          ? String(existingLog.deckEngHours)
          : '';
      const notesStr = currentInput?.notes || existingLog?.notes || '';

      const pumpHoursVal = pumpHoursStr.trim() !== '' ? Number(pumpHoursStr) : null;
      const deckHoursVal = deckHoursStr.trim() !== '' ? Number(deckHoursStr) : null;

      setReadingsDecisionTarget({
        stationName,
        currentPump,
        selectedPump,
        displayPumpHours: pumpHoursStr,
        displayDeckHours: deckHoursStr,
        pumpHoursVal,
        deckHoursVal,
        notesVal: notesStr,
      });
    }
  };

  // Case A: Fast direct pump change (no entered readings)
  const executeDirectPumpChange = async (
    stationName: string,
    currentPump: string,
    selectedPump: string
  ) => {
    try {
      await swapPumpOnStation(stationName, currentPump, selectedPump);

      const newLog = allLogs.find(
        (l) =>
          l.date === date &&
          (l.shift === shift || (!l.shift && shift === 'day')) &&
          l.stationNumber === stationName &&
          l.pumpNumber.trim().toLowerCase() === selectedPump.trim().toLowerCase()
      );

      setStationInputs((prev) => ({
        ...prev,
        [stationName]: {
          pumpHours: newLog?.pumpHours != null ? String(newLog.pumpHours) : '',
          deckEngHours: newLog?.deckEngHours != null ? String(newLog.deckEngHours) : '',
          notes: newLog?.notes || '',
        },
      }));
    } catch (err) {
      console.error('Error changing pump:', err);
    } finally {
      setChangePumpTarget(null);
    }
  };

  // Case B Option 1: MOVE TODAY'S READINGS
  const handleConfirmMoveReadings = async () => {
    if (!readingsDecisionTarget) return;
    const {
      stationName,
      currentPump,
      selectedPump,
      pumpHoursVal,
      deckHoursVal,
      notesVal,
    } = readingsDecisionTarget;

    try {
      await moveReadingPump({
        date,
        shift,
        stationNumber: stationName,
        oldPumpNumber: currentPump,
        newPumpNumber: selectedPump,
        customReadings: {
          pumpHours: pumpHoursVal,
          deckEngHours: deckHoursVal,
          notes: notesVal,
        },
      });

      setStationInputs((prev) => ({
        ...prev,
        [stationName]: {
          pumpHours: pumpHoursVal !== null ? String(pumpHoursVal) : '',
          deckEngHours: deckHoursVal !== null ? String(deckHoursVal) : '',
          notes: notesVal,
        },
      }));
    } catch (err) {
      console.error('Error moving readings to new pump:', err);
    } finally {
      setReadingsDecisionTarget(null);
      setChangePumpTarget(null);
    }
  };

  // Case B Option 2: START PUMP BLANK
  const handleConfirmStartBlank = async () => {
    if (!readingsDecisionTarget) return;
    const { stationName, currentPump, selectedPump } = readingsDecisionTarget;

    try {
      await swapPumpOnStation(stationName, currentPump, selectedPump);

      const existingNewPumpLog = allLogs.find(
        (l) =>
          l.date === date &&
          (l.shift === shift || (!l.shift && shift === 'day')) &&
          l.stationNumber === stationName &&
          l.pumpNumber.trim().toLowerCase() === selectedPump.trim().toLowerCase()
      );

      setStationInputs((prev) => ({
        ...prev,
        [stationName]: {
          pumpHours:
            existingNewPumpLog?.pumpHours != null ? String(existingNewPumpLog.pumpHours) : '',
          deckEngHours:
            existingNewPumpLog?.deckEngHours != null
              ? String(existingNewPumpLog.deckEngHours)
              : '',
          notes: existingNewPumpLog?.notes || '',
        },
      }));
    } catch (err) {
      console.error('Error starting new pump blank:', err);
    } finally {
      setReadingsDecisionTarget(null);
      setChangePumpTarget(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-32 space-y-4">
      {/* NEW SHIFT AVAILABLE BANNER (Requirement 3) */}
      {isShiftTransitionAvailable && (
        <div className="bg-amber-500/15 border-2 border-amber-500 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-amber-400 block">
                  SHIFT TRANSITION DETECTED
                </span>
                <h2 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-tight">
                  NEW SHIFT AVAILABLE
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  The schedule boundary has transitioned to {detectedShift === 'day' ? '5:30 AM Day Shift' : '5:30 PM Night Shift'} ({detectedOpDate}). Unsaved entries will be preserved.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setShift(detectedShift);
                setDate(detectedOpDate);
                acceptShiftTransition();
              }}
              className="flex-1 min-h-[44px] px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>SWITCH SHIFT</span>
            </button>
            <button
              type="button"
              onClick={() => {
                dismissShiftTransition();
              }}
              className="flex-1 min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>KEEP CURRENT</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Header & Digital Clipboard Navigation - relative positioning so it never covers cards on mobile */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onDone}
            className="min-h-[44px] px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl flex items-center gap-2 text-sm font-bold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="text-center">
            <h1 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wider">
              FLEET 1 PUMP HOURS
            </h1>
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-bold mt-0.5">
              <span className={shift === 'day' ? 'text-amber-400' : 'text-indigo-400'}>
                {shift === 'day' ? '☀️ DAY SHIFT' : '🌙 NIGHT SHIFT'}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 uppercase">DIGITAL CLIPBOARD</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToLineup}
            className="min-h-[44px] px-3 py-2 bg-slate-950 hover:bg-slate-800 text-amber-400 border border-slate-800 hover:border-amber-400/40 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
            title="Configure Lineup"
          >
            <Sliders className="w-4 h-4" />
            <span className="hidden sm:inline">Lineup</span>
          </button>
        </div>

        {/* SHIFT SELECTION SEGMENTED CONTROL */}
        <div className="p-1.5 bg-slate-950 border border-slate-800 rounded-xl">
          <div className="grid grid-cols-2 gap-1.5 w-full">
            <button
              type="button"
              onClick={() => handleSwitchShift('day')}
              className={`min-h-[44px] px-3 py-2 rounded-lg font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                shift === 'day'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white bg-slate-900/60'
              }`}
            >
              <Sun className="w-4 h-4 shrink-0" />
              <span>DAY SHIFT</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchShift('night')}
              className={`min-h-[44px] px-3 py-2 rounded-lg font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                shift === 'night'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white bg-slate-900/60'
              }`}
            >
              <Moon className="w-4 h-4 shrink-0" />
              <span>NIGHT SHIFT</span>
            </button>
          </div>
        </div>

        {/* SECTION SELECTION: SPREAD LINEUP vs STANDBY PUMPS vs ALL PUMPS */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setEntrySection('lineup')}
            className={`min-h-[44px] px-2 py-2 rounded-lg font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              entrySection === 'lineup'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <span>SPREAD</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
                entrySection === 'lineup'
                  ? 'bg-slate-950/80 text-amber-300'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
            >
              {completedCount} / {totalCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setEntrySection('standby')}
            className={`min-h-[44px] px-2 py-2 rounded-lg font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              entrySection === 'standby'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <span>STANDBY</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
                entrySection === 'standby'
                  ? 'bg-slate-950/80 text-amber-300'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
            >
              {completedStandbyCount} / {totalStandbyCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setEntrySection('all')}
            className={`min-h-[44px] px-2 py-2 rounded-lg font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              entrySection === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <span>ALL</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
                entrySection === 'all'
                  ? 'bg-slate-950/80 text-amber-300'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
            >
              {completedCount + completedStandbyCount} / {totalCount + totalStandbyCount}
            </span>
          </button>
        </div>

        {/* Date, Live Status, and Completion Counter Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 border-t border-slate-800/80 items-center">
          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-mono font-bold text-slate-100 focus:outline-none focus:border-amber-400 cursor-pointer w-full"
            />
          </div>

          {/* Sync & Connectivity State */}
          <div className="flex items-center justify-end sm:justify-center gap-1.5 text-xs font-bold font-mono">
            {syncStatus === 'live' && queuedCount === 0 && (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>LIVE ✓</span>
              </span>
            )}
            {syncStatus === 'live' && queuedCount > 0 && (
              <span className="text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>SYNCING ({queuedCount} Q'D)</span>
              </span>
            )}
            {syncStatus !== 'live' && (
              <span className="text-rose-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>OFFLINE ({queuedCount} QUEUED)</span>
              </span>
            )}
          </div>

          {/* Completion Counter */}
          <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-end gap-2 bg-slate-950 sm:bg-transparent px-3 py-1 sm:p-0 rounded-lg border border-slate-800 sm:border-none">
            <span className="text-xs uppercase font-bold text-slate-400">Progress:</span>
            <span
              className={`font-mono font-black text-sm px-2 py-0.5 rounded-md ${
                (entrySection === 'lineup'
                  ? isAllComplete
                  : entrySection === 'standby'
                  ? isAllStandbyComplete
                  : isAllComplete && isAllStandbyComplete)
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {entrySection === 'lineup'
                ? `${completedCount} / ${totalCount} SPREAD`
                : entrySection === 'standby'
                ? `${completedStandbyCount} / ${totalStandbyCount} STANDBY`
                : `${completedCount + completedStandbyCount} / ${totalCount + totalStandbyCount} TOTAL`}
            </span>
          </div>
        </div>

        {/* Missing Stations Warning Banner with Quick Jump Buttons (Lineup View) */}
        {entrySection === 'lineup' && !isAllComplete && missingStations.length > 0 && totalCount > 0 && (
          completedCount === 0 ? (
            /* When no readings have been entered yet (e.g. 24 readings missing at start of shift) */
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-2.5 sm:p-3 text-xs flex items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2 text-amber-300 font-bold min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-mono text-xs sm:text-sm">
                  {missingStations.length} READINGS MISSING
                </span>
              </div>
              <button
                type="button"
                onClick={() => scrollToStation(missingStations[0])}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-sm shrink-0"
              >
                <span>START AT {missingStations[0]}</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          ) : (
            /* When partially entered: clean header + horizontal swipeable ribbon of missing station pills */
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-2.5 text-xs space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-amber-300 font-bold gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-mono text-xs sm:text-sm truncate">
                    {missingStations.length} READINGS MISSING
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => scrollToStation(missingStations[0])}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-[11px] rounded-lg flex items-center gap-1 cursor-pointer transition-all shrink-0 shadow-sm"
                >
                  <span>Next: {missingStations[0]}</span>
                  <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                </button>
              </div>
              {/* Single-row horizontal scroll ribbon that never wraps into 10 lines or overlaps cards */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
                {missingStations.map((st) => {
                  const pump = getPumpsForStation(st)[0] || 'Unassigned';
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => scrollToStation(st)}
                      className="px-2.5 py-1 bg-slate-950 hover:bg-amber-500 hover:text-slate-950 text-amber-200 border border-amber-500/30 rounded-lg font-mono font-bold text-[11px] transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      {st} • {pump}
                    </button>
                  );
                })}
              </div>
            </div>
          )
        )}

        {/* Missing Standby Pumps Warning Banner (Standby View) */}
        {entrySection === 'standby' && !isAllStandbyComplete && missingStandbyPumps.length > 0 && totalStandbyCount > 0 && (
          <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-2.5 text-xs space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-amber-300 font-bold gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-mono text-xs sm:text-sm truncate">
                  {missingStandbyPumps.length} STANDBY READINGS PENDING
                </span>
              </div>
              <button
                type="button"
                onClick={() => scrollToStandbyPump(missingStandbyPumps[0])}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-[11px] rounded-lg flex items-center gap-1 cursor-pointer transition-all shrink-0 shadow-sm"
              >
                <span>Next: Pump {missingStandbyPumps[0]}</span>
                <ArrowRight className="w-3 h-3 stroke-[2.5]" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
              {missingStandbyPumps.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => scrollToStandbyPump(p)}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-amber-500 hover:text-slate-950 text-amber-200 border border-amber-500/30 rounded-lg font-mono font-bold text-[11px] transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Pump {p} • Standby
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Finalized Banner if finalized */}
        {finalizationInfo.finalized && (
          <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-2.5 flex items-center justify-between text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>
                <strong>FINALIZED</strong> by {finalizationInfo.finalizedBy || 'Supervisor'}
                {finalizationInfo.finalizedAt ? ` at ${new Date(finalizationInfo.finalizedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={handleReopen}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded-lg font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Reopen</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Digital Clipboard Spread Form: Station 1, Station 2, Station 3... */}
      {(entrySection === 'lineup' || entrySection === 'all') && (
        activeStations.length === 0 ? (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl p-8 sm:p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <Sliders className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-black text-slate-100">
              No Active Pump Lineup Set Up
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Pumps must be assigned to stations before entering meter readings. Set up the spread lineup first.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToLineup}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer inline-flex items-center gap-2"
          >
            <Sliders className="w-4 h-4 stroke-[2.5]" />
            <span>Set Up Pump Lineup</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeStations.map((stationName, idx) => {
            const pumpNumber = getPumpsForStation(stationName)[0] || '';
            const stationNum = extractStationNumber(stationName);
            const inputVal = stationInputs[stationName] || { pumpHours: '', deckEngHours: '', notes: '' };
            const status = saveStatus[stationName] || 'idle';
            const complete = isStationComplete(stationName);

            // Fetch previous readings for this pump respecting shift chronology
            const prevReading = getPreviousReading(pumpNumber, date, shift);
            const prevPumpHours = prevReading ? prevReading.pumpHours : null;
            const prevDeckHours = prevReading ? prevReading.deckEngHours : null;

            // Numeric difference calculations
            const curPumpNumeric = inputVal.pumpHours.trim() !== '' ? Number(inputVal.pumpHours) : null;
            const curDeckNumeric = inputVal.deckEngHours.trim() !== '' ? Number(inputVal.deckEngHours) : null;

            const pumpDiff = curPumpNumeric !== null && prevPumpHours !== null ? curPumpNumeric - prevPumpHours : null;
            const deckDiff = curDeckNumeric !== null && prevDeckHours !== null ? curDeckNumeric - prevDeckHours : null;

            // Meter validation flags
            const isPumpLower = pumpDiff !== null && pumpDiff < 0;
            const isPumpBigJump = pumpDiff !== null && pumpDiff > 30;

            const isDeckLower = deckDiff !== null && deckDiff < 0;
            const isDeckBigJump = deckDiff !== null && deckDiff > 30;

            const isPumpConfirmed = confirmedWarnings[stationName]?.pumpHours;
            const isDeckConfirmed = confirmedWarnings[stationName]?.deckEngHours;

            return (
              <div
                key={stationName}
                id={`station-row-${stationNum}`}
                className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 shadow-md transition-all ${
                  complete
                    ? 'border-emerald-500/40 bg-slate-900/90'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Station & Pump Header: Station number is strongest label; pump number and CHANGE are secondary */}
                <div className="flex items-start justify-between border-b border-slate-800 pb-2.5 mb-3">
                  <div>
                    {/* 1. STATION NUMBER (STRONGEST LABEL) */}
                    <h2 className="text-xl sm:text-2xl font-black text-slate-100 uppercase tracking-tight leading-none">
                      {stationName}
                    </h2>

                    {/* 2. PUMP NUMBER & COMPACT CHANGE BUTTON */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="font-mono font-bold text-sm sm:text-base text-slate-300">
                        PUMP {pumpNumber || 'None'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenChangePump(stationName, pumpNumber)}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 text-amber-400 border border-slate-700 hover:border-amber-400/50 rounded text-[11px] font-bold uppercase transition-colors cursor-pointer shadow-xs"
                        title={`Change pump assigned to ${stationName}`}
                      >
                        CHANGE
                      </button>
                    </div>
                  </div>

                  {/* Completion Checkmark */}
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold transition-colors ${
                        complete
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                          : 'bg-slate-950 text-slate-600 border border-slate-800'
                      }`}
                      title={complete ? 'Station complete' : 'Readings pending'}
                    >
                      {complete ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : (
                        <span className="text-xs">○</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Meter Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* PUMP HOURS FIELD */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor={`input-pump-${stationName}`} className="text-xs uppercase font-black text-slate-300 tracking-wider">
                        Pump Hours
                      </label>
                      <span className="text-xs font-mono font-bold text-slate-400">
                        Previous:{' '}
                        <strong className="text-slate-200">
                          {prevPumpHours !== null ? prevPumpHours.toFixed(1) : '—'}
                        </strong>
                      </span>
                    </div>

                    {/* Touch-Friendly Numeric Input */}
                    <div className="relative">
                      <input
                        id={`input-pump-${stationName}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        enterKeyHint="next"
                        value={inputVal.pumpHours}
                        onChange={(e) => handleInputChange(stationName, 'pumpHours', e.target.value)}
                        onBlur={() => handleAutosave(stationName)}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'pumpHours', stationName)}
                        placeholder={prevPumpHours !== null ? String(prevPumpHours) : 'Meter reading...'}
                        className="w-full min-h-[50px] bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-lg sm:text-xl font-mono font-black text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-slate-500">
                        HRS
                      </span>
                    </div>

                    {/* Meter Validation Warnings */}
                    {isPumpLower && !isPumpConfirmed && (
                      <div className="bg-rose-950/80 border border-rose-600 rounded-lg p-2 text-xs text-rose-200 space-y-1">
                        <p className="font-bold flex items-center gap-1 text-rose-300">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Reading is lower than previous reading ({prevPumpHours}).</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmedWarnings((prev) => ({
                              ...prev,
                              [stationName]: { ...(prev[stationName] || {}), pumpHours: true },
                            }));
                            handleAutosave(stationName);
                          }}
                          className="px-2 py-1 bg-rose-900 hover:bg-rose-800 text-white rounded text-[11px] font-bold cursor-pointer"
                        >
                          Confirm Reset / Replaced Meter
                        </button>
                      </div>
                    )}

                    {isPumpBigJump && (
                      <p className="text-[11px] text-amber-400 font-bold flex items-center gap-1 bg-amber-950/40 p-1.5 rounded border border-amber-600/40">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Large increase detected. Verify reading.</span>
                      </p>
                    )}
                  </div>

                  {/* DECK ENGINE HOURS FIELD */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor={`input-deck-${stationName}`} className="text-xs uppercase font-black text-slate-300 tracking-wider">
                        Deck Engine Hours
                      </label>
                      <span className="text-xs font-mono font-bold text-slate-400">
                        Previous:{' '}
                        <strong className="text-slate-200">
                          {prevDeckHours !== null ? prevDeckHours.toFixed(1) : '—'}
                        </strong>
                      </span>
                    </div>

                    {/* Touch-Friendly Numeric Input */}
                    <div className="relative">
                      <input
                        id={`input-deck-${stationName}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        enterKeyHint={idx < activeStations.length - 1 ? 'next' : 'done'}
                        value={inputVal.deckEngHours}
                        onChange={(e) => handleInputChange(stationName, 'deckEngHours', e.target.value)}
                        onBlur={() => handleAutosave(stationName)}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'deckEngHours', stationName)}
                        placeholder={prevDeckHours !== null ? String(prevDeckHours) : 'Meter reading...'}
                        className="w-full min-h-[50px] bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-lg sm:text-xl font-mono font-black text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-slate-500">
                        HRS
                      </span>
                    </div>

                    {/* Meter Validation Warnings */}
                    {isDeckLower && !isDeckConfirmed && (
                      <div className="bg-rose-950/80 border border-rose-600 rounded-lg p-2 text-xs text-rose-200 space-y-1">
                        <p className="font-bold flex items-center gap-1 text-rose-300">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Reading is lower than previous reading ({prevDeckHours}).</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmedWarnings((prev) => ({
                              ...prev,
                              [stationName]: { ...(prev[stationName] || {}), deckEngHours: true },
                            }));
                            handleAutosave(stationName);
                          }}
                          className="px-2 py-1 bg-rose-900 hover:bg-rose-800 text-white rounded text-[11px] font-bold cursor-pointer"
                        >
                          Confirm Reset / Replaced Meter
                        </button>
                      </div>
                    )}

                    {isDeckBigJump && (
                      <p className="text-[11px] text-amber-400 font-bold flex items-center gap-1 bg-amber-950/40 p-1.5 rounded border border-amber-600/40">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Large increase detected. Verify reading.</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Optional Station Notes & Quiet Autosave Feedback */}
                <div className="pt-2 border-t border-slate-800/60 mt-1">
                  <div className="flex items-center justify-between">
                    <div>
                      {!expandedNotes[stationName] && !inputVal.notes ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedNotes((prev) => ({
                              ...prev,
                              [stationName]: true,
                            }))
                          }
                          className="text-xs font-mono font-bold text-slate-500 hover:text-amber-400 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>NOTE</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedNotes((prev) => ({
                              ...prev,
                              [stationName]: !prev[stationName],
                            }))
                          }
                          className="text-xs font-mono font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span className="bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded text-[11px]">
                            NOTE ✓
                          </span>
                          {inputVal.notes && (
                            <span className="text-slate-400 truncate max-w-[150px] sm:max-w-[240px] text-[11px] hidden sm:inline">
                              "{inputVal.notes}"
                            </span>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Quiet Autosave Status Indicator */}
                    <div className="text-[11px] font-mono font-bold">
                      {status === 'saving' && (
                        <span className="text-amber-400 animate-pulse">Saving...</span>
                      )}
                      {status === 'saved' && (
                        <span className="text-emerald-400">Saved ✓</span>
                      )}
                      {status === 'queued' && (
                        <span className="text-cyan-400">Offline — Queued</span>
                      )}
                      {status === 'error' && (
                        <span className="text-rose-400">Save error</span>
                      )}
                    </div>
                  </div>

                  {(expandedNotes[stationName] || (inputVal.notes && expandedNotes[stationName] !== false)) && (
                    <div className="mt-2 animate-in fade-in duration-150">
                      <input
                        type="text"
                        value={inputVal.notes}
                        onChange={(e) => handleInputChange(stationName, 'notes', e.target.value)}
                        onBlur={() => handleAutosave(stationName)}
                        placeholder="e.g. Did not run, Pump swapped, Meter replaced, Reading verified..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                        maxLength={1000}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Subtle Secondary Option: SETUP / OTHER */}
          {unassignedSpreadStations.length > 0 && (
            <div className="pt-8 pb-3 text-center border-t border-slate-900">
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest block mb-1.5">
                SETUP / OTHER
              </span>
              <button
                type="button"
                onClick={() => setAssignUnassignedStationModal(true)}
                className="text-xs font-mono font-bold text-slate-500 hover:text-amber-400 py-1.5 px-3 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
              >
                + Assign Another Station ({unassignedSpreadStations.length} available)
              </button>
            </div>
          )}
          {/* When on 'lineup' only, provide a quick Standby Pump section card at bottom of spread lineup */}
          {entrySection === 'lineup' && (
            <div className="pt-6 pb-2 border-t border-slate-800">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-tight">
                      Standby Pumps on Location ({standbyPumps.length} Units)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {completedStandbyCount} of {totalStandbyCount} standby units logged this shift. Enter readings for units parked on pad.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEntrySection('standby');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md shadow-amber-500/20 active:scale-95 flex items-center gap-1.5"
                  >
                    <Clock className="w-4 h-4 stroke-[2.5]" />
                    <span>Enter Standby Hours →</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntrySection('all')}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    View All On Page
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    )}

      {/* STANDBY PUMPS SECTION: Backup & Reserve units parked on pad */}
      {(entrySection === 'standby' || entrySection === 'all') && (
        <div className={`space-y-4 ${entrySection === 'all' ? 'pt-8 border-t-2 border-slate-800' : ''}`}>
          {/* Standby Header Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">
                  Standby Pumps on Location
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Meter readings for backup and reserve units parked on pad ({standbyPumps.length} on location)
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAddStandbyModal(true);
                setNewStandbyPumpVal('');
                setAddStandbyError(null);
              }}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-amber-500/20 active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>ADD STANDBY PUMP</span>
            </button>
          </div>

          {standbyPumps.length === 0 ? (
            <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl p-8 sm:p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                <Clock className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-lg font-black text-slate-100">
                  No Standby Pumps in Location Inventory
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  All inventory pumps are currently assigned to spread stations, or no spare pumps are logged on pad.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddStandbyModal(true);
                  setNewStandbyPumpVal('');
                  setAddStandbyError(null);
                }}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Standby Pump</span>
              </button>
            </div>
          ) : (
            standbyPumps.map((pump, idx) => {
              const inputVal = standbyInputs[pump] || { pumpHours: '', deckEngHours: '', notes: '' };
              const status = standbySaveStatus[pump] || 'idle';
              const complete = isStandbyComplete(pump);

              const prevReading = getPreviousReading(pump, date, shift);
              const prevPumpHours = prevReading ? prevReading.pumpHours : null;
              const prevDeckHours = prevReading ? prevReading.deckEngHours : null;

              const curPumpNumeric = inputVal.pumpHours.trim() !== '' ? Number(inputVal.pumpHours) : null;
              const curDeckNumeric = inputVal.deckEngHours.trim() !== '' ? Number(inputVal.deckEngHours) : null;

              const pumpDiff = curPumpNumeric !== null && prevPumpHours !== null ? curPumpNumeric - prevPumpHours : null;
              const deckDiff = curDeckNumeric !== null && prevDeckHours !== null ? curDeckNumeric - prevDeckHours : null;

              const isDrop = pumpDiff !== null && pumpDiff < 0;
              const isJump = pumpDiff !== null && pumpDiff > 15;
              const isConfirmed = standbyConfirmedWarnings[pump]?.pumpHours;
              const showWarning = (isDrop || isJump) && !isConfirmed;

              const pumpStatusInfo = getPumpCurrentStatus(pump);
              const hasActiveIssue = ['DOWN', 'REPAIRING', 'DERATED'].includes(pumpStatusInfo.status);

              const isNotesExpanded = expandedStandbyNotes[pump] || Boolean(inputVal.notes.trim());

              return (
                <div
                  key={`standby-card-${pump}`}
                  id={`standby-row-${pump}`}
                  className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 transition-all shadow-lg ${
                    complete
                      ? 'border-emerald-500/40 bg-slate-900/90'
                      : 'border-slate-800 bg-slate-900/95'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          complete
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-slate-950 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {complete ? '✓' : idx + 1}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-lg sm:text-xl text-amber-400">
                          PUMP {pump}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-[11px] font-mono font-bold text-slate-300 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded">
                          STANDBY
                        </span>
                        {hasActiveIssue && (
                          <span
                            className={`text-[10px] font-mono font-black px-2 py-0.5 rounded uppercase ${
                              pumpStatusInfo.status === 'DOWN'
                                ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                                : pumpStatusInfo.status === 'REPAIRING'
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                                : 'bg-purple-950/80 text-purple-300 border border-purple-500/40'
                            }`}
                          >
                            {pumpStatusInfo.status}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Autosave status indicator */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {prevPumpHours !== null && (
                        <span className="text-[11px] font-mono text-slate-400">
                          Last: <strong className="text-slate-200">{prevPumpHours.toFixed(1)}h</strong>
                        </span>
                      )}

                      {status === 'saving' && (
                        <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded animate-pulse">
                          SAVING...
                        </span>
                      )}
                      {status === 'saved' && (
                        <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded">
                          SAVED ✓
                        </span>
                      )}
                      {status === 'queued' && (
                        <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded">
                          QUEUED
                        </span>
                      )}
                      {status === 'error' && (
                        <button
                          type="button"
                          onClick={() => handleStandbyAutosave(pump)}
                          className="text-[11px] font-mono font-bold text-rose-400 bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded hover:bg-rose-900/40 cursor-pointer"
                        >
                          RETRY ↻
                        </button>
                      )}
                      {status === 'idle' && complete && (
                        <span className="text-[11px] font-mono font-bold text-emerald-500/80 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          LOGGED ✓
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Warning confirmation banner if drop or jump */}
                  {showWarning && (
                    <div className="mt-3 bg-amber-950/60 border border-amber-500/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-200">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          {isDrop && (
                            <span>
                              <strong>LOWER READING:</strong> {curPumpNumeric?.toFixed(1)} hrs is less than previous ({prevPumpHours?.toFixed(1)} hrs).
                            </span>
                          )}
                          {isJump && !isDrop && (
                            <span>
                              <strong>LARGE JUMP:</strong> Large increase detected since last reading ({prevPumpHours?.toFixed(1)} hrs).
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStandbyConfirmedWarnings((prev) => ({
                            ...prev,
                            [pump]: { ...(prev[pump] || {}), pumpHours: true },
                          }));
                          handleStandbyAutosave(pump);
                        }}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-lg shrink-0 cursor-pointer self-end sm:self-auto transition-colors"
                      >
                        CONFIRM READING
                      </button>
                    </div>
                  )}

                  {/* Inputs Grid: Pump Hours and Deck Engine Hours */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3.5">
                    {/* 1. Pump Hours Input */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor={`input-pump-standby-${pump}`}
                          className="font-black text-slate-300 uppercase tracking-wider text-[11px]"
                        >
                          PUMP HOURS
                        </label>
                      </div>

                      <div className="relative">
                        <input
                          id={`input-pump-standby-${pump}`}
                          type="number"
                          inputMode="decimal"
                          step="any"
                          enterKeyHint="next"
                          value={inputVal.pumpHours}
                          onChange={(e) => handleStandbyInputChange(pump, 'pumpHours', e.target.value)}
                          onBlur={() => handleStandbyAutosave(pump)}
                          onKeyDown={(e) => handleStandbyKeyDown(e, idx, 'pumpHours', pump)}
                          placeholder={prevPumpHours !== null ? prevPumpHours.toFixed(1) : 'Meter reading...'}
                          className={`w-full min-h-[50px] bg-slate-950 border rounded-xl px-3.5 py-2.5 font-mono font-black text-lg sm:text-xl text-slate-100 placeholder:text-slate-700 focus:outline-none transition-colors ${
                            showWarning
                              ? 'border-amber-500 ring-1 ring-amber-500'
                              : 'border-slate-800 focus:border-amber-400'
                          }`}
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-slate-500">
                          HRS
                        </span>
                      </div>
                    </div>

                    {/* 2. Deck Engine Hours Input */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor={`input-deck-standby-${pump}`}
                          className="font-black text-slate-300 uppercase tracking-wider text-[11px]"
                        >
                          DECK ENG HOURS
                        </label>
                      </div>

                      <div className="relative">
                        <input
                          id={`input-deck-standby-${pump}`}
                          type="number"
                          inputMode="decimal"
                          step="any"
                          enterKeyHint={idx < standbyPumps.length - 1 ? 'next' : 'done'}
                          value={inputVal.deckEngHours}
                          onChange={(e) => handleStandbyInputChange(pump, 'deckEngHours', e.target.value)}
                          onBlur={() => handleStandbyAutosave(pump)}
                          onKeyDown={(e) => handleStandbyKeyDown(e, idx, 'deckEngHours', pump)}
                          placeholder={prevDeckHours !== null ? prevDeckHours.toFixed(1) : 'Meter reading...'}
                          className="w-full min-h-[50px] bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2.5 font-mono font-black text-lg sm:text-xl text-slate-100 placeholder:text-slate-700 focus:outline-none transition-colors"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-slate-500">
                          HRS
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notes Section */}
                  <div className="pt-2.5 mt-2 border-t border-slate-800/60">
                    {!isNotesExpanded ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedStandbyNotes((prev) => ({ ...prev, [pump]: true }))
                        }
                        className="text-xs font-bold text-slate-500 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>+ Add standby note / test run remark</span>
                      </button>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3 text-amber-400" />
                            <span>STANDBY NOTES</span>
                          </span>
                          {!inputVal.notes.trim() && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedStandbyNotes((prev) => ({ ...prev, [pump]: false }))
                              }
                              className="text-slate-500 hover:text-slate-300 cursor-pointer"
                            >
                              Hide
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={inputVal.notes}
                          onChange={(e) => handleStandbyInputChange(pump, 'notes', e.target.value)}
                          onBlur={() => handleStandbyAutosave(pump)}
                          placeholder="e.g. Parked cold standby on pad, 15m warm-up test ran..."
                          className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
                          maxLength={1000}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Floating Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-950/95 border-t border-slate-800 backdrop-blur-md z-40 max-w-3xl mx-auto flex items-center justify-between gap-3 shadow-2xl">
        <div className="text-xs">
          <span className="font-mono font-black text-slate-100 text-sm block">
            {entrySection === 'lineup'
              ? `${completedCount} / ${totalCount} STATIONS COMPLETE`
              : entrySection === 'standby'
              ? `${completedStandbyCount} / ${totalStandbyCount} STANDBY LOGGED`
              : `${completedCount + completedStandbyCount} / ${totalCount + totalStandbyCount} TOTAL LOGGED`}
          </span>
          <span className="text-slate-400 text-[11px]">
            {entrySection === 'lineup'
              ? isAllComplete
                ? 'All spread readings entered ✓'
                : `${missingStations.length} stations awaiting reading`
              : entrySection === 'standby'
              ? isAllStandbyComplete && totalStandbyCount > 0
                ? 'All standby readings entered ✓'
                : totalStandbyCount === 0
                ? 'No standby units on location'
                : `${missingStandbyPumps.length} standby units awaiting reading`
              : `${missingStations.length} spread + ${missingStandbyPumps.length} standby pending`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {entrySection === 'standby' ? (
            <>
              <button
                type="button"
                onClick={() => setEntrySection('lineup')}
                className="min-h-[46px] px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl cursor-pointer"
              >
                Lineup ({completedCount}/{totalCount})
              </button>
              {finalizationInfo.finalized ? (
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/50 px-3 py-2 rounded-xl">
                  FINALIZED ✓
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowFinalizeModal(true)}
                  className="min-h-[46px] px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl cursor-pointer shadow-lg shadow-amber-500/25 active:scale-95"
                >
                  FINISH SHIFT
                </button>
              )}
            </>
          ) : finalizationInfo.finalized ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/50 px-3 py-2 rounded-xl">
                FINALIZED ({shift === 'day' ? 'DAY' : 'NIGHT'}) ✓
              </span>
              <button
                type="button"
                onClick={handleReopen}
                className="min-h-[46px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl cursor-pointer"
              >
                Reopen
              </button>
            </div>
          ) : (
            <>
              {standbyPumps.length > 0 && entrySection === 'lineup' && (
                <button
                  type="button"
                  onClick={() => {
                    setEntrySection('standby');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="min-h-[46px] px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0 transition-colors"
                  title="Switch to Standby Pumps"
                >
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Standby ({completedStandbyCount}/{totalStandbyCount})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isAllComplete) {
                    setShowFinalizeModal(true);
                  } else if (missingStations.length > 0) {
                    scrollToStation(missingStations[0]);
                  }
                }}
                className={`min-h-[48px] px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
                  isAllComplete
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/25 active:scale-95'
                    : 'bg-slate-800 hover:bg-slate-750 text-amber-400 border border-amber-500/30 active:scale-95'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                <span>{isAllComplete ? `FINISH ${shift === 'day' ? 'DAY' : 'NIGHT'} HOURS` : `${missingStations.length} MISSING`}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* FINALIZATION CONFIRMATION MODAL */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="font-black text-lg text-slate-100 uppercase tracking-wide">
                Finalize {shift === 'day' ? 'Day Shift' : 'Night Shift'} Hours?
              </h3>
            </div>

            <div className="space-y-2 text-sm text-slate-300">
              <p>
                <strong>{completedCount} of {totalCount}</strong> pumps complete with <strong>0 missing readings</strong> for <span className="font-mono font-bold text-amber-300">{date}</span> ({shift === 'day' ? 'Day Shift' : 'Night Shift'}).
              </p>
              <p className="text-xs text-slate-400">
                This locks the {shift === 'day' ? 'Day Shift' : 'Night Shift'} hours sheet for office review and printing. You can still reopen and correct entries if needed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                className="min-h-[44px] px-4 py-2 text-sm font-bold text-slate-300 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isFinalizing}
                onClick={handleFinalize}
                className="min-h-[44px] px-6 py-2 text-sm font-black bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
              >
                <span>FINALIZE</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIRST-TIME TECHNICIAN NAME PROMPT */}
      {showTechPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400">
              <Clock className="w-5 h-5" />
              <h3 className="font-black text-lg text-slate-100 uppercase">
                Who is entering hours?
              </h3>
            </div>
            <p className="text-xs text-slate-300">
              Enter your name or technician ID. This will be stamped on your daily meter entries.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (techInputVal.trim()) {
                  setTechnicianName(techInputVal.trim());
                  setShowTechPrompt(false);
                }
              }}
              className="space-y-3"
            >
              <input
                type="text"
                autoFocus
                required
                value={techInputVal}
                onChange={(e) => setTechInputVal(e.target.value)}
                placeholder="e.g. Joe, Chuck O., Tech 1..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-bold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                maxLength={50}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!techInputVal.trim()}
                  className="w-full min-h-[46px] px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-sm rounded-xl transition-colors cursor-pointer"
                >
                  Save &amp; Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1. CHANGE PUMP PICKER MODAL */}
      {changePumpTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in slide-in-from-bottom duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[11px] font-mono uppercase font-black tracking-widest text-amber-400">
                  {changePumpTarget.stationName}
                </span>
                <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight">
                  Change Pump
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Currently assigned:{' '}
                  <strong className="font-mono text-amber-300">
                    Pump {changePumpTarget.currentPump || 'None'}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseChangePump}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input Filter */}
            <div className="py-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={changePumpTarget.searchTerm}
                  onChange={(e) =>
                    setChangePumpTarget((prev) =>
                      prev ? { ...prev, searchTerm: e.target.value } : null
                    )
                  }
                  placeholder="Search pump number..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-14 py-2.5 text-sm font-mono font-bold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                />
                {changePumpTarget.searchTerm && (
                  <button
                    type="button"
                    onClick={() =>
                      setChangePumpTarget((prev) =>
                        prev ? { ...prev, searchTerm: '' } : null
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Inline Add Pump or "+ ADD PUMP" Button */}
            <div className="pb-3">
              {!showAddPumpInline ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddPumpInline(true);
                    setNewPumpInputVal(changePumpTarget.searchTerm.trim());
                    setAddPumpError(null);
                    setAddPumpDuplicateMatch(null);
                  }}
                  className="w-full min-h-[46px] py-2.5 px-4 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500 active:text-slate-950 text-amber-400 border border-amber-500/30 hover:border-amber-400 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>+ PUMP NOT LISTED</span>
                </button>
              ) : (
                <div className="bg-slate-950 border border-amber-500/50 rounded-2xl p-3.5 space-y-3 shadow-lg animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>ADD NEW PUMP</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddPumpInline(false);
                        setNewPumpInputVal('');
                        setAddPumpError(null);
                        setAddPumpDuplicateMatch(null);
                      }}
                      className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                      title="Cancel Add Pump"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase mb-1">
                      Pump Number
                    </label>
                    <input
                      type="text"
                      autoFocus
                      inputMode="text"
                      value={newPumpInputVal}
                      onChange={(e) => {
                        setNewPumpInputVal(e.target.value);
                        setAddPumpError(null);
                        setAddPumpDuplicateMatch(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAndUsePump();
                        }
                      }}
                      placeholder="e.g. 187, P-204"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono font-black text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  {/* Duplicate match or validation error */}
                  {addPumpError && (
                    <div className="text-xs font-bold text-rose-300 bg-rose-950/60 border border-rose-600/40 p-2.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>{addPumpError}</span>
                      </span>
                      {addPumpDuplicateMatch && (
                        <button
                          type="button"
                          onClick={() => handleUseExistingPump(addPumpDuplicateMatch)}
                          className="px-3 py-1 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-lg shrink-0 cursor-pointer shadow-sm transition-all"
                        >
                          USE PUMP {addPumpDuplicateMatch}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Actions: CANCEL and ADD & USE */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isAddingPump}
                      onClick={() => {
                        setShowAddPumpInline(false);
                        setNewPumpInputVal('');
                        setAddPumpError(null);
                        setAddPumpDuplicateMatch(null);
                      }}
                      className="min-h-[42px] px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      disabled={isAddingPump}
                      onClick={handleAddAndUsePump}
                      className="min-h-[42px] px-5 py-2 text-xs font-black bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                    >
                      {isAddingPump ? (
                        <>
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                          <span>ADDING...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>ADD &amp; USE</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sub-header instruction */}
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 pb-1">
              Select Correct Pump
            </div>

            {/* Pumps List: Available / Standby first, then Currently Assigned */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-1">
              {/* AVAILABLE / STANDBY SECTION */}
              <div>
                <div className="flex items-center justify-between px-1 pb-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    STANDBY — ON LOCATION ({filteredStandbyPumps.length})
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Ready to assign</span>
                </div>

                {filteredStandbyPumps.length === 0 ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center text-xs text-slate-500 italic">
                    {changePumpTarget.searchTerm
                      ? 'No matching standby pumps found.'
                      : 'No standby pumps currently in location inventory.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {filteredStandbyPumps.map((pump) => (
                      <button
                        key={pump}
                        type="button"
                        onClick={() => handleSelectPumpFromPicker(pump)}
                        className="w-full min-h-[52px] bg-slate-950 hover:bg-slate-800 active:bg-amber-500 active:text-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-xl px-4 py-3 flex items-center justify-between text-left transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-lg text-slate-100 group-hover:text-amber-400 group-active:text-slate-950">
                            Pump {pump}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-400 group-active:text-slate-950 bg-emerald-950/60 group-active:bg-transparent border border-emerald-500/30 group-active:border-transparent px-2.5 py-1 rounded-lg">
                          Standby
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CURRENTLY ASSIGNED SECTION */}
              <div>
                <div className="flex items-center justify-between px-1 pb-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    CURRENTLY IN LINEUP ({filteredAssignedPumps.length})
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Active on stations</span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {filteredAssignedPumps.map((item) => {
                    const isCurrent =
                      item.pump.trim().toLowerCase() ===
                      changePumpTarget.currentPump.trim().toLowerCase();

                    return (
                      <button
                        key={`${item.station}-${item.pump}`}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => handleSelectPumpFromPicker(item.pump)}
                        className={`w-full min-h-[52px] border rounded-xl px-4 py-3 flex items-center justify-between text-left transition-all ${
                          isCurrent
                            ? 'bg-slate-950/60 border-slate-800 text-slate-500 cursor-not-allowed opacity-75'
                            : 'bg-slate-950 hover:bg-slate-800 active:bg-amber-500 active:text-slate-950 border-slate-800 hover:border-amber-400/50 cursor-pointer group'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`font-mono font-black text-lg ${
                              isCurrent
                                ? 'text-slate-400'
                                : 'text-slate-100 group-hover:text-amber-400 group-active:text-slate-950'
                            }`}
                          >
                            Pump {item.pump}
                          </span>
                          <span className="text-xs font-bold text-slate-500 group-active:text-slate-900">
                            — {item.station}
                          </span>
                        </div>

                        {isCurrent ? (
                          <span className="text-xs font-mono font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                            CURRENT
                          </span>
                        ) : (
                          <span className="text-xs font-mono font-bold text-slate-400 group-active:text-slate-950 bg-slate-900 group-active:bg-transparent px-2.5 py-1 rounded-lg border border-slate-800 group-active:border-transparent">
                            Move from {item.station}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleCloseChangePump}
                className="w-full min-h-[46px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MOVE CONFLICT MODAL */}
      {moveConflictTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-black text-base uppercase text-slate-100">
                PUMP {moveConflictTarget.selectedPump} IS ON {moveConflictTarget.otherStation.toUpperCase()}
              </h3>
            </div>

            <p className="text-xs text-slate-300">
              Move Pump <strong className="font-mono text-amber-300">{moveConflictTarget.selectedPump}</strong> to{' '}
              <strong className="text-white">{moveConflictTarget.stationName}</strong>?
            </p>
            <p className="text-xs text-amber-400/90 font-medium bg-amber-950/40 border border-amber-600/40 p-2.5 rounded-lg">
              This will remove Pump {moveConflictTarget.selectedPump} from {moveConflictTarget.otherStation}.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMoveConflictTarget(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmMoveFromOtherStation}
                className="min-h-[44px] px-5 py-2 text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl cursor-pointer shadow-lg shadow-amber-500/20"
              >
                MOVE PUMP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. READINGS DECISION MODAL */}
      {readingsDecisionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-black text-base uppercase text-slate-100">
                Change Pump?
              </h3>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <p>
                <strong className="text-white">{readingsDecisionTarget.stationName}</strong> currently has today's readings saved under:
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono space-y-1 text-slate-200">
                <div className="flex items-center justify-between">
                  <span>Pump Hours:</span>
                  <strong className="text-amber-400">
                    {readingsDecisionTarget.displayPumpHours || '—'}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Deck Engine:</span>
                  <strong className="text-amber-400">
                    {readingsDecisionTarget.displayDeckHours || '—'}
                  </strong>
                </div>
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800 mt-1">
                  Currently recorded for Pump {readingsDecisionTarget.currentPump}
                </div>
              </div>
              <p className="text-slate-400">
                Changing to <strong>Pump {readingsDecisionTarget.selectedPump}</strong> requires deciding what to do with those readings:
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleConfirmMoveReadings}
                className="w-full min-h-[48px] px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-xs rounded-xl flex flex-col items-center justify-center shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <span>MOVE TODAY'S READINGS</span>
                <span className="text-[10px] font-normal opacity-80">
                  Keep readings and assign them to Pump {readingsDecisionTarget.selectedPump}
                </span>
              </button>

              <button
                type="button"
                onClick={handleConfirmStartBlank}
                className="w-full min-h-[46px] px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 font-bold text-xs rounded-xl flex flex-col items-center justify-center cursor-pointer border border-slate-700"
              >
                <span>START PUMP {readingsDecisionTarget.selectedPump} BLANK</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  Preserve old Pump {readingsDecisionTarget.currentPump} reading in history
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReadingsDecisionTarget(null)}
                className="w-full min-h-[40px] px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. ASSIGN UNASSIGNED SPREAD STATION MODAL */}
      {assignUnassignedStationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-black text-base uppercase text-slate-100">
                Select Station to Assign
              </h3>
              <button
                type="button"
                onClick={() => setAssignUnassignedStationModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Pick a station on the frac spread to assign a pump to:
            </p>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {unassignedSpreadStations.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setAssignUnassignedStationModal(false);
                    handleOpenChangePump(st, '');
                  }}
                  className="w-full p-2.5 bg-slate-950 hover:bg-slate-800 text-slate-200 hover:text-amber-400 rounded-xl border border-slate-800 font-mono font-bold text-xs flex items-center justify-between cursor-pointer"
                >
                  <span>{st}</span>
                  <span className="text-[11px] text-slate-500">Assign Pump →</span>
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setAssignUnassignedStationModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADD STANDBY PUMP MODAL */}
      {showAddStandbyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-amber-400">
                <Plus className="w-5 h-5" />
                <h3 className="font-black text-base uppercase text-slate-100">
                  Add Standby Pump
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddStandbyModal(false);
                  setNewStandbyPumpVal('');
                  setAddStandbyError(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Enter the pump number of the standby / reserve unit on location:
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const clean = newStandbyPumpVal.trim();
                if (!clean) {
                  setAddStandbyError('Pump number is required');
                  return;
                }
                setIsAddingStandby(true);
                try {
                  await addPumpToDirectory(clean);
                  setShowAddStandbyModal(false);
                  setNewStandbyPumpVal('');
                  setAddStandbyError(null);
                  setEntrySection('standby');
                  setTimeout(() => {
                    scrollToStandbyPump(clean);
                  }, 200);
                } catch (err) {
                  console.error('Error adding standby pump:', err);
                  setAddStandbyError('Could not add pump. Try again.');
                } finally {
                  setIsAddingStandby(false);
                }
              }}
              className="space-y-3"
            >
              <input
                type="text"
                autoFocus
                required
                value={newStandbyPumpVal}
                onChange={(e) => {
                  setNewStandbyPumpVal(e.target.value);
                  setAddStandbyError(null);
                }}
                placeholder="e.g. 108, 95, P-22..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-bold font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 uppercase"
                maxLength={30}
              />

              {addStandbyError && (
                <p className="text-xs font-bold text-rose-400">{addStandbyError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddStandbyModal(false);
                    setNewStandbyPumpVal('');
                    setAddStandbyError(null);
                  }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingStandby || !newStandbyPumpVal.trim()}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black uppercase rounded-xl shadow-md cursor-pointer transition-all"
                >
                  {isAddingStandby ? 'Adding...' : 'Add Standby Pump'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
