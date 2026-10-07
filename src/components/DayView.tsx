import React from 'react';
import { HistoryView } from './HistoryView';

interface DayViewProps {
  onEditLog?: (log: any) => void;
  onStartNewLog?: () => void;
  onOpenDateInEntry?: (date: string) => void;
  onOpenDateInPrint?: (date: string) => void;
}

export const DayView: React.FC<DayViewProps> = ({
  onStartNewLog,
  onOpenDateInEntry,
  onOpenDateInPrint,
}) => {
  return (
    <HistoryView
      onOpenDateInEntry={(date) => {
        if (onOpenDateInEntry) onOpenDateInEntry(date);
        else if (onStartNewLog) onStartNewLog();
      }}
      onOpenDateInPrint={(date) => {
        if (onOpenDateInPrint) onOpenDateInPrint(date);
      }}
    />
  );
};

export { HistoryView };
