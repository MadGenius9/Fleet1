import React, { useState, useEffect, useMemo } from 'react';
import { useFleet, sortStations, extractStationNumber } from '../context/FleetContext';
import { PumpHoursPrintReport } from './reports/PumpHoursPrintReport';
import { DownEquipmentPrintReport } from './reports/DownEquipmentPrintReport';
import { PrintReportSelectorModal, type ReportType } from './reports/PrintReportSelectorModal';
import {
  applyPrintPageStyle,
  extractActiveEquipmentIssues,
} from './reports/reportUtils';
import type { ShiftType, PumpOpsEvent } from '../types';
import {
  Printer,
  Download,
  ArrowLeft,
  Sun,
  Moon,
  FileSpreadsheet,
  AlertTriangle,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

interface PrintViewProps {
  initialDate?: string;
  initialShift?: ShiftType;
  initialReport?: ReportType;
  onBack?: () => void;
}

export const PrintView: React.FC<PrintViewProps> = ({
  initialDate,
  initialShift,
  initialReport = 'pump-hours',
  onBack,
}) => {
  const {
    allLogs,
    fleet,
    todayDateStr,
    activeShift,
    technicianName,
    isSheetFinalized,
    getPumpsForStation,
    getPreviousReading,
    pumpOpsEvents,
    getStationForPump,
  } = useFleet();

  const [dateFilter, setDateFilter] = useState<string>(initialDate || todayDateStr);
  const [shiftFilter, setShiftFilter] = useState<ShiftType>(initialShift || activeShift || 'day');
  const [activeReport, setActiveReport] = useState<ReportType>(initialReport);
  const [showSelectorModal, setShowSelectorModal] = useState<boolean>(false);

  // Keep print page orientation style in sync with selected report
  useEffect(() => {
    applyPrintPageStyle(activeReport === 'down-equipment' ? 'landscape' : 'portrait');
  }, [activeReport]);

  // Handle report selection from modal or toggle
  const handleSelectReport = (report: ReportType, autoPrint = false) => {
    setActiveReport(report);
    applyPrintPageStyle(report === 'down-equipment' ? 'landscape' : 'portrait');
    if (autoPrint) {
      setTimeout(() => {
        window.print();
      }, 100);
    }
  };

  // Direct print of current selected report
  const handlePrintCurrent = () => {
    applyPrintPageStyle(activeReport === 'down-equipment' ? 'landscape' : 'portrait');
    window.print();
  };

  // CSV Export for Pump Hours
  const handleExportPumpHoursCSV = () => {
    const dateLogs = allLogs.filter(
      (log) =>
        log.date === dateFilter &&
        (log.shift === shiftFilter || (!log.shift && shiftFilter === 'day'))
    );

    const activeStations = sortStations(
      fleet.stations.filter((st) => {
        const hasPump = getPumpsForStation(st).length > 0;
        const hasLog = dateLogs.some((l) => l.stationNumber === st);
        return hasPump || hasLog;
      })
    );

    const headers = ['Date', 'Shift', 'Station', 'Pump', 'Pump Hours', 'Deck Hours', 'Notes', 'Entered By'];
    const escapeCSV = (str: string | number | null | undefined) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    const rows = activeStations.map((st) => {
      const matched = dateLogs.find((l) => l.stationNumber === st);
      const assignedPump = matched?.pumpNumber || getPumpsForStation(st)[0] || '';
      const pumpHours = matched?.pumpHours !== null && matched?.pumpHours !== undefined ? matched.pumpHours : null;
      const deckEngHours = matched?.deckEngHours !== null && matched?.deckEngHours !== undefined ? matched.deckEngHours : null;
      const notes = matched?.notes || matched?.info || '';

      return [
        escapeCSV(dateFilter),
        escapeCSV(shiftFilter === 'night' ? 'Night' : 'Day'),
        escapeCSV(st),
        escapeCSV(assignedPump),
        pumpHours !== null ? pumpHours : '',
        deckEngHours !== null ? deckEngHours : '',
        escapeCSV(notes),
        escapeCSV(technicianName || 'Field Tech'),
      ];
    });

    // Also include standby pumps with readings
    const standbyLogs = dateLogs.filter(
      (l) =>
        l.stationNumber.toLowerCase().includes('standby') &&
        (l.pumpHours !== null || l.deckEngHours !== null || (l.notes && l.notes.trim() !== ''))
    );

    standbyLogs.forEach((l) => {
      const pump = l.pumpNumber;
      const pumpHours = l.pumpHours !== null && l.pumpHours !== undefined ? l.pumpHours : null;
      const deckEngHours = l.deckEngHours !== null && l.deckEngHours !== undefined ? l.deckEngHours : null;
      const notes = l.notes || l.info || '';

      rows.push([
        escapeCSV(dateFilter),
        escapeCSV(shiftFilter === 'night' ? 'Night' : 'Day'),
        escapeCSV('Standby'),
        escapeCSV(pump),
        pumpHours !== null ? pumpHours : '',
        deckEngHours !== null ? deckEngHours : '',
        escapeCSV(notes),
        escapeCSV(technicianName || 'Field Tech'),
      ]);
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `FLEET_1_PUMP_HOURS_${dateFilter}_${shiftFilter.toUpperCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSV Export for Down Equipment
  const handleExportDownEquipmentCSV = () => {
    const sortedItems = extractActiveEquipmentIssues(pumpOpsEvents, getStationForPump, {
      filterDate: dateFilter,
      filterShift: shiftFilter,
    });

    const headers = ['Date', 'Shift', 'Station', 'Pump', 'Status', 'Downtime', 'Issue', 'Notes', 'Operator'];
    const escapeCSV = (str: string | number | null | undefined) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    const rows = sortedItems.map((item) => [
      escapeCSV(dateFilter),
      escapeCSV(shiftFilter === 'night' ? 'Night' : 'Day'),
      escapeCSV(item.station),
      escapeCSV(item.pump),
      escapeCSV(item.status),
      escapeCSV(item.compactDowntime),
      escapeCSV(item.issue),
      escapeCSV(item.rawNotes),
      escapeCSV(technicianName || 'Field Tech'),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `FLEET_1_DOWN_EQUIPMENT_${dateFilter}_${shiftFilter.toUpperCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-28 max-w-5xl mx-auto">
      {/* ========================================================================= */}
      {/* 1. TOP CONTROLS BAR (Hidden during @media print)                          */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg print:hidden space-y-4">
        {/* Main Title & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <Printer className="w-5 h-5 text-amber-400" />
                <span>Reports &amp; Print System</span>
              </h1>
              <p className="text-xs text-slate-400">
                Independent shift reports for Fleet 1: Pump Hours and Down Equipment.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Print Report Selector button */}
            <button
              type="button"
              onClick={() => setShowSelectorModal(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-500/40 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Open Report Selector"
            >
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Select Report...</span>
            </button>

            {/* CSV Export button */}
            <button
              type="button"
              onClick={activeReport === 'pump-hours' ? handleExportPumpHoursCSV : handleExportDownEquipmentCSV}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            {/* Primary Print Button (Browser print or Save as PDF) */}
            <button
              type="button"
              onClick={handlePrintCurrent}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 active:scale-98 transition-all cursor-pointer"
              title="Print document or Save as PDF via browser print dialog"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>
                PRINT / SAVE PDF ({activeReport === 'pump-hours' ? 'PUMP HOURS' : 'DOWN EQUIPMENT'})
              </span>
            </button>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* REPORT SELECTOR TABS: PUMP HOURS vs DOWN EQUIPMENT                      */}
        {/* ======================================================================= */}
        <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => handleSelectReport('pump-hours')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeReport === 'pump-hours'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>PUMP HOURS</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                activeReport === 'pump-hours' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-400'
              }`}>
                Portrait
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectReport('down-equipment')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeReport === 'down-equipment'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>DOWN EQUIPMENT</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                activeReport === 'down-equipment' ? 'bg-black text-rose-300' : 'bg-slate-800 text-slate-400'
              }`}>
                1-Page Landscape
              </span>
            </button>
          </div>

          {/* Date & Shift Selector */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Input */}
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-wider font-bold text-slate-400 whitespace-nowrap">
                Date:
              </label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-slate-100 font-mono font-bold focus:outline-none focus:border-amber-400 cursor-pointer"
              />
            </div>

            {/* Shift Segmented Toggle */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setShiftFilter('day')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                  shiftFilter === 'day'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Day</span>
              </button>
              <button
                type="button"
                onClick={() => setShiftFilter('night')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                  shiftFilter === 'night'
                    ? 'bg-indigo-500 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Night</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. PRINT PREVIEW HEADER (Clear indication of active report type)           */}
      {/* ========================================================================= */}
      <div className="bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl flex items-center justify-between text-xs print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-mono font-bold text-slate-500">
            PRINT PREVIEW:
          </span>
          <span className="font-black text-amber-400 uppercase tracking-wide">
            {activeReport === 'pump-hours'
              ? 'FLEET 1 PUMP HOURS REPORT (US Letter Portrait)'
              : 'FLEET 1 DOWN EQUIPMENT / ACTIVE ISSUES REPORT (US Letter Landscape)'}
          </span>
        </div>
        <span className="text-slate-400 text-[11px] font-mono hidden sm:inline">
          {activeReport === 'pump-hours'
            ? 'Only Pump Hours table will be printed.'
            : 'Only abnormal equipment (Down/Repairing/Derated/Watch) will be printed.'}
        </span>
      </div>

      {/* ========================================================================= */}
      {/* 3. PRINTABLE REPORT CONTAINER                                             */}
      {/* Only the SELECTED report component is rendered into the printable DOM.   */}
      {/* ========================================================================= */}
      <div className="print-report-container">
        {activeReport === 'pump-hours' ? (
          <PumpHoursPrintReport
            date={dateFilter}
            shift={shiftFilter}
            isPreview={true}
          />
        ) : (
          <DownEquipmentPrintReport
            date={dateFilter}
            shift={shiftFilter}
            isPreview={true}
          />
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. PRINT REPORT SELECTOR MODAL                                            */}
      {/* ========================================================================= */}
      <PrintReportSelectorModal
        isOpen={showSelectorModal}
        onClose={() => setShowSelectorModal(false)}
        onSelectReport={(report) => handleSelectReport(report, true)}
      />
    </div>
  );
};
