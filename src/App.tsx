import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { INITIAL_MATCHES } from './data/mockMatches';
import { 
  Match, 
  BetSelection, 
  BetTicket, 
  UserWallet, 
  Transaction, 
  Market, 
  OddChoice, 
  ApiConnectionConfig,
  SuperOddPromo
} from './types/betting';
import { 
  UserAccount, 
  DepositRequest, 
  WithdrawRequest, 
  HouseSettings 
} from './types/auth';
import { 
  updateMatchOddsDynamically, 
  triggerEventOnMatch, 
  toggleMarketSuspension, 
  playSoundEffect 
} from './services/sportsEngine';
import {
  DEFAULT_API_CONFIG
} from './services/sportsApi';
import {
  DEFAULT_HOUSE_SETTINGS,
  createDepositRequest,
  createWithdrawRequest,
  fetchAllBets,
  fetchAllDeposits,
  fetchAllProfiles,
  fetchAllWithdrawals,
  fetchAccount,
  fetchDeposits,
  fetchHouseSettings,
  fetchTransactions,
  fetchWithdrawals,
  fetchLiveMatches,
  fetchSuperOdd,
  SuperOddConfig,
  fetchElectionContests,
  fetchBets,
  syncMatchFeed,
  placeBet,
  placeElectionBet,
} from './services/dataService';
import { adminActions } from './services/adminService';
import {
  onAuthStateChange,
  signOut as authSignOut,
} from './services/auth';
import { isSupabaseConfigured } from './lib/supabase';

/** Extrai a mensagem util de um erro desconhecido, sem revelar stack no toast. */
function toastMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Chave de comparação de liga sem acento/maiúscula: o filtro por liga é uma
 * igualdade, e o nome que chega do feed ('Brasileirao Serie A') não casa com
 * a versão acentuada exibida em outros lugares ('Brasileirão Série A').
 */
function leagueKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

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
import { AuthModal } from './components/AuthModal';
import { UserDashboardModal } from './components/UserDashboardModal';
import { AdminPanelPage } from './components/AdminPanelPage';
import { ElectionOfficialModal } from './components/ElectionOfficialModal';
import { ElectionShowcase } from './components/ElectionShowcase';
import { ShieldCheck, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { ElectionContest, ElectionCandidate, ELECTION_SCOPE_LABEL } from './types/election';

export default function App() {
  // Main sports & betting states
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tickets, setTickets] = useState<BetTicket[]>([]);
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [apiConfig, setApiConfig] = useState<ApiConnectionConfig>(DEFAULT_API_CONFIG);
  const [isEngineRunning, setIsEngineRunning] = useState<boolean>(true);

  // Sessao e dados de conta. Sem sessao, tudo abaixo fica vazio — o modo
  // visitante nao tem carteira, extrato nem pedidos.
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [wallet, setWallet] = useState<UserWallet>({ realBalance: 0, bonusBalance: 0, currency: 'BRL' });
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [depositRequests, setDepositRequests] = useState<DepositRequest[]>([]);
  // Fila de liquidacao do painel admin: apostas de todos os usuarios.
  const [adminBets, setAdminBets] = useState<BetTicket[]>([]);
  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawRequest[]>([]);
  const [houseSettings, setHouseSettings] = useState<HouseSettings>(DEFAULT_HOUSE_SETTINGS);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // some sozinho, senao o aviso de erro fica na tela para sempre
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Filters & Settings
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [selectedLeague, setSelectedLeague] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [oddsFormat, setOddsFormat] = useState<'decimal' | 'fractional' | 'american'>('decimal');
  const [autoAcceptOdds, setAutoAcceptOdds] = useState<boolean>(true);
  const [activeTrackerMatchId, setActiveTrackerMatchId] = useState<string>('match-fla-pal');

  // Modals state
  const [isDepositOpen, setIsDepositOpen] = useState<boolean>(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState<boolean>(false);
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const [isMobileSlipOpen, setIsMobileSlipOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Auth & Admin Modals
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [authInitialMode, setAuthInitialMode] = useState<
    'login' | 'register' | 'new-password'
  >('login');
  const [isDashboardOpen, setIsDashboardOpen] = useState<boolean>(false);
  const [adminViewOpen, setAdminViewOpen] = useState<boolean>(false);

  // Database Sync & Mercado Eleitoral
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  /**
   * Campanha Super Odd Turbinada (system_settings). Resolvida contra `matches`
   * num memo — sem os dois jogos carregados nao ha banner nem aposta.
   */
  const [superOddConfig, setSuperOddConfig] = useState<SuperOddConfig | null>(null);
  const [isElectionModalOpen, setIsElectionModalOpen] = useState<boolean>(false);
  const [electionContests, setElectionContests] = useState<ElectionContest[]>([]);
  const [isElectionSubmitting, setIsElectionSubmitting] = useState<boolean>(false);
  const [electionError, setElectionError] = useState<string | null>(null);
  /**
   * Leva o boletim para uma aba. O numero incrementa para cada pedido (o
   * painel pode ja estar aberto na aba certa); a aba diz se o clique quer ver
   * o Boletim (selecao nova) ou Minhas Apostas (aposta confirmada).
   */
  const [slipFocus, setSlipFocus] = useState<{
    n: number;
    tab: 'slip' | 'my_bets';
  }>({ n: 0, tab: 'my_bets' });

  /**
 * Partidas vem do Supabase.
 *
 * As chamadas antigas apontavam para /api/matches num Express que nao existe mais
 * (a Vercel hospeda so o front) e devolviam sucesso falso: qualquer falha caia
 * num retorno silencioso. Quando a consulta falha, o app continua com
 * INITIAL_MATCHES — o usuario ve a interface em vez de tela branca.
 */
  useEffect(() => {
    fetchLiveMatches()
      .then((live) => {
        if (live.length > 0) setMatches(live);
      })
      .catch(() => {
        // Sem partidas no banco (ou RLS fechada): mantem o estado inicial.
      });
    fetchSuperOdd().then(setSuperOddConfig);

    loadElectionContests();
  }, []);

  /**
   * Atualizacao periodica do feed real (ESPN) para usuarios autenticados.
   *
   * O Edge sync-sports tem trava de 45s; este loop de 2 min chama o feed e
   * relê o catalogo do banco em silencio. Falha nao estoura toast: o botão
   * manual no painel continua disponivel para quem quer ver o resultado.
   */
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await syncMatchFeed();
        if (cancelled) return;
        const [live, promo] = await Promise.all([fetchLiveMatches(), fetchSuperOdd()]);
        if (cancelled) return;
        if (live.length > 0) setMatches(live);
        setSuperOddConfig(promo);
      } catch {
        // silencioso: round seguinte tenta de novo
      }
    };

    const timer = window.setInterval(tick, 120_000);
    tick();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(currentUser)]);

  /**
   * Mercados eleitorais (presidente e governador).
   *
   * Vem do banco como qualquer outro preco. Nao existe mais copia hardcoded com
   * percentuais de "pesquisa": o operador ajusta a odd por la e o historico
   * registra quem mexeu.
   */
  const loadElectionContests = useCallback(async () => {
    try {
      setElectionContests(await fetchElectionContests());
    } catch {
      // Sem prototyping cadastrado, ou migrations ainda nao aplicadas.
      setElectionContests([]);
    }
  }, []);

  /**
   * Minhas Apostas vem de `bets`, nao da memoria.
   *
   * Antes o boletim so empurrava bilhete novo num estado local (e ainda por
   * cima sem ler o localStorage de volta): aposta eleitoral nao aparecia em
   * lugar nenhum e tudo sumia no reload. Agora a lista e sempre a do banco,
   * com os contestos ja carregados para mostrar o titulo da eleicao.
   */
  const refreshBets = useCallback(
    async (contests: ElectionContest[]) => {
      if (!currentUser) {
        setTickets([]);
        return;
      }
      try {
        setTickets(await fetchBets(currentUser.id, contests));
      } catch {
        // Sem rede ou consulta negada: mantem o que ja esta em tela.
      }
    },
    // So o id entra nas deps: mudancas de saldo/role recriariam o callback e
    // disparariam uma releitura de apostas a cada depósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser?.id]
  );

  // Carrega no login e quando os contestos eleitorais chegam (muda o titulo).
  useEffect(() => {
    void refreshBets(electionContests);
  }, [refreshBets, electionContests]);

  /**
   * Mesmo caminho, porem sem filtro de usuario: a fila de liquidacao do
   * backoffice mostra as apostas de todo mundo (policy de admin). Sessao de
   * role=user nem tenta — a RLS devolveria so as proprias.
   */
  const refreshAdminBets = useCallback(async () => {
    if (currentUser?.role !== 'admin') {
      setAdminBets([]);
      return;
    }
    try {
      setAdminBets(await fetchAllBets(electionContests));
    } catch {
      // Sem rede ou consulta negada: mantem o que ja esta em tela.
    }
  }, [currentUser?.id, currentUser?.role, electionContests]);

  useEffect(() => {
    void refreshAdminBets();
  }, [refreshAdminBets]);

  /**
   * Clique no candidato da vitrine = mesmo gesto de clicar numa odd de jogo:
   * entra no boletim (e sai se clicar de novo), sem popup no meio do caminho.
   */
  const handleToggleElectionSelection = (
    contest: ElectionContest,
    candidate: ElectionCandidate
  ) => {
    playSoundEffect('click');
    setSelections((prev) => {
      const match = (s: BetSelection) =>
        s.kind === 'election' && s.matchId === contest.id && s.choiceId === candidate.id;

      if (prev.some(match)) return prev.filter((s) => !match(s));

      // Uma aposta por contesto, igual ao mercado de uma partida.
      const filtered = prev.filter(
        (s) => !(s.kind === 'election' && s.matchId === contest.id)
      );

      const newSelection: BetSelection = {
        kind: 'election',
        electionContestId: contest.id,
        electionCandidateId: candidate.id,
        matchId: contest.id,
        matchTitle: contest.title,
        homeTeam: candidate.name,
        awayTeam: '',
        league: 'Eleições',
        sport: 'politics',
        isLive: false,
        marketId: 'election-winner',
        marketName: ELECTION_SCOPE_LABEL[contest.scope],
        choiceId: candidate.id,
        choiceLabel: candidate.name,
        odd: candidate.odds,
        initialOdd: candidate.odds,
      };

      return [...filtered, newSelection];
    });
    // Mesmo gesto da odd de partida: o boletim assume a cena com a selecao la.
    setSlipFocus((prev) => ({ n: prev.n + 1, tab: 'slip' }));
  };

  const handlePlaceElectionBet = async (
    contest: ElectionContest,
    candidateId: string,
    stake: number
  ) => {
    if (!currentUser) {
      setAuthInitialMode('login');
      setIsAuthOpen(true);
      return;
    }

    setElectionError(null);
    setIsElectionSubmitting(true);
    try {
      await placeElectionBet({ contestId: contest.id, candidateId, stake });
    } catch (err) {
      setElectionError(toastMessage(err, 'Nao foi possivel registrar a aposta.'));
      return;
    } finally {
      setIsElectionSubmitting(false);
    }

    setToast('Aposta eleitoral registrada.');
    setIsElectionModalOpen(false);
    // Saldo e extrato sao relidos: o banco ja aplicou o debito.
    await loadAccountData(currentUser.id);
    await refreshBets(electionContests);

    // O usuario veu do popup: abre o boletim ja na aba Minhas Apostas.
    setSlipFocus((prev) => ({ n: prev.n + 1, tab: 'my_bets' }));
    setIsMobileSlipOpen(true);
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    playSoundEffect('click');
    try {
      // Primeiro alimenta o catalogo com o feed real (ESPN), depois rele o banco.
      const feed = await syncMatchFeed();
      const live = await fetchLiveMatches();
      if (live.length > 0) setMatches(live);
      if (feed.synced > 0) {
        setToast(`${feed.synced} partida(s) sincronizada(s) do feed.`);
      } else {
        setToast('Partidas atualizadas.');
      }
    } catch {
      setToast('Falha ao sincronizar partidas. Verifique a conexao.');
    } finally {
      setIsSyncing(false);
    }
  };

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

  // Espelho da carteira entre o usuario logado e a lista de perfis.
  // O saldo real esta no Supabase; aqui so mantem os dois estados coerentes
  // para a interface nao piscar entre dois valores.
  const syncWalletToUser = (updatedWallet: UserWallet) => {
    setWallet(updatedWallet);

    if (currentUser) {
      const updatedCurrent: UserAccount = { ...currentUser, wallet: updatedWallet };
      setCurrentUser(updatedCurrent);
      setUsers((prevUsers) => prevUsers.map((u) => (u.id === currentUser.id ? updatedCurrent : u)));
    }
  };

  /**
   * Carrega tudo que depende da sessao. Chamar depois de login, logout e na
   * montagem quando ja existe sessao.
   */
  const loadAccountData = useCallback(async (userId: string) => {
    const account = await fetchAccount(userId);
    if (!account) {
      setCurrentUser(null);
      return;
    }

    setCurrentUser(account);
    setWallet(account.wallet);

    const [txs, deps, wdrs] = await Promise.all([
      fetchTransactions(userId),
      fetchDeposits(userId),
      fetchWithdrawals(userId),
    ]);
    setTransactions(txs);
    setDepositRequests(deps);
    setWithdrawRequests(wdrs);

    // Lista de usuarios e fila global de pedidos so para admin. A RLS nega para
    // role=user, entao nem tentamos no outro caso.
    if (account.role === 'admin') {
      try {
        setUsers(await fetchAllProfiles());
      } catch {
        setUsers([]);
      }
      // Fila global so funciona para admin: a RLS e quem separa. Se um usuario
      // comum chamar, devolve so o dele — entao nem precisamos tratar erro.
      try {
        setDepositRequests(await fetchAllDeposits());
      } catch {
        // fila global indisponivel: admin ve apenas os proprios pedidos
      }
      try {
        setWithdrawRequests(await fetchAllWithdrawals());
      } catch {
        // idem
      }
    }
  }, []);

  // Sessao: Supabase Auth e a unica fonte de "quem sou eu".
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsAuthReady(true);
      return;
    }

    let cancelled = false;

    onAuthStateChange((event, session) => {
      if (cancelled) return;

      // Link de recuperacao validado: o GoTrue abre uma sessao especial onde a
      // unica acao valida e gravar a nova senha (updateUser). Nao ha perfil
      // completo ainda; abrimos o modal em modo rede de recuperacao.
      if (event === 'PASSWORD_RECOVERY') {
        setAuthInitialMode('new-password');
        setIsAuthOpen(true);
        setIsAuthReady(true);
        return;
      }

      if (!session) {
        setCurrentUser(null);
        setWallet({ realBalance: 0, bonusBalance: 0, currency: 'BRL' });
        setTransactions([]);
        setUsers([]);
        setDepositRequests([]);
        setWithdrawRequests([]);
        setAdminBets([]);
        setIsAuthReady(true);
        return;
      }
      void loadAccountData(session.user.id).finally(() => setIsAuthReady(true));
    });

    return () => {
      cancelled = true;
    };
  }, [loadAccountData]);

  // House settings sao publicas e independem de sessao.
  //
  // Uma leitura que falha NUNCA troca a configuracao pelos defaults: o QR de
  // deposito sairia com a chave default `financeiro@...`, que nao existe em
  // banco nenhum (o cliente ve "chave nao existe"), e o painel mostraria
  // valores que nao sao os do banco — parecendo que os dados foram resetados.
  // Em erro, mantem o ultimo valor conhecido e tenta de novo em seguida.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      fetchHouseSettings()
        .then((settings) => {
          if (!cancelled) setHouseSettings(settings);
        })
        .catch(() => {
          if (cancelled || attempt >= 5) return;
          attempt += 1;
          timer = setTimeout(load, 3000);
        });
    };
    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

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

      // Cash out nao tem liquidacao antecipada no servidor: sem ela nao existe
      // valor de encerramento a estimativa aqui — e a UI nem oferece o botao.
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

  /**
   * Coloca a aposta.
   *
   * O debito do saldo e a gravacao da aposta acontecem em `place_bet_atomic`, uma
   * transacao unica no Postgres. Antes, este codigo subtraia o stake do saldo
   * na tela e guardava a aposta em localStorage — o dinheiro sumia se a aba
   * fechasse e o saldo confiava no cliente.
   *
   * Odd e payout sao o que o BANCO devolveu, nunca o que a tela calculou. O
   * navegador so estima, para mostrar antes do clique; se a cotacao mexer no
   * instante da aceitacao, vale o preco gravado na transacao.
   */
  const handlePlaceBet = async (
    stake: number,
    type: 'single' | 'multiple',
    currentSelections: BetSelection[]
  ): Promise<boolean> => {
    if (!currentUser) {
      setAuthInitialMode('login');
      setIsAuthOpen(true);
      return false;
    }
    if (currentSelections.length === 0) return false;

    // Eleicao nao tem 1x2 nem market_choices: passa pelo RPC proprio, que so
    // aceita uma selecao por vez. Combinada com jogo, o banco rejeitaria.
    const electionSelection = currentSelections.find((s) => s.kind === 'election');
    if (electionSelection) {
      if (currentSelections.length > 1) {
        setToast('Aposta eleitoral entra sozinha: remova as outras seleções do boletim.');
        return false;
      }

      let placedElection: Awaited<ReturnType<typeof placeElectionBet>>;
      try {
        placedElection = await placeElectionBet({
          contestId: electionSelection.electionContestId ?? electionSelection.matchId,
          candidateId: electionSelection.electionCandidateId ?? electionSelection.choiceId,
          stake,
        });
      } catch (err) {
        setToast(toastMessage(err, 'Nao foi possivel registrar a aposta.'));
        return false;
      }

      const now = new Date();
      const electionTicket: BetTicket = {
        id: placedElection.betId,
        date: `Hoje, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        type: 'single',
        selections: [
          // Odd e retorno vem do banco, igual ao esportivo.
          { ...electionSelection, odd: placedElection.odds, initialOdd: placedElection.odds },
        ],
        totalOdd: placedElection.odds,
        stake,
        potentialReturn: placedElection.potentialReturn,
        bonusPercentage: 0,
        bonusAmount: 0,
        status: 'OPEN',
      };

      setSelections([]);
      setTickets((prev) => [electionTicket, ...prev]);
      await loadAccountData(currentUser.id);
      await refreshBets(electionContests);
      playSoundEffect('goal');
      return true;
    }

    let placed: Awaited<ReturnType<typeof placeBet>>;
    try {
      placed = await placeBet({
        type,
        selections: currentSelections,
        stake,
      });
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel registrar a aposta.'));
      return false;
    }

    const now = new Date();
    const dateStr = `Hoje, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newTicket: BetTicket = {
      id: placed.betId,
      date: dateStr,
      type,
      selections: [...currentSelections],
      totalOdd: placed.totalOdd,
      stake,
      potentialReturn: placed.potentialReturn,
      bonusPercentage: 0,
      bonusAmount: 0,
      status: 'OPEN',
    };

    // Clear slip
    setSelections([]);

    setTickets((prev) => [newTicket, ...prev]);

    // Saldo e extrato vem do banco: recarrega em vez de somar por conta propria.
    await loadAccountData(currentUser.id);
    // Bilhete novo ja veio do proprio insert; o refresh deixa a lista fiel ao
    // banco (mesma origem da aposta eleitoral).
    await refreshBets(electionContests);
    playSoundEffect('goal');
    return true;
  };

  // Payment Handlers
  // Saldo e extrato sao relidos do banco depois da operacao. Somar no cliente
  // duplicaria o valor que a transacao no Postgres ja aplicou.
  const handleDepositSuccess = async () => {
    if (!currentUser) return;
    await loadAccountData(currentUser.id);
  };

  const handleWithdrawSuccess = async () => {
    if (!currentUser) return;
    await loadAccountData(currentUser.id);
  };

  // Auth Handlers
  // A sessao ja foi criada pelo AuthModal (signIn/signUp). Aqui so espelhamos
  // o que o banco devolveu — nunca aceitamos objeto vindo do formulario.
  const handleLogin = (user: UserAccount) => {
    setCurrentUser(user);
    setWallet(user.wallet);
    void loadAccountData(user.id);
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      try {
        await authSignOut();
      } catch {
        // logout local acontece pelo onAuthStateChange de qualquer forma
      }
    }
    setCurrentUser(null);
    setWallet({ realBalance: 0, bonusBalance: 0, currency: 'BRL' });
    setTransactions([]);
    setUsers([]);
    setDepositRequests([]);
    setWithdrawRequests([]);
    setAdminBets([]);
  };

  // Alterar limite diario e mudanca de privilegio: a RLS bloqueia para o
  // proprio usuario. Mantido aqui so para o painel do admin, que faz via
  // service_role no backoffice.
  const handleUserUpdateLimit = (_newLimit: number) => {
    // intencionalmente vazio: ver nota acima
  };

  // Admin Backoffice Handlers
  //
  // Todos delegam para a Edge Function, que roda com service_role e faz a
  // operacao dentro de transacao. Nao ha escrita direta em `wallets` aqui — a
  // RLS proibe, e o estado da tela so e atualizado depois do servidor confirmar.
  const handleApproveDeposit = async (requestId: string) => {
    try {
      await adminActions.approveDeposit(requestId);
      const fresh = currentUser?.role === 'admin'
        ? await fetchAllDeposits()
        : await fetchDeposits(currentUser?.id ?? '');
      setDepositRequests(fresh);
      if (currentUser) await loadAccountData(currentUser.id);
      playSoundEffect('goal');
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel aprovar o deposito.'));
    }
  };

  const handleRejectDeposit = async (requestId: string) => {
    try {
      await adminActions.rejectDeposit(requestId);
      setDepositRequests(
        currentUser?.role === 'admin'
          ? await fetchAllDeposits()
          : await fetchDeposits(currentUser?.id ?? '')
      );
      if (currentUser) await loadAccountData(currentUser.id);
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel recusar o deposito.'));
    }
  };

  const handleApproveWithdraw = async (requestId: string) => {
    try {
      await adminActions.approveWithdraw(requestId);
      setWithdrawRequests(
        currentUser?.role === 'admin'
          ? await fetchAllWithdrawals()
          : await fetchWithdrawals(currentUser?.id ?? '')
      );
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel aprovar o saque.'));
    }
  };

  const handleRejectWithdraw = async (requestId: string) => {
    try {
      // O estorno acontece dentro da RPC; a tela nao soma saldo por conta propria.
      await adminActions.rejectWithdraw(requestId);
      setWithdrawRequests(
        currentUser?.role === 'admin'
          ? await fetchAllWithdrawals()
          : await fetchWithdrawals(currentUser?.id ?? '')
      );
      if (currentUser) await loadAccountData(currentUser.id);
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel recusar o saque.'));
    }
  };

  const handleToggleUserStatus = async (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    const nextStatus = target.status === 'active' ? 'blocked' : 'active';

    try {
      await adminActions.toggleUserStatus(userId, nextStatus);
      setUsers(await fetchAllProfiles());
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel alterar o status.'));
    }
  };

  const handleSetUserRole = async (userId: string, role: 'user' | 'admin') => {
    try {
      await adminActions.setUserRole(userId, role);
      const fresh = await fetchAllProfiles();
      setUsers(fresh);
      if (currentUser?.id === userId) {
        const me = fresh.find((u) => u.id === userId);
        if (me) setCurrentUser(me);
        if (role === 'user') setAdminViewOpen(false);
      }
      setToast(role === 'admin' ? 'Usuário promovido a administrador.' : 'Usuário rebaixado para apostador.');
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel alterar o perfil.'));
    }
  };

  const handleManualCreditUser = async (userId: string, amount: number) => {
    try {
      await adminActions.creditUser(userId, amount);
      setUsers(await fetchAllProfiles());
      if (currentUser?.id === userId) await loadAccountData(userId);
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel creditar o saldo.'));
    }
  };

  /**
   * Liquidacao de aposta.
   *
   * O pagamento (debito de volta no wallet + lancada no extrato) acontece na
   * RPC do servidor, chamada pela Edge Function com service_role. Aqui a tela
   * so escolhe o resultado e relee as duas listas: a do painel e o boletim do
   * proprio admin, caso ele esteja liquidando a propria aposta.
   */
  const handleSettleBet = async (betId: string, result: 'WON' | 'LOST' | 'VOID') => {
    const bet = adminBets.find((b) => b.id === betId);
    if (!bet) return;

    try {
      await adminActions.settleBet(
        betId,
        result,
        // Ganhou paga o retorno prometido (ja sai com o bonus de multipla);
        // perdida e anulada a RPC resolve sem valor na chamada.
        result === 'WON' ? bet.potentialReturn : undefined
      );
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel liquidar a aposta.'));
      return;
    }

    setToast(
      result === 'WON'
        ? 'Aposta liquidada como ganha.'
        : result === 'LOST'
        ? 'Aposta liquidada como perdida.'
        : 'Aposta anulada: stake devolvida.'
    );
    await refreshAdminBets();
    await refreshBets(electionContests);
  };

  const handleSaveHouseSettings = async (newSettings: HouseSettings): Promise<boolean> => {
    try {
      await adminActions.saveHouseSettings({ ...newSettings });
      setHouseSettings(await fetchHouseSettings());
      return true;
    } catch (err) {
      setToast(toastMessage(err, 'Nao foi possivel salvar as configuracoes.'));
      return false;
    }
  };

  /**
   * Ajuste de cotacao eleitoral.
   *
   * O erro sobe de proposito para o painel mostrar ao lado do campo: um toast
   * global esconderia qual candidato falhou quando o operador edita dez linhas.
   */
  const handleSaveElectionOdd = async (candidateId: string, odds: number) => {
    await adminActions.setElectionOdd(candidateId, odds);
    await loadElectionContests();
  };

  // CRUD completo de mercados eleitorais. O painel edita o catalogo inteiro:
  // titulo, nome, partido, intencao de voto, fonte e odd — tudo pelo servidor.
  const handleSaveElectionContest = async (contest: {
    id?: string;
    title: string;
    scope?: 'PRESIDENT' | 'GOVERNOR';
    stateCode?: string | null;
    status?: 'OPEN' | 'SUSPENDED' | 'CLOSED';
  }) => {
    await adminActions.upsertElectionContest({
      id: contest.id,
      title: contest.title,
      scope: contest.scope,
      stateCode: contest.stateCode ?? null,
      status: contest.status,
    });
    await loadElectionContests();
  };

  const handleSaveElectionCandidate = async (candidate: {
    id?: string;
    contestId: string;
    name: string;
    party?: string | null;
    odds?: number;
    voteIntention?: number | null;
    pollSource?: string | null;
    pollDate?: string | null;
    sortOrder?: number;
  }) => {
    await adminActions.saveElectionCandidate({
      id: candidate.id,
      contestId: candidate.contestId,
      name: candidate.name,
      party: candidate.party ?? null,
      odds: candidate.odds,
      voteIntention: candidate.voteIntention ?? null,
      pollSource: candidate.pollSource ?? null,
      pollDate: candidate.pollDate ?? null,
      sortOrder: candidate.sortOrder,
    });
    await loadElectionContests();
  };

  const handleDeleteElectionCandidate = async (candidateId: string) => {
    await adminActions.deleteElectionCandidate(candidateId);
    await loadElectionContests();
  };

  const handleDeleteElectionContest = async (contestId: string) => {
    await adminActions.deleteElectionContest(contestId);
    await loadElectionContests();
  };

  // Pedidos feitos pelo usuario. A RPC calcula bonus/minimo/limite no servidor
  // e debita o saque na hora.
  //
  // O erro sobe para o modal (que ja mostra um alert) em vez de virar toast
  // escondido: sem propagar, a tela continuaria mostrando "comprovante enviado"
  // com o pedido que nunca chegou ao banco.
  const handleQueueDepositRequest = async (req: DepositRequest) => {
    try {
      const method = req.paymentMethod?.toLowerCase() === 'usdt' ? 'usdt' : 'pix';
      const created = await createDepositRequest(
        req.amount,
        method,
        req.txid,
        req.walletAddress
      );
      setDepositRequests(prev => [created, ...prev]);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Não foi possível registrar o depósito.');
    }
  };

  const handleQueueWithdrawRequest = async (req: WithdrawRequest) => {
    try {
      const created = await createWithdrawRequest(req.amount, req.pixKeyType, req.pixKey);
      setWithdrawRequests(prev => [created, ...prev]);
      if (currentUser) await loadAccountData(currentUser.id);
    } catch (err) {
      // Sobe para o modal: sem isso a tela mostraria recibo de um pedido que a
      // RPC recusou (saldo insuficiente, minimo, conta bloqueada...).
      throw new Error(err instanceof Error ? err.message : 'Não foi possível solicitar o saque.');
    }
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

  /**
   * Super Odd Turbinada resolvida: a campanha vem do banco (sync grava a odd
   * turbinada de verdade em market_choices), e aqui os ids sao apontados
   * contra o catalogo carregado. Sem as duas pernas em memoria, sem banner —
   * o botao sempre leva exatamente os jogos anunciados.
   */
  const superOdd = useMemo<SuperOddPromo | null>(() => {
    if (!superOddConfig) return null;

    const legFor = (matchId: string, choiceId: string) => {
      const match = matches.find((m) => m.id === matchId);
      if (!match || match.status === 'FINISHED') return null;
      const market = match.markets.find((mk) =>
        mk.choices.some((c) => c.id === choiceId)
      );
      const choice = market?.choices.find((c) => c.id === choiceId);
      return market && choice ? { match, market, choice } : null;
    };

    const legA = legFor(superOddConfig.match_ids[0], superOddConfig.choice_ids[0]);
    const legB = legFor(superOddConfig.match_ids[1], superOddConfig.choice_ids[1]);
    if (!legA || !legB) return null;

    // O time anunciado e o preferido da campanha (Flamengo / Real Madrid)
    // quando joga; senao o mandante.
    const preferred = ['flamengo', 'real madrid'];
    const side = (m: Match) =>
      preferred.find((p) => m.homeTeam.toLowerCase().includes(p)) ||
      preferred.find((p) => m.awayTeam.toLowerCase().includes(p)) ||
      m.homeTeam;
    const goals = legA.choice.label.replace(/\s*Gols?$/i, '').toLowerCase();

    return {
      legs: [legA, legB],
      title: `${side(legA.match)} & ${side(legB.match)}: ${goals} em ambos os jogos`,
      baseTotal: superOddConfig.base_total,
      boostedTotal: superOddConfig.boosted_total,
    };
  }, [matches, superOddConfig]);

  // Filtered Matches
  const filteredMatches = useMemo(() => {
    const filtered = matches.filter((m) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          m.homeTeam.toLowerCase().includes(q) ||
          m.awayTeam.toLowerCase().includes(q) ||
          m.league.toLowerCase().includes(q) ||
          (m.markets && m.markets.some(mk => mk.choices.some(c => c.label.toLowerCase().includes(q))));
        if (!matchesQuery) return false;
      }

      // Sport filter
      if (selectedSport === 'live' && m.status !== 'LIVE') return false;
      if (selectedSport !== 'all' && selectedSport !== 'live' && m.sport !== selectedSport) {
        return false;
      }

      // League filter
      if (selectedLeague !== 'all' && leagueKey(m.league) !== leagueKey(selectedLeague)) return false;

      // Time filter
      if (timeFilter === 'live' && m.status !== 'LIVE') return false;
      if (timeFilter === 'today' && !m.startTime.includes('Hoje')) return false;
      if (timeFilter === 'tomorrow' && !m.startTime.includes('Amanhã')) return false;
      if (
        timeFilter === 'hot' &&
        !m.isSuperOdd &&
        !superOdd?.legs.some((leg) => leg.match.id === m.id)
      ) {
        return false;
      }

      return true;
    });

    // Regra do produto: vôlei sempre por último no boletim, mesmo com horário
    // mais cedo. O sort é estável — os demais mantêm a ordem de kickoff.
    return filtered.sort((a, b) => {
      const va = a.sport === 'volleyball' ? 1 : 0;
      const vb = b.sport === 'volleyball' ? 1 : 0;
      return va - vb;
    });
  }, [matches, searchQuery, selectedSport, selectedLeague, timeFilter, superOdd]);

  // Pagina exclusiva do backoffice: substitui o site inteiro enquanto aberta.
  // So e alcançada pelo dropdown do admin; qualquer outro perfil cai de volta
  // ao site normal.
  if (adminViewOpen && currentUser?.role === 'admin') {
    return (
      <AdminPanelPage
        currentAdminId={currentUser.id}
        users={users}
        bets={adminBets}
        depositRequests={depositRequests}
        withdrawRequests={withdrawRequests}
        houseSettings={houseSettings}
        electionContests={electionContests}
        onApproveDeposit={handleApproveDeposit}
        onRejectDeposit={handleRejectDeposit}
        onApproveWithdraw={handleApproveWithdraw}
        onRejectWithdraw={handleRejectWithdraw}
        onToggleUserStatus={handleToggleUserStatus}
        onManualCreditUser={handleManualCreditUser}
        onSetUserRole={handleSetUserRole}
        onSaveHouseSettings={handleSaveHouseSettings}
        onSaveElectionOdd={handleSaveElectionOdd}
        onSaveElectionContest={handleSaveElectionContest}
        onSaveElectionCandidate={handleSaveElectionCandidate}
        onDeleteElectionCandidate={handleDeleteElectionCandidate}
        onDeleteElectionContest={handleDeleteElectionContest}
        onSettleBet={handleSettleBet}
        onBack={() => setAdminViewOpen(false)}
        isSyncing={isSyncing}
        onTriggerSync={handleTriggerSync}
        onOpenApiSimulator={() => setIsApiModalOpen(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <Header
        wallet={wallet}
        currentUser={currentUser}
        liveMatchesCount={liveCount}
        onOpenDeposit={() => setIsDepositOpen(true)}
        onOpenWithdraw={() => setIsWithdrawOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenAuth={(mode) => {
          setAuthInitialMode(mode);
          setIsAuthOpen(true);
        }}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenAdminPanel={() => setAdminViewOpen(true)}
        onLogout={handleLogout}
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
        isSyncing={isSyncing}
        onOpenElectionOfficial={() => setIsElectionModalOpen(true)}
        welcomeBonusEnabled={houseSettings.welcomeBonusEnabled}
      />

      {/* Main Layout Container */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-3 sm:px-6 py-4 flex flex-col lg:flex-row items-start gap-4">
        {/* Left Sidebar: Sports Categories & Leagues (recolhivel no mobile) */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col">
          <button
            onClick={() => setIsSidebarOpen((v) => !v)}
            aria-expanded={isSidebarOpen}
            className="lg:hidden w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-[#12161f] border border-[#21262d] text-slate-200"
          >
            <span className="flex items-center gap-2 text-xs font-bold">
              <SlidersHorizontal className="w-4 h-4 text-[#00e701]" />
              Filtros &amp; Esportes
            </span>
            {isSidebarOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          <div className={`${isSidebarOpen ? 'flex' : 'hidden'} lg:flex flex-col mt-3 lg:mt-0`}>
            <SportsSidebar
              selectedSport={selectedSport}
              onSelectSport={(sp) => {
                setSelectedSport(sp);
                setIsSidebarOpen(false);
              }}
              selectedLeague={selectedLeague}
              onSelectLeague={(lg) => {
                setSelectedLeague(lg);
                setIsSidebarOpen(false);
              }}
              liveMatchesCount={liveCount}
              timeFilter={timeFilter}
              onSelectTimeFilter={setTimeFilter}
              matches={matches}
              electionCount={electionContests.length}
            />
          </div>
        </div>

        {/* Center Main: Live Pitch Tracker + Match Cards */}
        <div className="flex-1 w-full min-w-0 flex flex-col">
          {/* Faixa do mercado eleitoral. O texto antigo prometia "dados oficiais TSE" e
            "pesquisas auditadas (Datafolha / Quaest) com registro TSE" — nada
            disso existe. O numero aqui e cotacao da casa. */}
          {selectedSport === 'politics' && (
            <div className="mb-4 bg-gradient-to-r from-amber-950/50 via-[#1f1a10] to-amber-950/50 border border-amber-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-extrabold text-white">
                    Mercado eleitoral: presidente e governador
                  </span>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Os valores são cotação da casa, ajustáveis pela operação. Não são
                    resultado de pesquisa nem registro eleitoral.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsElectionModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs whitespace-nowrap cursor-pointer transition-colors shadow-sm"
              >
                Ver cotações
              </button>
            </div>
          )}

          {/* Mercado eleitoral: vitrine de fato, nao so banner e modal */}
          {selectedSport === 'politics' ? (
            <ElectionShowcase
              contests={electionContests}
              onPick={handleToggleElectionSelection}
              selectedSelections={selections}
            />
          ) : (
            <>
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
                superOdd={superOdd}
              />
            </>
          )}
        </div>

        {/* Right Sidebar: Bet Slip */}
        <BetSlip
          selections={selections}
          onRemoveSelection={handleRemoveSelection}
          onClearAll={handleClearAllSelections}
          onAcceptOddChange={handleAcceptOddChange}
          autoAcceptOdds={autoAcceptOdds}
          wallet={wallet}
          onPlaceBet={handlePlaceBet}
          tickets={tickets}
          focusSignal={slipFocus}
          onOpenDeposit={() => {
            if (!currentUser) {
              setAuthInitialMode('login');
              setIsAuthOpen(true);
            } else {
              setIsDepositOpen(true);
            }
          }}
          isMobileOpen={isMobileSlipOpen}
          onToggleMobile={() => setIsMobileSlipOpen(!isMobileSlipOpen)}
          currentUser={currentUser}
          onOpenAuth={(mode) => {
            setAuthInitialMode(mode);
            setIsAuthOpen(true);
          }}
        />
      </main>

      {/* Footer */}
      <footer className="bg-[#0d1117] border-t border-[#21262d] pt-6 pb-28 lg:py-6 px-4 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-[1720px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-extrabold text-white">PRIMAS<span className="text-[#00e701]">BET</span> PRO</span>
            <span>·</span>
            <span>Sistema Oficial de Apostas Esportivas & Políticas</span>
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
        currentUser={currentUser}
        pixConfig={{
          merchantKey: houseSettings.pixKey,
          merchantKeyType: houseSettings.pixKeyType,
          merchantName: houseSettings.pixMerchantName,
          merchantCity: houseSettings.pixMerchantCity,
        }}
        minDeposit={houseSettings.minDeposit}
        welcomeBonusEnabled={houseSettings.welcomeBonusEnabled}
        welcomeBonusPercent={houseSettings.welcomeBonusPercent}
        usdtEnabled={houseSettings.usdtEnabled}
        usdtWalletAddress={houseSettings.usdtWalletAddress}
        usdtRate={houseSettings.usdtRate}
        onDepositSuccess={handleDepositSuccess}
        onRequestDepositApproval={handleQueueDepositRequest}
      />

      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        wallet={wallet}
        currentUser={currentUser}
        minWithdraw={houseSettings.minWithdraw}
        onWithdrawSuccess={handleWithdrawSuccess}
        onRequestWithdrawApproval={handleQueueWithdrawRequest}
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
          // Configuracao do painel de integracao e estado de sessao local do
          // admin. Nao ha mais chave de API para guardar: as fontes de dados
          // reais usam chave publica do Supabase.
          setApiConfig(cfg);
        }}
        matches={matches}
        onTriggerEvent={handleTriggerEvent}
        onToggleSuspend={handleToggleSuspend}
        onForceOddsJitter={handleForceOddsJitter}
        isEngineRunning={isEngineRunning}
        onToggleEngine={() => setIsEngineRunning(!isEngineRunning)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLogin={handleLogin}
        initialMode={authInitialMode}
        welcomeBonusEnabled={houseSettings.welcomeBonusEnabled}
      />

      <UserDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        user={currentUser}
        onUpdateLimit={handleUserUpdateLimit}
        onOpenDeposit={() => {
          setIsDashboardOpen(false);
          setIsDepositOpen(true);
        }}
        onOpenWithdraw={() => {
          setIsDashboardOpen(false);
          setIsWithdrawOpen(true);
        }}
        onOpenHistory={() => {
          setIsDashboardOpen(false);
          setIsHistoryOpen(true);
        }}
        onLogout={handleLogout}
      />

      <ElectionOfficialModal
        isOpen={isElectionModalOpen}
        onClose={() => {
          setIsElectionModalOpen(false);
          setElectionError(null);
        }}
        contests={electionContests}
        error={electionError}
        isSubmitting={isElectionSubmitting}
        walletBalance={wallet.realBalance + wallet.bonusBalance}
        onPlaceBet={handlePlaceElectionBet}
        onOpenAuth={mode => {
          setAuthInitialMode(mode);
          setIsAuthOpen(true);
        }}
        isAuthenticated={Boolean(currentUser)}
        onOpenDeposit={() => setIsDepositOpen(true)}
      />

      {/*
        Toast de erro/sucesso. Estava faltando: todos os setToast() gravavam o
        estado mas nada era renderizado, entao falha de aposta, saque ou sync
        acontecia em silencio.
      */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-red-500/40 bg-[#161b26] px-4 py-3 text-sm text-slate-100 shadow-xl max-w-[90vw]"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
