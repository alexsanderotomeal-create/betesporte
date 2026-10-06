import React, { useMemo, useState } from 'react';
import {
  X,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Vote,
  Loader2,
  Info,
} from 'lucide-react';
import {
  ELECTION_SCOPE_LABEL,
  ELECTION_SETTLEMENT_RULE,
  ELECTION_SOURCE_NOTE,
  ElectionContest,
  ElectionScope,
  electionTrend,
} from '../types/election';

const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface ElectionOfficialModalProps {
  isOpen: boolean;
  onClose: () => void;
  contests: ElectionContest[];
  /** Mensagem de erro da ultima tentativa de aposta, se houver. */
  error?: string | null;
  isSubmitting: boolean;
  walletBalance: number;
  onPlaceBet: (contest: ElectionContest, candidateId: string, stake: number) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  isAuthenticated: boolean;
  onOpenDeposit: () => void;
}

/**
 * Mercado eleitoral — presidente e governador.
 *
 * Este componente ja foi uma vitrine de "pesquisas registradas no TSE" com
 * percentual de intencao de voto, rejeicao, margem de erro e registro oficial.
 * Os numeros nao existiam. Agora e um mercado de aposta de verdade: mostra a
 * cotacao da casa, deixa o usuario apostar e diz, em tela, que o numero e preco
 * e nao pesquisa.
 */
