import React from 'react';
import { ChartType } from './LiveTradingViewChart';

interface ChartTypeSelectorProps {
  currentType: ChartType;
  onTypeChange: (type: ChartType) => void;
  className?: string;
}

export const ChartTypeSelector: React.FC<ChartTypeSelectorProps> = ({
  currentType,
  onTypeChange,
  className = "",
}) => {
  const chartTypes: { type: ChartType; icon: string; label: string }[] = [
    { type: 'Candlestick', icon: '📊', label: 'Candles' },
    { type: 'Line', icon: '📈', label: 'Line' },
    { type: 'Area', icon: '🏔️', label: 'Area' },
    { type: 'Bar', icon: '📊', label: 'Bars' },
  ];

  return (
    <div className={`flex items-center gap-1 bg-[#1e222d] rounded-lg p-1 border border-[#2a2e39] ${className}`}>
      {chartTypes.map(({ type, icon, label }) => (
        <button
          key={type}
          onClick={() => onTypeChange(type)}
          className={`
            px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200
            flex items-center gap-1.5
            ${currentType === type 
              ? 'bg-[#2962ff] text-white shadow-sm' 
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
            }
          `}
          title={`Switch to ${label} chart`}
        >
          <span className="text-sm">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
};