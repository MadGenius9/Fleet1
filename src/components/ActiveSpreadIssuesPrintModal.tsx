import React, { useState, useEffect } from 'react';
import { useFleet } from '../context/FleetContext';
import { DownEquipmentPrintReport } from './reports/DownEquipmentPrintReport';
import { PumpHoursPrintReport } from './reports/PumpHoursPrintReport';
import { PrintReportSelectorModal, type ReportType } from './reports/PrintReportSelectorModal';
import { applyPrintPageStyle } from './reports/reportUtils';
import type { ShiftType } from '../types';
import {
  Printer,
  X,
  Sliders,
  FileSpreadsheet,
  AlertTriangle,
  Sun,
  Moon,
} from 'lucide-react';

interface ActiveSpreadIssuesPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  initialShift?: ShiftType;
  defaultReport?: ReportType;
}

export const ActiveSpreadIssuesPrintModal: React.FC<ActiveSpreadIssuesPrintModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  initialShift,
  defaultReport = 'down-equipment',
}) => {
  const { todayDateStr, activeShift } = useFleet();

  const [date, setDate] = useState<string>(initialDate || todayDateStr);
  const [shift, setShift] = useState<ShiftType>(initialShift || activeShift || 'day');
  const [selectedReport, setSelectedReport] = useState<ReportType>(defaultReport);
  const [showSelectorModal, setShowSelectorModal] = useState<boolean>(false);

  // Sync orientation on mount & report change
  useEffect(() => {
    if (isOpen) {
      applyPrintPageStyle(selectedReport === 'down-equipment' ? 'landscape' : 'portrait');
    }
  }, [isOpen, selectedReport]);

  if (!isOpen) return null;

  const handlePrint = () => {
    applyPrintPageStyle(selectedReport === 'down-equipment' ? 'landscape' : 'portrait');
    window.print();
  };

  const handleSwitchReport = (report: ReportType) => {
    setSelectedReport(report);
    applyPrintPageStyle(report === 'down-equipment' ? 'landscape' : 'portrait');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs overflow-y-auto print:static print:inset-auto print:z-auto print:bg-white print:p-0 print:block">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-4 sm:p-6 max-w-5xl w-full my-auto shadow-2xl flex flex-col max-h-[96vh] print:bg-white print:text-black print:border-none print:shadow-none print:max-w-none print:w-full print:p-0 print:my-0 print:max-h-none print:rounded-none">
        {/* Modal Controls Bar - Hidden during printing */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              selectedReport === 'down-equipment'
                ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
            }`}>
              {selectedReport === 'down-equipment' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <FileSpreadsheet className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-400">
                  PRINT PREVIEW &amp; REPORT
                </span>
                <span className="text-slate-600 font-bold">•</span>
                <span className={`text-[11px] font-mono font-bold uppercase px-1.5 py-0.2 rounded ${
                  selectedReport === 'down-equipment' ? 'bg-rose-950 text-rose-300' : 'bg-amber-950 text-amber-300'
                }`}>
                  {selectedReport === 'down-equipment' ? '1-Page Landscape' : 'Portrait'}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-100 uppercase tracking-tight">
                {selectedReport === 'down-equipment'
                  ? 'Down Equipment / Active Issues'
                  : 'Daily Pump Hours Report'}
              </h2>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Open Report Selector Modal */}
            <button
              type="button"
              onClick={() => setShowSelectorModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              title="Switch Report Type"
            >
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Change Report</span>
            </button>

            {/* Print Now button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>PRINT NOW</span>
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 cursor-pointer ml-1"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Secondary Report Controls (Report Switcher + Date + Shift) - Hidden during print */}
        <div className="py-2.5 px-3 bg-slate-950 border border-slate-800 rounded-2xl my-3 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
          {/* Quick Segmented Toggle */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => handleSwitchReport('down-equipment')}
              className={`px-3 py-1.5 rounded-lg font-black uppercase text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedReport === 'down-equipment'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Down Equipment</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchReport('pump-hours')}
              className={`px-3 py-1.5 rounded-lg font-black uppercase text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedReport === 'pump-hours'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Pump Hours</span>
            </button>
          </div>

          {/* Date & Shift Selectors */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Date:</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 font-mono font-bold focus:outline-none focus:border-amber-400 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setShift('day')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase flex items-center gap-1 cursor-pointer ${
                  shift === 'day' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sun className="w-3 h-3" />
                <span>Day</span>
              </button>
              <button
                type="button"
                onClick={() => setShift('night')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase flex items-center gap-1 cursor-pointer ${
                  shift === 'night' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Moon className="w-3 h-3" />
                <span>Night</span>
              </button>
            </div>
          </div>
        </div>

        {/* PRINTABLE SHEET CONTAINER: Renders ONLY the selected report */}
        <div className="overflow-y-auto flex-1 pr-1 print:overflow-visible print:p-0">
          {selectedReport === 'down-equipment' ? (
            <DownEquipmentPrintReport
              date={date}
              shift={shift}
              isPreview={true}
            />
          ) : (
            <PumpHoursPrintReport
              date={date}
              shift={shift}
              isPreview={true}
            />
          )}
        </div>
      </div>

      {/* Print Report Selector Modal */}
      <PrintReportSelectorModal
        isOpen={showSelectorModal}
        onClose={() => setShowSelectorModal(false)}
        onSelectReport={(rep) => handleSwitchReport(rep)}
      />
    </div>
  );
};
