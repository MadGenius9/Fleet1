import React from 'react';
import { Printer, FileSpreadsheet, AlertTriangle, X } from 'lucide-react';

export type ReportType = 'pump-hours' | 'down-equipment';

interface PrintReportSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectReport: (reportType: ReportType) => void;
}

export const PrintReportSelectorModal: React.FC<PrintReportSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectReport,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs print:hidden animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-100 uppercase tracking-wide">
                PRINT REPORT
              </h2>
              <p className="text-xs text-slate-400">
                Choose which shift report you want to print
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice: Separate Reports */}
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 leading-relaxed">
          <strong className="text-amber-400 font-bold">Independent Reports:</strong> Pump Hours and Down Equipment are printed as separate jobs. Only the selected report will be printed.
        </div>

        {/* Two Report Buttons */}
        <div className="grid grid-cols-1 gap-3">
          {/* 1. PUMP HOURS */}
          <button
            type="button"
            onClick={() => {
              onSelectReport('pump-hours');
              onClose();
            }}
            className="group p-4 bg-slate-950 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl text-left transition-all cursor-pointer flex items-start gap-4 active:scale-98 shadow-md"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
              <FileSpreadsheet className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-base text-slate-100 group-hover:text-amber-300 transition-colors uppercase tracking-tight">
                  PUMP HOURS
                </span>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                  Portrait
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                Daily shift pump-hour log with Station 1–24 readings, deck engine hours, and completion status.
              </p>
            </div>
          </button>

          {/* 2. DOWN EQUIPMENT */}
          <button
            type="button"
            onClick={() => {
              onSelectReport('down-equipment');
              onClose();
            }}
            className="group p-4 bg-slate-950 hover:bg-slate-800/90 border border-slate-800 hover:border-rose-500/50 rounded-2xl text-left transition-all cursor-pointer flex items-start gap-4 active:scale-98 shadow-md"
          >
            <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 group-hover:bg-rose-500 group-hover:text-white transition-colors">
              <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-base text-slate-100 group-hover:text-rose-300 transition-colors uppercase tracking-tight">
                  DOWN EQUIPMENT
                </span>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                  1-Page Landscape
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                Active spread failures, downtime, derates &amp; watch items. Excludes normal running spread units.
              </p>
            </div>
          </button>
        </div>

        {/* Footer with Cancel */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
};
