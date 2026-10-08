export type SportId = 'football' | 'basketball' | 'tennis' | 'esports' | 'volleyball' | 'mma' | 'politics';

export type MatchStatus = 'LIVE' | 'SCHEDULED' | 'HALFTIME' | 'FINISHED';

export interface OddChoice {
  id: string;
  label: string;
  value: number;
  previousValue?: number;
  trend?: 'up' | 'down' | 'stable';
  isSuspended?: boolean;
}

export interface Market {
  id: string;
  name: string;
  category: 'main' | 'goals' | 'halves' | 'handicap' | 'specials' | 'corners';
  choices: OddChoice[];
}

export interface MatchEvent {
  id: string;
  minute: number;
  type: 'goal' | 'yellow_card' | 'red_card' | 'corner' | 'penalty' | 'dangerous_attack' | 'substitution';
  team: 'home' | 'away';
  player?: string;
  description: string;
  timestamp: string;
}

export interface MatchStats {
  possessionHome: number;
  possessionAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  shotsOffTargetHome: number;
  shotsOffTargetAway: number;
  cornersHome: number;
  cornersAway: number;
  foulsHome: number;
  foulsAway: number;
  yellowCardsHome: number;
  yellowCardsAway: number;
  redCardsHome: number;
  redCardsAway: number;
  dangerousAttacksHome: number;
  dangerousAttacksAway: number;
}

export interface Match {
  id: string;
  sport: SportId;
  league: string;
  country: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  period: string; // '1º Tempo', '2º Tempo', 'Intervalo', 'Pré-Jogo', 'Q3', 'Set 2'
  status: MatchStatus;
  startTime: string;
  isHot?: boolean;
  isSuperOdd?: boolean;
  activeAttackTeam?: 'home' | 'away' | null;
  attackIntensity?: 'normal' | 'dangerous' | 'penalty' | 'corner';
  stats: MatchStats;
  events: MatchEvent[];
  markets: Market[];
}

/** Super Odd Turbinada: um perna de cada jogo (over do mercado de gols). */
export interface SuperOddLeg {
  match: Match;
  market: Market;
  choice: OddChoice;
}

/**
 * Campanha resolvida contra o catalogo carregado. `base_total` e o produto das
 * odds justas; `boosted_total` e o que o banco realmente paga (a sync grava a
 * odd turbinada em market_choices, entao boletim, RPC e liquidacao usam o
 * mesmo numero — aqui a tela so mostra as duas pontas da cotacao.
 */
export interface SuperOddPromo {
  legs: [SuperOddLeg, SuperOddLeg];
  title: string;
  baseTotal: number;
  boostedTotal: number;
}

export interface BetSelection {
  /**
   * 'election' = candidato (presidente/governador): nao tem partida, mercado de
   * 1x2 nem odd dinamica, e so pode ir como aposta simples. O default e 'match'
   * porque as linhas antigas do banco nao trazem o campo.
   */  kind?: 'match' | 'election';
  /** Somente eleicao: ids do contesto e do candidato em election_*. */
  electionContestId?: string;
  electionCandidateId?: string;
  matchId: string;
  matchTitle: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: SportId;
  isLive: boolean;
  minute?: number;
  marketId: string;
  marketName: string;
  choiceId: string;
  choiceLabel: string;
  odd: number;
  initialOdd: number;
  currentOdd?: number;
  hasOddChanged?: boolean;
  isSuspended?: boolean;
}

export interface BetTicket {
  id: string;
  /** Somente na leitura do painel admin: de quem e a aposta. */
  userId?: string;
  date: string;
  type: 'single' | 'multiple';
  selections: BetSelection[];
  totalOdd: number;
  stake: number;
  potentialReturn: number;
  bonusPercentage?: number;
  bonusAmount?: number;
  status: 'OPEN' | 'WON' | 'LOST' | 'CASHED_OUT' | 'VOID';
  cashoutValue?: number;
  cashedOutAmount?: number;
  settledAt?: string;
}

export interface Transaction {
  id: string;
  type: 'DEPOSIT_PIX' | 'WITHDRAW_PIX' | 'BET_PLACED' | 'BET_WON' | 'BET_LOST' | 'CASH_OUT';
  amount: number;
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  date: string;
  description: string;
  pixKey?: string;
  endToEndId?: string;
  txid?: string;
}

export interface UserWallet {
  realBalance: number;
  bonusBalance: number;
  currency: string;
}

export interface ApiConnectionConfig {
  mode: 'simulated_live' | 'external_api';
  apiUrl: string;
  apiKey: string;
  pollingIntervalSeconds: number;
  isConnected: boolean;
  lastSyncTime: string;
  oddsAdjustmentFactor: number; // e.g. 1.0 (default), 1.05 (+5% boost)
}
