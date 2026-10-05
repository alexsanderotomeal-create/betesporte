import React, { useState } from 'react';
import { 
  X, 
  Radio, 
  ChevronRight, 
  Layers
} from 'lucide-react';
import { Match, Market, OddChoice, BetSelection } from '../types/betting';
import { OddButton } from './OddButton';
import { LivePitchTracker } from './LivePitchTracker';

interface MatchDetailModalProps {
  match: Match | null;
  onClose: () => void;
  selectedSelections: BetSelection[];
  onToggleSelection: (match: Match, market: Market, choice: OddChoice) => void;
  oddsFormat: 'decimal' | 'fractional' | 'american';
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  match,
  onClose,
  selectedSelections,
  onToggleSelection,
  oddsFormat,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showPitchTracker, setShowPitchTracker] = useState(true);

  if (!match) return null;

  const isChoiceSelected = (marketId: string, choiceId: string) => {
    return selectedSelections.some(
      (s) => s.matchId === match.id && s.marketId === marketId && s.choiceId === choiceId
    );
  };

  const filteredMarkets = activeCategory === 'all'
    ? match.markets
    : match.markets.filter((m) => m.category === activeCategory);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">🏆</span>
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm font-bold text-white">
                {match.homeTeam} vs {match.awayTeam}
              </span>
              <span className="text-[11px] text-slate-400">
                {match.league} · {match.country}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {match.status === 'LIVE' && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-600/20 text-rose-400 text-xs font-mono font-bold">
                <Radio className="w-3 h-3 animate-pulse text-rose-500" />
                {match.minute}' AO VIVO
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-4 flex flex-col gap-4 flex-1">
          {/* Live Pitch Tracker Embedded (If Live) */}
          {match.status === 'LIVE' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Visualização de Campo & Telemetria
                </span>
                <button
                  onClick={() => setShowPitchTracker(!showPitchTracker)}
                  className="text-xs text-[#00e701] hover:underline"
                >
                  {showPitchTracker ? 'Ocultar Campo' : 'Mostrar Campo'}
                </button>
              </div>
              {showPitchTracker && <LivePitchTracker match={match} />}
            </div>
          )}

          {/* Market Filter Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-[#21262d]">
            {[
              { id: 'all', label: 'Todos os Mercados' },
              { id: 'main', label: 'Principais' },
              { id: 'goals', label: 'Gols / Pontos' },
              { id: 'handicap', label: 'Handicap' },
              { id: 'specials', label: 'Especiais / Placar' },
              { id: 'corners', label: 'Escanteios' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-[#00e701] text-black font-bold shadow'
                    : 'bg-[#161b22] text-slate-400 hover:text-white hover:bg-[#21262d]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Markets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredMarkets.map((market) => (
              <div
                key={market.id}
                className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3 flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
                  <span className="text-xs font-bold text-white tracking-wide">
                    {market.name}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    {market.choices.length} seleções
                  </span>
                </div>

                <div className={`grid gap-2 ${
                  market.choices.length === 2 ? 'grid-cols-2' :
                  market.choices.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'
                }`}>
                  {market.choices.map((choice) => (
                    <OddButton
                      key={choice.id}
                      choice={choice}
                      isSelected={isChoiceSelected(market.id, choice.id)}
                      onSelect={() => onToggleSelection(match, market, choice)}
                      format={oddsFormat}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-[#161b22] border-t border-[#21262d] px-4 py-2.5 flex items-center justify-between text-xs text-slate-400">
          <span>Odds sujeitas a alterações dinâmicas em tempo real.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
