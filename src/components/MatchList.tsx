import React from 'react';
import { 
  Radio, 
  Flame, 
  Zap, 
  ChevronRight, 
  Layers
} from 'lucide-react';
import { Match, BetSelection, Market, OddChoice } from '../types/betting';
import { OddButton } from './OddButton';

interface MatchListProps {
  matches: Match[];
  selectedSelections: BetSelection[];
  onToggleSelection: (match: Match, market: Market, choice: OddChoice) => void;
  onOpenMatchDetails: (match: Match) => void;
  onSelectLiveTrackerMatch: (match: Match) => void;
  activeTrackerMatchId?: string;
  oddsFormat: 'decimal' | 'fractional' | 'american';
}

export const MatchList: React.FC<MatchListProps> = ({
  matches,
  selectedSelections,
  onToggleSelection,
  onOpenMatchDetails,
  onSelectLiveTrackerMatch,
  activeTrackerMatchId,
  oddsFormat,
}) => {
  const isChoiceSelected = (matchId: string, marketId: string, choiceId: string) => {
    return selectedSelections.some(
      (s) => s.matchId === matchId && s.marketId === marketId && s.choiceId === choiceId
    );
  };

  // Group matches by league
  const groupedMatches: { [league: string]: Match[] } = {};
  matches.forEach((m) => {
    const key = `${m.league} (${m.country})`;
    if (!groupedMatches[key]) groupedMatches[key] = [];
    groupedMatches[key].push(m);
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Super Odds Highlight Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0d1e13] via-[#102419] to-[#0d1e13] border border-[#00e701]/30 p-3.5 sm:p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00e701]/20 border border-[#00e701]/40 flex items-center justify-center shrink-0">
              <Flame className="w-6 h-6 text-[#00e701]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#00e701]">
                  Super Odd Turbinada
                </span>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 font-mono font-bold px-1.5 py-0.5 rounded">
                  +25% COTAÇÃO
                </span>
              </div>
              <div className="text-sm sm:text-base font-extrabold text-white">
                Flamengo & Real Madrid: Mais de 1.5 gols em ambos os jogos
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 line-through block">De 2.10</span>
              <span className="text-base font-extrabold font-mono text-[#00e701]">Por 2.85</span>
            </div>
            <button
              onClick={() => {
                const targetMatch = matches[0];
                if (targetMatch) {
                  const m1x2 = targetMatch.markets.find((m) => m.id === 'm-1x2');
                  const choice = m1x2?.choices[0];
                  if (m1x2 && choice) {
                    onToggleSelection(targetMatch, m1x2, { ...choice, value: 2.85 });
                  }
                }
              }}
              className="px-4 py-2 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase tracking-wider transition-colors shadow-md shadow-[#00e701]/30 cursor-pointer"
            >
              Apostar Super Odd
            </button>
          </div>
        </div>
      </div>

      {/* Matches Listing grouped by League */}
      {Object.keys(groupedMatches).length === 0 ? (
        <div className="bg-[#12161f] border border-[#21262d] rounded-xl p-10 text-center text-slate-400">
          <Layers className="w-10 h-10 mx-auto text-slate-600 mb-2" />
          <h3 className="text-base font-bold text-slate-300">Nenhum evento encontrado</h3>
          <p className="text-xs mt-1">Tente ajustar seus filtros de esportes, ligas ou termo de busca.</p>
        </div>
      ) : (
        Object.entries(groupedMatches).map(([leagueName, leagueMatches]) => (
          <div key={leagueName} className="bg-[#12161f] border border-[#21262d] rounded-xl overflow-hidden shadow-sm">
            {/* League Section Header */}
            <div className="bg-[#161b22] px-3.5 py-2.5 border-b border-[#21262d] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🏆</span>
                <span className="text-xs sm:text-sm font-bold text-white tracking-wide">
                  {leagueName}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {leagueMatches.length} {leagueMatches.length === 1 ? 'jogo' : 'jogos'}
              </span>
            </div>

            {/* List of Match Cards */}
            <div className="divide-y divide-[#1e2533]">
              {leagueMatches.map((match) => {
                const mainMarket = match.markets.find((m) => m.category === 'main') || match.markets[0];
                const goalsMarket = match.markets.find((m) => m.category === 'goals');
                const bttsMarket = match.markets.find((m) => m.id === 'm-btts');
                const isLive = match.status === 'LIVE';
                const isSelectedForTracker = activeTrackerMatchId === match.id;

                return (
                  <div
                    key={match.id}
                    className={`p-3 sm:p-4 transition-colors hover:bg-[#151a24] ${
                      isSelectedForTracker ? 'bg-[#151c27] ring-1 ring-[#00e701]/30' : ''
                    }`}
                  >
                    <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                      {/* Left: Match Info & Teams & Live Score */}
                      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                        {/* Time / Live Status badge */}
                        <div className="w-20 shrink-0 text-left">
                          {isLive ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-rose-400">
                                <Radio className="w-2.5 h-2.5 animate-pulse text-rose-500" />
                                {match.minute}'
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium truncate">
                                {match.period}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-300">
                                {match.startTime.split(',')[1]?.trim() || match.startTime}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {match.startTime.split(',')[0]?.trim()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Team Names and Live Scores */}
                        <div 
                          onClick={() => onOpenMatchDetails(match)}
                          className="flex flex-col flex-1 cursor-pointer group min-w-0"
                        >
                          {/* Home Team */}
                          <div className="flex items-center justify-between py-0.5">
                            <span className="text-xs sm:text-sm font-semibold text-white group-hover:text-[#00e701] transition-colors truncate">
                              {match.homeTeam}
                            </span>
                            {isLive && (
                              <span className="font-mono text-xs sm:text-sm font-bold text-[#00e701] ml-2">
                                {match.homeScore}
                              </span>
                            )}
                          </div>

                          {/* Away Team */}
                          <div className="flex items-center justify-between py-0.5">
                            <span className="text-xs sm:text-sm font-semibold text-white group-hover:text-[#00e701] transition-colors truncate">
                              {match.awayTeam}
                            </span>
                            {isLive && (
                              <span className="font-mono text-xs sm:text-sm font-bold text-[#00e701] ml-2">
                                {match.awayScore}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick Tracker Switch Button */}
                        {isLive && (
                          <button
                            onClick={() => onSelectLiveTrackerMatch(match)}
                            className={`p-1.5 rounded-lg border text-xs transition-colors shrink-0 ${
                              isSelectedForTracker
                                ? 'bg-[#00e701]/20 border-[#00e701] text-[#00e701]'
                                : 'bg-[#161b22] border-[#252d3d] text-slate-400 hover:text-white'
                            }`}
                            title="Visualizar campo e estatísticas ao vivo"
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Right: Odds Market Grid */}
                      <div className="flex items-center gap-2 flex-wrap xl:flex-nowrap">
                        {/* Main Market (1X2 for soccer, Top Candidates for politics) */}
                        {mainMarket && (
                          <div className={`grid gap-1.5 shrink-0 ${
                            match.sport === 'politics'
                              ? 'grid-cols-2 sm:grid-cols-4 w-full sm:w-80'
                              : 'grid-cols-3 w-full sm:w-64'
                          }`}>
                            {(match.sport === 'politics' ? mainMarket.choices.slice(0, 4) : mainMarket.choices.slice(0, 3)).map((choice) => (
                              <OddButton
                                key={choice.id}
                                choice={choice}
                                isSelected={isChoiceSelected(match.id, mainMarket.id, choice.id)}
                                onSelect={() => onToggleSelection(match, mainMarket, choice)}
                                format={oddsFormat}
                              />
                            ))}
                          </div>
                        )}

                        {/* Over/Under or Secondary Market (Desktop) */}
                        {goalsMarket && (
                          <div className="hidden md:grid grid-cols-2 gap-1.5 w-44 shrink-0">
                            {goalsMarket.choices.slice(0, 2).map((choice) => (
                              <OddButton
                                key={choice.id}
                                choice={choice}
                                isSelected={isChoiceSelected(match.id, goalsMarket.id, choice.id)}
                                onSelect={() => onToggleSelection(match, goalsMarket, choice)}
                                format={oddsFormat}
                              />
                            ))}
                          </div>
                        )}

                        {/* More Markets Button */}
                        <button
                          onClick={() => onOpenMatchDetails(match)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#161b22] hover:bg-[#21262d] border border-[#252d3d] hover:border-slate-500 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 shrink-0 ml-auto xl:ml-0"
                          title="Ver todos os mercados disponíveis"
                        >
                          <span>+{match.markets.length * 8}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
