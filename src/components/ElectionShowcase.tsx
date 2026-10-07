import React from 'react';
import {
  Vote,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import {
  ElectionContest,
  ElectionCandidate,
  electionTrend,
  ELECTION_SOURCE_NOTE,
} from '../types/election';
import { BetSelection } from '../types/betting';

interface ElectionShowcaseProps {
  contests: ElectionContest[];
  /** Mesmo gesto de uma odd de jogo: alterna a selecao dentro do boletim. */
  onPick: (contest: ElectionContest, candidate: ElectionCandidate) => void;
  /**Selecoes ja no boletim, para marcar o candidato escolhido. */
  selectedSelections?: BetSelection[];
}

/**
 * Vitrine do mercado eleitoral.
 *
 * Quando o usuario escolhe "Eleicoes", esta lista aparece na area principal —
 * antes, so existia um banner e uma lista de partidas vazia: os candidatos
 * ficavam presos no modal. Aqui cada candidato e um botao de cotacao com o
 * mesmo comportamento das odds de partida: clica e entra no boletim.
 */
export const ElectionShowcase: React.FC<ElectionShowcaseProps> = ({
  contests,
  onPick,
  selectedSelections = [],
}) => {
  if (contests.length === 0) {
    return (
      <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-6 text-center text-slate-400 text-xs">
        Nenhum mercado eleitoral aberto no momento.
      </div>
    );
  }

  const president = contests.find(c => c.scope === 'PRESIDENT');
  const governors = contests.filter(c => c.scope === 'GOVERNOR');

  const isPicked = (contest: ElectionContest, candidate: ElectionCandidate) =>
    selectedSelections.some(
      s => s.kind === 'election' && s.matchId === contest.id && s.choiceId === candidate.id
    );

  const renderContest = (contest: ElectionContest, highlight = false) => (
    <div
      key={contest.id}
      className={`bg-[#161b22] border rounded-xl p-3.5 flex flex-col gap-2.5 ${
        highlight ? 'border-amber-500/40' : 'border-[#252d3d]'
      }`}
    >
      <div className="flex items-center gap-1.5 border-b border-[#21262d] pb-2">
        <Vote className="w-4 h-4 text-[#00e701]" />
        <span className="font-bold text-white text-xs truncate">{contest.title}</span>
        {contest.stateCode && (
          <span className="ml-auto px-1.5 py-0.5 rounded border border-[#30363d] font-mono text-[10px] font-bold text-slate-300">
            {contest.stateCode}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {contest.candidates.map((candidate, idx) => {
          const trend = electionTrend(candidate.odds, candidate.previousOdds);
          const picked = isPicked(contest, candidate);
          return (
            <button
              key={candidate.id}
              onClick={() => onPick(contest, candidate)}
              className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                picked
                  ? 'border-[#00e701] bg-[#00e701]/10'
                  : 'border-[#21262d] bg-[#10141d] hover:border-[#00e701]/60 hover:bg-[#00e701]/5'
              }`}
              title={`${picked ? 'Remover do boletim' : 'Apostar em'} ${candidate.name}`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="w-5 h-5 rounded-full bg-[#1c2331] text-[10px] font-mono font-bold flex items-center justify-center text-slate-400 shrink-0">
                  {idx + 1}
                </span>
                <div className="truncate">
                  <span className="font-bold text-white block truncate text-xs">
                    {candidate.name}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate block">
                    {candidate.party}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {candidate.voteIntention != null && (
                  <span className="text-[10px] font-mono text-sky-300/90 px-1.5 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20">
                    {candidate.voteIntention.toFixed(1)}%
                  </span>
                )}
                {candidate.previousOdds != null && trend !== 'stable' && (
                  <span
                    className={`flex items-center gap-0.5 text-[10px] font-mono ${
                      trend === 'up' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {candidate.previousOdds.toFixed(2)}
                  </span>
                )}
                {candidate.previousOdds != null && trend === 'stable' && (
                  <Minus className="w-3 h-3 text-slate-600" />
                )}
                <span className="font-mono text-sm font-extrabold text-[#00e701]">
                  {candidate.odds.toFixed(2)}
                </span>
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                    picked
                      ? 'bg-[#00e701] border-[#00e701] text-black'
                      : 'border-[#30363d] text-slate-600'
                  }`}
                  aria-hidden="true"
                >
                  {picked ? '✓' : ''}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-2.5 flex items-start gap-2.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-300" />
        <p className="text-[11px] text-slate-300 leading-relaxed">{ELECTION_SOURCE_NOTE}</p>
      </div>

      {president && renderContest(president, true)}

      {governors.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-1">
            Governadores
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {governors.map(g => renderContest(g))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-500 text-center">
        Toque em um candidato para adicioná-lo ao boletim.
      </p>
    </div>
  );
};