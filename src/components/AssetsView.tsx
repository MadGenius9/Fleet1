import React from 'react';
import { LineupView } from './LineupView';

interface AssetsViewProps {
  onGoToEntry?: () => void;
}

export const AssetsView: React.FC<AssetsViewProps> = (props) => {
  return <LineupView {...props} />;
};

export { LineupView };
