import React, { useEffect, useState } from 'react';
import { 
  Trash2, 
  AlertCircle, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BetSelection, BetTicket, UserWallet } from '../types/betting';
import { UserAccount } from '../types/auth';
import { playSoundEffect } from '../services/sportsEngine';

interface BetSlipProps {
  selections: BetSelection[];
  onRemoveSelection: (matchId: string, marketId: string, choiceId: string) => void;
  onClearAll: () => void;
  onAcceptOddChange: (matchId: string, marketId: string, choiceId: string) => void;
  autoAcceptOdds: boolean;
  wallet: UserWallet;
  onPlaceBet: (stake: number, type: 'single' | 'multiple', selections: BetSelection[]) => Promise<boolean>;
  tickets: BetTicket[];
  onOpenDeposit: () => void;
  isMobileOpen: boolean;
  onToggleMobile: () => void;
  currentUser?: UserAccount | null;
  onOpenAuth?: (mode: 'login' | 'register') => void;
  /** Incrementar para levar o painel a `tab` (clique na vitrine ou aposta confirmada fora dele). */
  focusSignal?: { n: number; tab: 'slip' | 'my_bets' };
}

export const BetSlip: React.FC<BetSlipProps> = ({
  selections,
  onRemoveSelection,
  onClearAll,
  onAcceptOddChange,
  autoAcceptOdds,
  wallet,
  onPlaceBet,
  tickets,
  onOpenDeposit,
  isMobileOpen,
  onToggleMobile,
  currentUser,
  onOpenAuth,
  focusSignal,
}) => {
  const [activeTab, setActiveTab] = useState<'slip' | 'my_bets'>('slip');
  const [stake, setStake] = useState<string>('20');
  const [lastPlacedTicket, setLastPlacedTicket] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const focusN = focusSignal?.n ?? 0;
  const focusTab = focusSignal?.tab;
  useEffect(() => {
    if (focusN > 0 && focusTab) setActiveTab(focusTab);
  }, [focusN, focusTab]);

  const numStake = parseFloat(stake) || 0;

  // Calculate combined odds
  const totalOdd = selections.reduce((acc, sel) => acc * sel.odd, 1);
  const formattedTotalOdd = totalOdd > 0 ? totalOdd.toFixed(2) : '1.00';

  // Multiplier Combo Bonus calculation — a mesma escada que o banco aplica em
  // place_bet_atomic (migration 0009), para o retorno da tela ser o pago.
  let bonusPercentage = 0;
  if (selections.length === 2) bonusPercentage = 5;
  else if (selections.length === 3) bonusPercentage = 10;
  else if (selections.length === 4) bonusPercentage = 15;
  else if (selections.length >= 5) bonusPercentage = 25;

  const baseReturn = numStake * totalOdd;
  const bonusAmount = (baseReturn * bonusPercentage) / 100;
  const potentialPayout = baseReturn + bonusAmount;

  const hasOddChanges = selections.some((s) => s.hasOddChanged && !autoAcceptOdds);
  const hasSuspendedSelections = selections.some((s) => s.isSuspended);
  const isInsufficientBalance = numStake > (wallet.realBalance + wallet.bonusBalance);
  // Eleicao nao se combina: o RPC dela aceita uma unica selecao e o de jogo
  // so entende market_choices. Boletim misturado seria rejeitado no banco.
  const hasElection = selections.some((s) => s.kind === 'election');
  const isBlockedCombo = hasElection && selections.length > 1;

  const handleQuickAddStake = (amount: number) => {
    const cur = parseFloat(stake) || 0;
    setStake((cur + amount).toString());
  };

  // Async porque a aposta passa por `place_bet_atomic` no Postgres. A celebracao
// so dispara se o banco confirmar o debito — antes, bastava subtrair na tela.
  const handleFinalizeBet = async () => {
    if (selections.length === 0 || numStake <= 0) return;
    if (isInsufficientBalance) {
      onOpenDeposit();
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await onPlaceBet(
        numStake,
        // Com 2+ selecoes as odds sao multiplicadas no banco, entao a aposta e
        // combo — o tipo e uma consequencia da contagem, nao uma escolha.
        selections.length > 1 ? 'multiple' : 'single',
        selections
      );
      if (!success) return;

      playSoundEffect('bet_placed');
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#00e701', '#ffffff', '#fbbf24'],
      });
      setLastPlacedTicket(Date.now().toString());
      setTimeout(() => setLastPlacedTicket(null), 4000);
      setActiveTab('my_bets');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeTickets = tickets.filter((t) => t.status === 'OPEN');
  const settledTickets = tickets.filter((t) => t.status !== 'OPEN');

  return (
    <>
      {/* Mobile Floating Drawer Trigger */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#12161f] border-t border-[#21262d] p-3 shadow-2xl flex items-center justify-between">
        <button
          onClick={onToggleMobile}
          className="flex-1 flex items-center justify-between bg-[#161b22] border border-[#30363d] px-3.5 py-2 rounded-xl text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#00e701] text-black font-extrabold text-xs flex items-center justify-center font-mono">
              {selections.length}
            </span>
            <span className="text-xs font-bold text-white">Boletim de Apostas</span>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-[#00e701]">
              Odd {formattedTotalOdd}
            </span>
          </div>
        </button>

        <button
          onClick={onToggleMobile}
          className="ml-2 p-2.5 rounded-xl bg-[#00e701] text-black font-bold"
        >
          {isMobileOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Bet Slip Container (Desktop Sidebar & Mobile Drawer) */}
      <aside
        className={`w-full lg:w-80 shrink-0 flex flex-col bg-[#12161f] border border-[#21262d] rounded-2xl shadow-xl overflow-hidden transition-all duration-300 z-30 ${
          isMobileOpen 
            ? 'fixed inset-x-0 bottom-16 max-h-[80vh] m-2 z-30 flex' 
            : 'hidden lg:flex sticky top-20 self-start max-h-[calc(100vh-6rem)]'
        }`}
      >
        {/* Top Header Tabs */}
        <div className="bg-[#161b22] border-b border-[#21262d] flex items-center justify-between p-1">
          <div className="flex items-center gap-1 flex-1">
            <button
              onClick={() => setActiveTab('slip')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'slip'
                  ? 'bg-[#21262d] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Boletim</span>
              {selections.length > 0 && (
                <span className="px-1.5 py-0.2 bg-[#00e701] text-black font-extrabold rounded-full text-[10px] font-mono">
                  {selections.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('my_bets')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'my_bets'
                  ? 'bg-[#21262d] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Minhas Apostas</span>
              {activeTickets.length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-400 text-black font-extrabold rounded-full text-[10px] font-mono">
                  {activeTickets.length}
                </span>
              )}
            </button>
          </div>

          {/* Close for mobile */}
          <button
            onClick={onToggleMobile}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TAB 1: BET SLIP */}
        {activeTab === 'slip' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Selections Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 max-h-[380px]">
              {selections.length === 0 ? (
                <div className="py-12 px-4 text-center text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#21262d] flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <TrendingUp className="w-5 h-5 text-[#00e701]" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-300">Seu boletim está vazio</h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Selecione as cotações desejadas em qualquer partida para começar a montar seu bilhete.
                  </p>
                </div>
              ) : (
                selections.map((item) => (
                  <div
                    key={`${item.matchId}-${item.marketId}-${item.choiceId}`}
                    className="bg-[#161b22] border border-[#252d3d] rounded-xl p-2.5 relative flex flex-col gap-1 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[10px] text-slate-400 truncate">
                          {item.league}
                        </span>
                        <span className="text-xs font-semibold text-white truncate">
                          {item.kind === 'election'
                            ? item.matchTitle
                            : `${item.homeTeam} vs ${item.awayTeam}`}
                        </span>
                      </div>
                      <button
                        onClick={() => onRemoveSelection(item.matchId, item.marketId, item.choiceId)}
                        className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors"
                        title="Remover seleção"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#21262d] mt-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400">{item.marketName}</span>
                        <span className="font-bold text-white text-xs">{item.choiceLabel}</span>
                      </div>
                      <span className="font-mono text-sm font-extrabold text-[#00e701]">
                        {item.odd.toFixed(2)}
                      </span>
                    </div>

                    {/* Odd change warning if any */}
                    {item.hasOddChanged && (
                      <div className="mt-1 bg-amber-950/60 border border-amber-600/40 rounded p-1.5 flex items-center justify-between text-[10px] text-amber-300">
                        <span>Odd atualizada para {item.odd.toFixed(2)}</span>
                        <button
                          onClick={() => onAcceptOddChange(item.matchId, item.marketId, item.choiceId)}
                          className="px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold"
                        >
                          Aceitar
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Bottom Calculation & Submission Bar */}
            {selections.length > 0 && (
              <div className="p-3 bg-[#10141d] border-t border-[#21262d] flex flex-col gap-2.5">
                {/* Clear all */}
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{selections.length} {selections.length === 1 ? 'Seleção' : 'Seleções'}</span>
                  <button
                    onClick={onClearAll}
                    className="hover:text-rose-400 transition-colors"
                  >
                    Limpar tudo
                  </button>
                </div>

                {/* Stake Input */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-300 font-semibold">Valor da Aposta (R$)</span>
                    <span className="text-[10px] text-slate-400">
                      Saldo: R$ {wallet.realBalance.toFixed(2)}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400 font-bold">
                      R$
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-lg pl-9 pr-3 py-1.5 text-sm font-mono font-bold text-white focus:outline-none"
                    />
                  </div>

                  {/* Quick Chips */}
                  <div className="grid grid-cols-5 gap-1 mt-1.5">
                    {[5, 10, 20, 50, 100].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => handleQuickAddStake(amt)}
                        className="py-1 text-[10px] font-mono font-bold rounded bg-[#1c2331] hover:bg-[#252f42] text-slate-300 hover:text-white transition-colors"
                      >
                        +{amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary Metrics */}
                <div className="bg-[#161b22] p-2.5 rounded-xl border border-[#252d3d] flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Cotação Total:</span>
                    <span className="font-mono font-bold text-white">{formattedTotalOdd}</span>
                  </div>

                  {bonusPercentage > 0 && (
                    <div className="flex items-center justify-between text-amber-400 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Bônus Múltipla (+{bonusPercentage}%):
                      </span>
                      <span className="font-mono font-bold">+R$ {bonusAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-[#21262d] text-sm">
                    <span className="font-bold text-white">Retorno Potencial:</span>
                    <span className="font-mono font-extrabold text-[#00e701]">
                      R$ {potentialPayout.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Submit Bet Button */}
                {isBlockedCombo && (
                  <p className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-lg px-2.5 py-2">
                    Aposta eleitoral entra sozinha: remova as outras seleções do boletim.
                  </p>
                )}
                {!currentUser ? (
                  <button
                    onClick={() => onOpenAuth && onOpenAuth('login')}
                    className="w-full py-3 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 bg-[#00e701] hover:bg-[#00c901] active:scale-[0.99] text-black shadow-md shadow-[#00e701]/30 cursor-pointer"
                  >
                    <span>Entrar ou Cadastrar para Apostar</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    disabled={hasSuspendedSelections || isBlockedCombo}
                    onClick={handleFinalizeBet}
                    className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                      hasSuspendedSelections || isBlockedCombo
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : isInsufficientBalance
                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
                        : 'bg-[#00e701] hover:bg-[#00c901] active:scale-[0.99] text-black shadow-[#00e701]/30'
                    }`}
                  >
                    {isBlockedCombo ? (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>Seleção eleitoral isolada</span>
                      </>
                    ) : isInsufficientBalance ? (
                      <>
                        <span>Saldo Insuficiente - Depositar PIX</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Fazer Aposta</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MY BETS */}
        {activeTab === 'my_bets' && (
          <div className="flex flex-col flex-1 overflow-y-auto p-3 gap-3 max-h-[500px]">
            {tickets.length === 0 ? (
              <div className="py-12 px-4 text-center text-slate-500">
                <Clock className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <h4 className="text-xs font-bold text-slate-300">Nenhuma aposta ativa</h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Seus bilhetes em aberto e finalizados aparecerão aqui em tempo real.
                </p>
              </div>
            ) : (
              tickets.map((ticket) => {
                const isOpen = ticket.status === 'OPEN';
                const isWon = ticket.status === 'WON';
                const isCashed = ticket.status === 'CASHED_OUT';

                return (
                  <div
                    key={ticket.id}
                    className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3 flex flex-col gap-2 text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-[#21262d] pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isOpen ? 'bg-amber-500/20 text-amber-300' :
                          isWon ? 'bg-[#00e701]/20 text-[#00e701]' :
                          isCashed ? 'bg-sky-500/20 text-sky-400' :
                          ticket.status === 'VOID' ? 'bg-slate-500/20 text-slate-300' :
                          'bg-rose-500/20 text-rose-400'
                        }`}>
                          {ticket.status === 'OPEN' ? 'Em Aberto' : ticket.status === 'WON' ? 'Ganha' : ticket.status === 'CASHED_OUT' ? 'Encerrada (Cash Out)' : ticket.status === 'VOID' ? 'Anulada' : 'Perdida'}
                        </span>
                        <span className="text-[10px] text-slate-400">{ticket.date}</span>
                      </div>
                      <span className="font-mono text-slate-400 text-[11px]">
                        Odd: {ticket.totalOdd.toFixed(2)}
                      </span>
                    </div>

                    {/* Ticket Selections */}
                    <div className="flex flex-col gap-1.5 py-1">
                      {ticket.selections.map((sel, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px]">
                          <div className="truncate pr-2">
                            <span className="text-white font-medium block truncate">
                              {sel.kind === 'election' ? sel.matchTitle : `${sel.homeTeam} x ${sel.awayTeam}`}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {sel.marketName} · <strong className="text-slate-200">{sel.choiceLabel}</strong>
                            </span>
                          </div>
                          <span className="font-mono text-slate-300 font-bold shrink-0">
                            {sel.odd.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Staked & Return */}
                    <div className="bg-[#10141d] p-2 rounded-lg flex items-center justify-between font-mono text-[11px] border border-[#1e2533]">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase">Apostado</span>
                        <span className="text-white font-bold">R$ {ticket.stake.toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[9px] uppercase">Retorno</span>
                        <span className="text-[#00e701] font-bold">R$ {ticket.potentialReturn.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Bilhete encerrado por cash out la no servidor: aqui so o
                        aviso. O botao de encerramento depende de uma RPC de
                        liquidacao antecipada que ainda nao existe. */}
                    {isCashed && ticket.cashedOutAmount && (
                      <div className="text-center text-[10px] text-sky-400 font-semibold bg-sky-950/40 p-1 rounded">
                        Encerrada com Cash Out de R$ {ticket.cashedOutAmount.toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </aside>
    </>
  );
};
