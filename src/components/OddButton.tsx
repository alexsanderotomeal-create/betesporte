import React, { useEffect, useState } from 'react';
import { Lock, TrendingUp, TrendingDown } from 'lucide-react';
import { OddChoice } from '../types/betting';

interface OddButtonProps {
  choice: OddChoice;
  isSelected: boolean;
  onSelect: () => void;
  format?: 'decimal' | 'fractional' | 'american';
  compact?: boolean;
}

export const OddButton: React.FC<OddButtonProps> = ({
  choice,
  isSelected,
  onSelect,
  format = 'decimal',
  compact = false,
}) => {
  const [flashClass, setFlashClass] = useState<'flash-up' | 'flash-down' | ''>('');

  // Detect odd value change and trigger brief visual indicator
  useEffect(() => {
    if (choice.previousValue && choice.value !== choice.previousValue) {
      if (choice.value > choice.previousValue) {
        setFlashClass('flash-up');
      } else {
        setFlashClass('flash-down');
      }
      const timer = setTimeout(() => {
        setFlashClass('');
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [choice.value, choice.previousValue]);

  // Format odds representation
  const formatOdd = (val: number): string => {
    if (format === 'fractional') {
      // Approximation for common decimal odds
      if (val >= 2) return `${(val - 1).toFixed(1)}/1`;
      return `1/${(1 / (val - 1)).toFixed(1)}`;
    }
    if (format === 'american') {
      if (val >= 2.0) return `+${Math.round((val - 1) * 100)}`;
      return `${Math.round(-100 / (val - 1))}`;
    }
    return val.toFixed(2);
  };

  if (choice.isSuspended) {
    return (
      <button
        disabled
        className="w-full flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-[#161b22] border border-[#21262d] text-slate-500 cursor-not-allowed text-xs"
        title="Mercado temporariamente suspenso"
      >
        <Lock className="w-3.5 h-3.5 text-amber-500/70" />
        <span className="text-[11px] font-mono">Suspenso</span>
      </button>
    );
  }

  return (
    <button
      onClick={onSelect}
      className={`group relative w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-all cursor-pointer select-none ${flashClass} ${
        isSelected
          ? 'bg-[#00e701] border-[#00e701] text-black font-extrabold shadow-md shadow-[#00e701]/25 ring-1 ring-[#00e701]'
          : 'bg-[#161b22] border-[#252d3d] hover:border-[#00e701]/70 hover:bg-[#1c2331] text-slate-200'
      }`}
    >
      <span className={`text-[11px] truncate pr-1 ${isSelected ? 'text-black font-bold' : 'text-slate-400 group-hover:text-slate-200'}`}>
        {choice.label}
      </span>

      <div className="flex items-center gap-1 font-mono font-bold">
        {choice.trend === 'up' && !isSelected && (
          <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
        )}
        {choice.trend === 'down' && !isSelected && (
          <TrendingDown className="w-3 h-3 text-rose-400 shrink-0" />
        )}
        <span className={isSelected ? 'text-black' : 'text-[#00e701] font-bold'}>
          {formatOdd(choice.value)}
        </span>
      </div>
    </button>
  );
};
