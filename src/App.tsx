import React, { useState, useEffect, useMemo } from 'react';
import { INITIAL_MATCHES } from './data/mockMatches';
import { 
  Match, 
  BetSelection, 
  BetTicket, 
  UserWallet, 
  Transaction, 
  Market, 
  OddChoice, 
  ApiConnectionConfig 
} from './types/betting';
import { 
  updateMatchOddsDynamically, 
  triggerEventOnMatch, 
  toggleMarketSuspension, 
  playSoundEffect 
} from './services/sportsEngine';
import { 
  loadWallet, 
  saveWallet, 
  loadTransactions, 
  saveTransactions 
} from './services/paymentService';
import { 
  loadApiConfig, 
  saveApiConfig 
} from './services/sportsApi';
import { Header } from './components/Header';
import { SportsSidebar } from './components/SportsSidebar';
import { LivePitchTracker } from './components/LivePitchTracker';
import { MatchList } from './components/MatchList';
import { MatchDetailModal } from './components/MatchDetailModal';
import { BetSlip } from './components/BetSlip';
import { DepositModal } from './components/DepositModal';
import { WithdrawModal } from './components/WithdrawModal';
import { TransactionHistoryModal } from './components/TransactionHistoryModal';
import { ApiSimulatorModal } from './components/ApiSimulatorModal';

const INITIAL_TICKETS: BetTicket[] = [
  {
    id: 'tkt-open-101',
    date: 'Hoje, 16:45',
    type: 'single',
    selections: [
      {
        matchId: 'match-fla-pal',
        matchTitle: 'Flamengo vs Palmeiras',
        homeTeam: 'Flamengo',
        awayTeam: 'Palmeiras',
        league: 'Brasileirão Série A',
        sport: 'football',
        isLive: true,
        minute: 74,
        marketId: 'm-1x2',
        marketName: 'Resultado Final (1X2)',
        choiceId: '1',
        choiceLabel: 'Flamengo',
        odd: 2.35,
        initialOdd: 2.35,
      },
    ],
    totalOdd: 2.35,
    stake: 50.00,
    potentialReturn: 117.50,
    status: 'OPEN',
    cashoutValue: 68.50,
  },
  {
    id: 'tkt-won-102',
    date: 'Hoje, 14:10',
    type: 'single',
    selections: [
      {
        matchId: 'match-cor-sao',
        matchTitle: 'Corinthians vs São Paulo',
        homeTeam: 'Corinthians',
        awayTeam: 'São Paulo',
        league: 'Brasileirão Série A',
        sport: 'football',
        isLive: false,
        marketId: 'm-1x2',
        marketName: 'Resultado Final (1X2)',
        choiceId: '1',
        choiceLabel: 'Corinthians',
        odd: 1.85,
        initialOdd: 1.85,
      },
    ],
    totalOdd: 1.85,
    stake: 80.00,
    potentialReturn: 148.00,
    status: 'WON',
  },
];

