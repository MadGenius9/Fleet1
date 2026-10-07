/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FleetProvider } from './context/FleetContext';
import { Navbar, type ActiveTab } from './components/Navbar';
import { AnonAuthBanner } from './components/AnonAuthBanner';
import { HomeView } from './components/HomeView';
import { EntryFormView } from './components/EntryFormView';
import { LineupView } from './components/LineupView';
import { InventoryView } from './components/InventoryView';
import { HistoryView } from './components/HistoryView';
import { PrintView } from './components/PrintView';
import { PumpOpsView } from './components/PumpOpsView';
import { MechanicsView } from './components/MechanicsView';
import { AssignmentConflictModal } from './components/AssignmentConflictModal';
import { Edit3 } from 'lucide-react';
import type { ShiftType } from './types';

function FleetApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [targetDateForEntry, setTargetDateForEntry] = useState<string | undefined>(undefined);
  const [targetShiftForEntry, setTargetShiftForEntry] = useState<ShiftType | undefined>(undefined);
  const [targetSectionForEntry, setTargetSectionForEntry] = useState<'lineup' | 'standby' | 'all' | undefined>(undefined);
  const [targetPumpForEntry, setTargetPumpForEntry] = useState<string | undefined>(undefined);
  const [targetDateForPrint, setTargetDateForPrint] = useState<string | undefined>(undefined);
  const [targetShiftForPrint, setTargetShiftForPrint] = useState<ShiftType | undefined>(undefined);
  const [targetReportForPrint, setTargetReportForPrint] = useState<'pump-hours' | 'down-equipment' | undefined>(undefined);

  const handleOpenEntry = (
    date?: string,
    shift?: ShiftType,
    section?: 'lineup' | 'standby' | 'all',
    pump?: string
  ) => {
    setTargetDateForEntry(date);
    setTargetShiftForEntry(shift);
    setTargetSectionForEntry(section);
    setTargetPumpForEntry(pump);
    setActiveTab('entry');
  };

  const handleOpenPrint = (date?: string, shift?: ShiftType, report?: 'pump-hours' | 'down-equipment') => {
    setTargetDateForPrint(date);
    setTargetShiftForPrint(shift);
    setTargetReportForPrint(report);
    setActiveTab('print');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Anonymous Auth Warning Banner if disabled */}
      <AnonAuthBanner />

      {/* Main Digital Clipboard Navigation Header */}
      <Navbar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'entry') {
            setTargetDateForEntry(undefined);
            setTargetShiftForEntry(undefined);
            setTargetSectionForEntry(undefined);
            setTargetPumpForEntry(undefined);
          }
          setActiveTab(tab);
        }}
      />

      {/* Concurrent Station Assignment Conflict Modal */}
      <AssignmentConflictModal onReviewLineup={() => setActiveTab('lineup')} />

      {/* Main View Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-5">
        {activeTab === 'home' && (
          <HomeView
            onEnterHours={(shift, section, pump) => handleOpenEntry(undefined, shift, section, pump)}
            onGoToLineup={() => setActiveTab('lineup')}
            onGoToInventory={() => setActiveTab('inventory')}
            onGoToOps={() => setActiveTab('ops')}
            onGoToMechanics={() => setActiveTab('mechanics')}
            onGoToPrint={(shift) => handleOpenPrint(undefined, shift)}
            onGoToHistory={() => setActiveTab('history')}
          />
        )}

        {activeTab === 'entry' && (
          <EntryFormView
            initialDate={targetDateForEntry}
            initialShift={targetShiftForEntry}
            initialSection={targetSectionForEntry}
            initialPump={targetPumpForEntry}
            onDone={() => setActiveTab('home')}
            onGoToLineup={() => setActiveTab('lineup')}
          />
        )}

        {activeTab === 'ops' && (
          <PumpOpsView
            onGoToLineup={() => setActiveTab('lineup')}
            onGoToInventory={() => setActiveTab('inventory')}
            onGoToEntry={() => handleOpenEntry()}
          />
        )}

        {activeTab === 'mechanics' && (
          <MechanicsView
            onGoToPrint={() => handleOpenPrint(undefined, undefined, 'down-equipment')}
          />
        )}

        {activeTab === 'lineup' && (
          <LineupView
            onGoToEntry={() => handleOpenEntry()}
            onGoToInventory={() => setActiveTab('inventory')}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            onGoToLineup={() => setActiveTab('lineup')}
            onGoToEntry={(section, pump) => handleOpenEntry(undefined, undefined, section, pump)}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            onOpenDateInEntry={(date, shift, section, pump) => handleOpenEntry(date, shift, section, pump)}
            onOpenDateInPrint={(date, shift) => handleOpenPrint(date, shift)}
          />
        )}

        {activeTab === 'print' && (
          <PrintView
            initialDate={targetDateForPrint}
            initialShift={targetShiftForPrint}
            initialReport={targetReportForPrint}
            onBack={() => setActiveTab('home')}
          />
        )}
      </main>

      {/* Mobile Floating Action Button on Home Screen */}
      {activeTab === 'home' && (
        <div className="sm:hidden fixed bottom-5 right-5 z-30 print:hidden">
          <button
            onClick={() => handleOpenEntry()}
            aria-label="Enter Pump Hours"
            className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-xl shadow-amber-500/30 active:scale-95 transition-transform cursor-pointer"
          >
            <Edit3 className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <FleetProvider>
      <FleetApp />
    </FleetProvider>
  );
}