export const ElectionOfficialModal: React.FC<ElectionOfficialModalProps> = ({
  isOpen,
  onClose,
  contests,
  error,
  isSubmitting,
  walletBalance,
  onPlaceBet,
  onOpenAuth,
  isAuthenticated,
  onOpenDeposit,
}) => {
  const [scope, setScope] = useState<ElectionScope>('PRESIDENT');
  const [stateCode, setStateCode] = useState<string>('');
  const [picked, setPicked] = useState<{ contestId: string; candidateId: string } | null>(null);
  const [stake, setStake] = useState<string>('');

  const byScope = useMemo(() => contests.filter(c => c.scope === scope), [contests, scope]);

  const availableStates = useMemo(() => {
    const codes = new Set(
      byScope.filter(c => c.stateCode).map(c => c.stateCode as string)
    );
    return [...codes].sort();
  }, [byScope]);

  // Sem estado escolhido, cai no primeiro prototyping disponivel.
  const activeContest = useMemo(() => {
    if (scope === 'PRESIDENT') return byScope.find(c => !c.stateCode) ?? byScope[0];
    return byScope.find(c => c.stateCode === stateCode) ?? byScope[0];
  }, [byScope, scope, stateCode]);

  const pickedCandidate = useMemo(
    () => activeContest?.candidates.find(c => c.id === picked?.candidateId),
    [activeContest, picked]
  );

  const stakeValue = Number(stake) || 0;
  const returnValue = pickedCandidate ? stakeValue * pickedCandidate.odds : 0;
  const insufficient = stakeValue > 0 && stakeValue > walletBalance;

  if (!isOpen) return null;

  const submit = () => {
    if (!isAuthenticated) {
      onOpenAuth('login');
      return;
    }
    if (!activeContest || !picked) return;
    if (stakeValue <= 0 || insufficient) return;
    onPlaceBet(activeContest, picked.candidateId, stakeValue);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#161b22] to-[#12161f] px-4 py-3.5 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[#00e701]">
              <Vote className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm sm:text-base font-extrabold text-white block leading-tight">
                Mercado Eleitoral
              </span>
              <span className="text-[10px] text-slate-400">
                Presidência e governo estadual · cotação da casa
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d]"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto flex flex-col gap-4 text-xs">
          {/*
            Aviso de origem do numero. Fica sempre visivel, acima da lista: e o
            que separa "preco" de "pesquisa" para quem abre a tela.
          */}
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 flex items-start gap-3 text-amber-200">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block mb-0.5">
                Os valores são cotação, não pesquisa
              </span>
              <p className="text-[11px] text-slate-300 leading-relaxed">{ELECTION_SOURCE_NOTE}</p>
            </div>
          </div>

          {/* Escopo */}
          <div className="flex gap-2">
            {(['PRESIDENT', 'GOVERNOR'] as ElectionScope[]).map(option => {
              const disabled = !contests.some(c => c.scope === option);
              return (
                <button
                  key={option}
                  onClick={() => {
                    setScope(option);
                    setPicked(null);
                    setStateCode('');
                  }}
                  disabled={disabled}
                  className={`flex-1 px-3 py-2 rounded-lg border text-[11px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                    scope === option
                      ? 'bg-[#00e701] text-black border-[#00e701]'
                      : 'bg-[#161b22] border-[#252d3d] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {option === 'PRESIDENT' ? 'Presidente' : 'Governador'}
                </button>
              );
            })}
          </div>

          {/* Estado */}
          {scope === 'GOVERNOR' && availableStates.length > 0 && (
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                Estado
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableStates.map(code => (
                  <button
                    key={code}
                    onClick={() => {
                      setStateCode(code);
                      setPicked(null);
                    }}
                    className={`px-2.5 py-1.5 rounded-md border font-mono font-bold text-[11px] transition-colors ${
                      activeContest?.stateCode === code
                        ? 'bg-[#00e701] text-black border-[#00e701]'
                        : 'bg-[#10141d] border-[#21262d] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contesto */}
          {activeContest && (
            <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 border-b border-[#21262d] pb-2">
                <Vote className="w-4 h-4 text-[#00e701]" />
                <span className="font-bold text-white">
                  {activeContest.title ?? ELECTION_SCOPE_LABEL[activeContest.scope]}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {activeContest.candidates.map((candidate, idx) => {
                  const trend = electionTrend(candidate.odds, candidate.previousOdds);
                  const isPicked = picked?.candidateId === candidate.id;

                  return (
                    <button
                      key={candidate.id}
                      onClick={() => setPicked({ contestId: activeContest.id, candidateId: candidate.id })}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-left transition-colors ${
                        isPicked
                          ? 'border-[#00e701] bg-[#00e701]/10'
                          : 'border-[#21262d] bg-[#10141d] hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-[#1c2331] text-[10px] font-mono font-bold flex items-center justify-center text-slate-400 shrink-0">
                          {idx + 1}
                        </span>
                        <div className="truncate">
                          <span className="font-bold text-white block truncate text-xs">
                            {candidate.name}
                          </span>
                          {candidate.party && (
                            <span className="text-[10px] text-slate-400 truncate block">
                              {candidate.party}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {candidate.voteIntention != null && (
                          <span
                            className="text-[10px] font-mono text-sky-300/90 px-1.5 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20"
                            title="Intenção de voto (apuração/pesquisa)"
                          >
                            {candidate.voteIntention.toFixed(1)}%
                          </span>
                        )}
                        {candidate.previousOdds != null && trend !== 'stable' && (
                          <span
                            className={`flex items-center gap-0.5 text-[10px] font-mono ${
                              trend === 'up' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {trend === 'up' ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {candidate.previousOdds.toFixed(2)}
                          </span>
                        )}
                        {candidate.previousOdds != null && trend === 'stable' && (
                          <Minus className="w-3 h-3 text-slate-600" />
                        )}
                        <span className="font-mono text-sm font-extrabold text-[#00e701]">
                          {candidate.odds.toFixed(2)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeContest.candidates.some(c => c.pollSource) && (
                <div className="text-[10px] text-slate-500 leading-relaxed border-t border-[#21262d] pt-2 mt-1">
                  Intenção de voto (%) com fonte informativa na apuração/pesquisa:
                  {activeContest.candidates
                    .filter(c => c.voteIntention != null && c.pollSource)
                    .map(c => (
                      <span key={c.id}>
                        {' '}
                        <span className="text-slate-300">{c.name}</span>{' '}
                        {c.voteIntention!.toFixed(1)}% ({c.pollSource}
                        {c.pollDate ? `, ${c.pollDate}` : ''})
                        {' · '}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {!activeContest && (
            <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-6 text-center text-slate-400 text-xs">
              Nenhum prototyping {scope === 'PRESIDENT' ? 'presidencial' : 'de governador'} aberto.
            </div>
          )}

          {/* Aposta */}
          {activeContest && pickedCandidate && (
            <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Sua aposta
                </span>
                <span className="font-bold text-white text-xs">{pickedCandidate.name}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stake}
                  onChange={e => setStake(e.target.value)}
                  placeholder="0,00"
                  className="flex-1 bg-[#0b0e14] border border-[#252d3d] rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#00e701]"
                />
                <button
                  onClick={() => setStake(String(Math.min(walletBalance, 100)))}
                  className="px-2.5 py-2 rounded-lg bg-[#1c2331] border border-[#252d3d] text-[10px] font-bold uppercase hover:border-slate-500 shrink-0"
                >
                  100
                </button>
                <button
                  onClick={() => setStake(String(walletBalance))}
                  className="px-2.5 py-2 rounded-lg bg-[#1c2331] border border-[#252d3d] text-[10px] font-bold uppercase hover:border-slate-500 shrink-0"
                >
                  Máx
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Retorno potencial</span>
                <span className="font-mono font-extrabold text-white">
                  {formatBRL(returnValue)}
                </span>
              </div>

              {error && (
                <p className="text-[11px] text-rose-400 bg-rose-950/30 border border-rose-500/30 rounded-lg px-2.5 py-2">
                  {error}
                </p>
              )}

              {insufficient && (
                <button
                  onClick={onOpenDeposit}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 text-left"
                >
                  Saldo insuficiente — fazer depósito
                </button>
              )}

              <button
                onClick={submit}
                disabled={isSubmitting || stakeValue <= 0 || insufficient}
                className="w-full py-2.5 rounded-xl bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold uppercase tracking-wide cursor-pointer transition-colors shadow-md shadow-[#00e701]/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSubmitting ? 'Registrando...' : 'Confirmar aposta'}
              </button>
            </div>
          )}

          {/* Regra de liquidacao */}
          <div className="bg-[#10141d] border border-[#21262d] rounded-xl p-3 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {ELECTION_SETTLEMENT_RULE}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};