export default function App() {
  // Main states
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [wallet, setWallet] = useState<UserWallet>(loadWallet);
  const [transactions, setTransactions] = useState<Transaction[]>(loadTransactions);
  const [tickets, setTickets] = useState<BetTicket[]>(() => {
    try {
      const saved = localStorage.getItem('betesporte_tickets');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_TICKETS;
  });
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [apiConfig, setApiConfig] = useState<ApiConnectionConfig>(loadApiConfig);
  const [isEngineRunning, setIsEngineRunning] = useState<boolean>(true);

  // Filters & Settings
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [selectedLeague, setSelectedLeague] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [oddsFormat, setOddsFormat] = useState<'decimal' | 'fractional' | 'american'>('decimal');
  const [autoAcceptOdds, setAutoAcceptOdds] = useState<boolean>(true);
  const [activeTrackerMatchId, setActiveTrackerMatchId] = useState<string>('match-fla-pal');

  // Modals
  const [isDepositOpen, setIsDepositOpen] = useState<boolean>(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState<boolean>(false);
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const [isMobileSlipOpen, setIsMobileSlipOpen] = useState<boolean>(false);

  // Save tickets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('betesporte_tickets', JSON.stringify(tickets));
    } catch {
      // ignore
    }
  }, [tickets]);

  // Synchronize active live match for tracker
  const activeTrackerMatch = useMemo(() => {
    return matches.find((m) => m.id === activeTrackerMatchId && m.status === 'LIVE') ||
      matches.find((m) => m.status === 'LIVE') ||
      null;
  }, [matches, activeTrackerMatchId]);

  // Count active live matches
  const liveCount = useMemo(() => {
    return matches.filter((m) => m.status === 'LIVE').length;
  }, [matches]);

  // REAL-TIME ENGINE LOOP: Dynamic odds ticker and game minute advancements
  useEffect(() => {
    if (!isEngineRunning) return;

    const intervalTime = Math.max(1500, apiConfig.pollingIntervalSeconds * 1000);
    const interval = setInterval(() => {
      setMatches((prevMatches) => {
        return prevMatches.map((m) => {
          if (m.status !== 'LIVE') return m;

          // Occasionally advance minute (every ~6-10 ticks)
          const shouldAdvanceMinute = Math.random() < 0.25 && m.minute < 90;
          const nextMinute = shouldAdvanceMinute ? m.minute + 1 : m.minute;

          // Random field attacks
          let nextAttackTeam = m.activeAttackTeam;
          let nextIntensity = m.attackIntensity;
          if (Math.random() < 0.3) {
            nextAttackTeam = Math.random() < 0.5 ? 'home' : 'away';
            nextIntensity = Math.random() < 0.35 ? 'dangerous' : 'normal';
          }

          const matchWithUpdatedOdds = updateMatchOddsDynamically({
            ...m,
            minute: nextMinute,
            activeAttackTeam: nextAttackTeam,
            attackIntensity: nextIntensity,
          });

          return matchWithUpdatedOdds;
        });
      });

      // Update selections in bet slip if odds changed
      setSelections((prevSelections) => {
        if (prevSelections.length === 0) return prevSelections;
        return prevSelections.map((sel) => {
          const match = matches.find((m) => m.id === sel.matchId);
          if (!match) return sel;
          const market = match.markets.find((mk) => mk.id === sel.marketId);
          if (!market) return sel;
          const choice = market.choices.find((c) => c.id === sel.choiceId);
          if (!choice) return sel;

          if (choice.value !== sel.odd) {
            return {
              ...sel,
              odd: autoAcceptOdds ? choice.value : sel.odd,
              currentOdd: choice.value,
              hasOddChanged: choice.value !== sel.initialOdd,
              isSuspended: choice.isSuspended,
            };
          }
          return sel;
        });
      });

      // Recalculate Cash Out on open tickets
      setTickets((prevTickets) => {
        return prevTickets.map((tkt) => {
          if (tkt.status !== 'OPEN') return tkt;
          // Random slight fluctuation in cashout value (between -2% and +3%)
          const jitter = (Math.random() * 0.05 - 0.02);
          const currentVal = tkt.cashoutValue || tkt.stake * 0.9;
          const nextCashout = Math.min(
            tkt.potentialReturn * 0.95,
            Math.max(tkt.stake * 0.3, Number((currentVal * (1 + jitter)).toFixed(2)))
          );
          return {
            ...tkt,
            cashoutValue: nextCashout,
          };
        });
      });
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isEngineRunning, apiConfig.pollingIntervalSeconds, autoAcceptOdds, matches]);

  // Bet Slip Handlers
  const handleToggleSelection = (match: Match, market: Market, choice: OddChoice) => {
    playSoundEffect('click');
    setSelections((prev) => {
      // Check if already in slip
      const exists = prev.some(
        (s) => s.matchId === match.id && s.marketId === market.id && s.choiceId === choice.id
      );
      if (exists) {
        return prev.filter(
          (s) => !(s.matchId === match.id && s.marketId === market.id && s.choiceId === choice.id)
        );
      }

      // If already has selection from SAME market on this match, replace it
      const filtered = prev.filter(
        (s) => !(s.matchId === match.id && s.marketId === market.id)
      );

      const newSelection: BetSelection = {
        matchId: match.id,
        matchTitle: `${match.homeTeam} vs ${match.awayTeam}`,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        league: match.league,
        sport: match.sport,
        isLive: match.status === 'LIVE',
        minute: match.minute,
        marketId: market.id,
        marketName: market.name,
        choiceId: choice.id,
        choiceLabel: choice.label,
        odd: choice.value,
        initialOdd: choice.value,
      };

      return [...filtered, newSelection];
    });
  };

  const handleRemoveSelection = (matchId: string, marketId: string, choiceId: string) => {
    setSelections((prev) =>
      prev.filter(
        (s) => !(s.matchId === matchId && s.marketId === marketId && s.choiceId === choiceId)
      )
    );
  };

  const handleClearAllSelections = () => {
    setSelections([]);
  };

  const handleAcceptOddChange = (matchId: string, marketId: string, choiceId: string) => {
    setSelections((prev) =>
      prev.map((s) => {
        if (s.matchId === matchId && s.marketId === marketId && s.choiceId === choiceId) {
          return {
            ...s,
            odd: s.currentOdd || s.odd,
            initialOdd: s.currentOdd || s.odd,
            hasOddChanged: false,
          };
        }
        return s;
      })
    );
  };

  const handlePlaceBet = (
    stake: number,
    type: 'single' | 'multiple',
    currentSelections: BetSelection[]
  ): boolean => {
    const totalBalance = wallet.realBalance + wallet.bonusBalance;
    if (stake > totalBalance) return false;

    // Deduct stake from wallet (real first, then bonus)
    let newReal = wallet.realBalance;
    let newBonus = wallet.bonusBalance;

    if (newReal >= stake) {
      newReal -= stake;
    } else {
      const diff = stake - newReal;
      newReal = 0;
      newBonus = Math.max(0, newBonus - diff);
    }

    const updatedWallet: UserWallet = {
      ...wallet,
      realBalance: Number(newReal.toFixed(2)),
      bonusBalance: Number(newBonus.toFixed(2)),
    };
    setWallet(updatedWallet);
    saveWallet(updatedWallet);

    // Calculate total odd & potential return
    const totalOdd = currentSelections.reduce((acc, s) => acc * s.odd, 1);
    let bonusPercentage = 0;
    if (currentSelections.length === 2) bonusPercentage = 5;
    else if (currentSelections.length === 3) bonusPercentage = 10;
    else if (currentSelections.length === 4) bonusPercentage = 15;
    else if (currentSelections.length >= 5) bonusPercentage = 25;

    const baseReturn = stake * totalOdd;
    const bonusAmount = (baseReturn * bonusPercentage) / 100;
    const potentialReturn = Number((baseReturn + bonusAmount).toFixed(2));

    const now = new Date();
    const dateStr = `Hoje, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newTicket: BetTicket = {
      id: `tkt-${Date.now()}`,
      date: dateStr,
      type,
      selections: [...currentSelections],
      totalOdd: Number(totalOdd.toFixed(2)),
      stake,
      potentialReturn,
      bonusPercentage,
      bonusAmount: Number(bonusAmount.toFixed(2)),
      status: 'OPEN',
      cashoutValue: Number((stake * 0.95).toFixed(2)),
    };

    setTickets((prev) => [newTicket, ...prev]);

    // Create transaction record
    const newTx: Transaction = {
      id: `tx-bet-${Date.now()}`,
      type: 'BET_PLACED',
      amount: stake,
      status: 'COMPLETED',
      date: 'Agora',
      description: `Aposta ${type === 'multiple' ? 'Múltipla' : 'Simples'} (${currentSelections.length} seleções)`,
      txid: `BET-${Math.floor(100000 + Math.random() * 900000)}`,
    };
    const updatedTxs = [newTx, ...transactions];
    setTransactions(updatedTxs);
    saveTransactions(updatedTxs);

    // Clear slip
    setSelections([]);
    return true;
  };

  const handleCashOut = (ticketId: string, amount: number) => {
    playSoundEffect('cashout');
    const updatedWallet: UserWallet = {
      ...wallet,
      realBalance: Number((wallet.realBalance + amount).toFixed(2)),
    };
    setWallet(updatedWallet);
    saveWallet(updatedWallet);

    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          return {
            ...t,
            status: 'CASHED_OUT',
            cashedOutAmount: amount,
            settledAt: 'Agora',
          };
        }
        return t;
      })
    );

    const newTx: Transaction = {
      id: `tx-co-${Date.now()}`,
      type: 'CASH_OUT',
      amount: amount,
      status: 'COMPLETED',
      date: 'Agora',
      description: `Cash Out Antecipado de Bilhete`,
      txid: `CO-${Math.floor(100000 + Math.random() * 900000)}`,
    };
    const updatedTxs = [newTx, ...transactions];
    setTransactions(updatedTxs);
    saveTransactions(updatedTxs);
  };

  // Payment Handlers
  const handleDepositSuccess = (amount: number, bonusAmount: number, tx: Transaction) => {
    const updatedWallet: UserWallet = {
      ...wallet,
      realBalance: Number((wallet.realBalance + amount).toFixed(2)),
      bonusBalance: Number((wallet.bonusBalance + bonusAmount).toFixed(2)),
    };
    setWallet(updatedWallet);
    saveWallet(updatedWallet);

    const updatedTxs = [tx, ...transactions];
    setTransactions(updatedTxs);
    saveTransactions(updatedTxs);
  };

  const handleWithdrawSuccess = (amount: number, tx: Transaction) => {
    const updatedWallet: UserWallet = {
      ...wallet,
      realBalance: Number(Math.max(0, wallet.realBalance - amount).toFixed(2)),
    };
    setWallet(updatedWallet);
    saveWallet(updatedWallet);

    const updatedTxs = [tx, ...transactions];
    setTransactions(updatedTxs);
    saveTransactions(updatedTxs);
  };

  // Live Event Sandbox Handlers
  const handleTriggerEvent = (
    matchId: string,
    eventType: 'goal' | 'corner' | 'card' | 'penalty' | 'dangerous_attack',
    team: 'home' | 'away'
  ) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id === matchId) {
          const updated = triggerEventOnMatch(m, eventType, team);
          if (detailMatch?.id === matchId) {
            setDetailMatch(updated);
          }
          return updated;
        }
        return m;
      })
    );
  };

  const handleToggleSuspend = (matchId: string, suspend: boolean) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id === matchId) {
          const updated = toggleMarketSuspension(m, suspend);
          if (detailMatch?.id === matchId) {
            setDetailMatch(updated);
          }
          return updated;
        }
        return m;
      })
    );
  };

  const handleForceOddsJitter = () => {
    setMatches((prev) => prev.map((m) => updateMatchOddsDynamically(m)));
  };

  // Filtered Matches
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          m.homeTeam.toLowerCase().includes(q) ||
          m.awayTeam.toLowerCase().includes(q) ||
          m.league.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      // Sport filter
      if (selectedSport === 'live' && m.status !== 'LIVE') return false;
      if (selectedSport !== 'all' && selectedSport !== 'live' && m.sport !== selectedSport) {
        return false;
      }

      // League filter
      if (selectedLeague !== 'all' && m.league !== selectedLeague) return false;

      // Time filter
      if (timeFilter === 'live' && m.status !== 'LIVE') return false;
      if (timeFilter === 'today' && !m.startTime.includes('Hoje')) return false;
      if (timeFilter === 'tomorrow' && !m.startTime.includes('Amanhã')) return false;
      if (timeFilter === 'hot' && !m.isSuperOdd) return false;

      return true;
    });
  }, [matches, searchQuery, selectedSport, selectedLeague, timeFilter]);

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <Header
        wallet={wallet}
        liveMatchesCount={liveCount}
        onOpenDeposit={() => setIsDepositOpen(true)}
        onOpenWithdraw={() => setIsWithdrawOpen(true)}
        onOpenApiModal={() => setIsApiModalOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeSportFilter={selectedSport}
        onSelectSport={(sp) => {
          setSelectedSport(sp);
          setSelectedLeague('all');
        }}
        oddsFormat={oddsFormat}
        onOddsFormatChange={setOddsFormat}
        autoAcceptOdds={autoAcceptOdds}
        onToggleAutoAcceptOdds={() => setAutoAcceptOdds(!autoAcceptOdds)}
      />

      {/* Main Layout Container */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-3 sm:px-6 py-4 flex flex-col lg:flex-row items-start gap-4">
        {/* Left Sidebar: Sports Categories & Leagues */}
        <SportsSidebar
          selectedSport={selectedSport}
          onSelectSport={setSelectedSport}
          selectedLeague={selectedLeague}
          onSelectLeague={setSelectedLeague}
          liveMatchesCount={liveCount}
          timeFilter={timeFilter}
          onSelectTimeFilter={setTimeFilter}
        />

        {/* Center Main: Live Pitch Tracker + Match Cards */}
        <div className="flex-1 w-full min-w-0 flex flex-col">
          {/* Active Live Match Tracker Showcase (If there's an active live match) */}
          {activeTrackerMatch && (
            <LivePitchTracker match={activeTrackerMatch} />
          )}

          {/* Matches List Grid */}
          <MatchList
            matches={filteredMatches}
            selectedSelections={selections}
            onToggleSelection={handleToggleSelection}
            onOpenMatchDetails={(m) => setDetailMatch(m)}
            onSelectLiveTrackerMatch={(m) => setActiveTrackerMatchId(m.id)}
            activeTrackerMatchId={activeTrackerMatch?.id}
            oddsFormat={oddsFormat}
          />
        </div>

        {/* Right Sidebar: Bet Slip & Cash Out */}
        <BetSlip
          selections={selections}
          onRemoveSelection={handleRemoveSelection}
          onClearAll={handleClearAllSelections}
          onAcceptOddChange={handleAcceptOddChange}
          autoAcceptOdds={autoAcceptOdds}
          wallet={wallet}
          onPlaceBet={handlePlaceBet}
          tickets={tickets}
          onCashOut={handleCashOut}
          onOpenDeposit={() => setIsDepositOpen(true)}
          isMobileOpen={isMobileSlipOpen}
          onToggleMobile={() => setIsMobileSlipOpen(!isMobileSlipOpen)}
        />
      </main>

      {/* Footer */}
      <footer className="bg-[#0d1117] border-t border-[#21262d] py-6 px-4 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-[1720px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-extrabold text-white">BET<span className="text-[#00e701]">ESPORTE</span> PRO</span>
            <span>·</span>
            <span>Sistema Oficial de Apostas Esportivas</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>PIX Instantâneo 24/7</span>
            <span>·</span>
            <span>Liquidação Automática SPI</span>
            <span>·</span>
            <span className="text-amber-400 font-bold">18+ Jogo Responsável</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <MatchDetailModal
        match={detailMatch}
        onClose={() => setDetailMatch(null)}
        selectedSelections={selections}
        onToggleSelection={handleToggleSelection}
        oddsFormat={oddsFormat}
      />

      <DepositModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        onDepositSuccess={handleDepositSuccess}
      />

      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        wallet={wallet}
        onWithdrawSuccess={handleWithdrawSuccess}
      />

      <TransactionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        transactions={transactions}
      />

      <ApiSimulatorModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        config={apiConfig}
        onSaveConfig={(cfg) => {
          setApiConfig(cfg);
          saveApiConfig(cfg);
        }}
        matches={matches}
        onTriggerEvent={handleTriggerEvent}
        onToggleSuspend={handleToggleSuspend}
        onForceOddsJitter={handleForceOddsJitter}
        isEngineRunning={isEngineRunning}
        onToggleEngine={() => setIsEngineRunning(!isEngineRunning)}
      />
    </div>
  );
}
