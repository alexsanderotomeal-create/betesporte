/**
 * Acesso a dados do Supabase.
 *
 * Substitui o JSON em disco (server.ts) e o localStorage (authService).
 * Tudo aqui vai pela anon key e depende da RLS: o banco e a autoridade, nao a
 * aplicacao. Se uma consulta voltar vazia quando nao devia, quase sempre e RLS
 * — nao e bug de filtro.
 */

import { describeSupabaseError, supabase } from '../lib/supabase';
import type { UserAccount, DepositRequest, WithdrawRequest, HouseSettings } from '../types/auth';
import type { Transaction } from '../types/betting';
import type { Match, MatchStats, Market, OddChoice, SportId, BetSelection, BetTicket } from '../types/betting';
import { ELECTION_SCOPE_LABEL } from '../types/election';

interface RowTeamRef {
  id: string;
  name: string;
  logo_url: string | null;
}

interface RowLeagueRef {
  id: string;
  name: string;
  country: string | null;
  sport: string | null;
}

interface RowChoice {
  id: string;
  label: string;
  odds: number | string;
  previous_odds: number | string | null;
  trend: 'up' | 'down' | 'stable';
  is_suspended: boolean;
  sort_order: number;
}

interface RowMarket {
  id: string;
  name: string;
  category: string;
  market_choices: RowChoice[] | null;
}

interface RowMatch {
  id: string;
  status: 'OPEN' | 'SUSPENDED' | 'LIVE' | 'FINISHED' | 'CANCELED';
  kickoff_at: string;
  minute: number | null;
  home_score: number;
  away_score: number;
  home: RowTeamRef | null;
  away: RowTeamRef | null;
  league: RowLeagueRef | null;
  match_markets: RowMarket[] | null;
}

interface RowElectionCandidate {
  id: string;
  name: string;
  party: string | null;
  odds: number | string;
  previous_odds: number | string | null;
  vote_intention: number | string | null;
  poll_source: string | null;
  poll_date: string | null;
  sort_order: number;
}

interface RowElectionContest {
  id: string;
  scope: 'PRESIDENT' | 'GOVERNOR';
  state_code: string | null;
  title: string;
  status: 'OPEN' | 'SUSPENDED' | 'CLOSED';
  election_date: string | null;
  election_candidates: RowElectionCandidate[] | null;
}

/** Placeholder do painel de placar. O banco ainda nao tem tabela de stats. */
const EMPTY_STATS: MatchStats = {
  possessionHome: 0,
  possessionAway: 0,
  shotsOnTargetHome: 0,
  shotsOnTargetAway: 0,
  shotsOffTargetHome: 0,
  shotsOffTargetAway: 0,
  cornersHome: 0,
  cornersAway: 0,
  foulsHome: 0,
  foulsAway: 0,
  yellowCardsHome: 0,
  yellowCardsAway: 0,
  redCardsHome: 0,
  redCardsAway: 0,
  dangerousAttacksHome: 0,
  dangerousAttacksAway: 0,
};

const MARKET_CATEGORIES: Market['category'][] = [
  'main',
  'goals',
  'halves',
  'handicap',
  'specials',
  'corners',
];

/**
 * Converte uma linha do Postgres no `Match` da UI.
 *
 * O check de categoria evita que um `category` novo no banco quebre o type:
 * texto desconhecido cai em 'specials' em vez de gerar `undefined` no filtro.
 */
function toMatch(row: RowMatch): Match {
  const isLive = row.status === 'LIVE';

  const markets: Market[] = (row.match_markets ?? [])
    .map((market) => {
      const rawCategory = market.category as Market['category'];
      const category = MARKET_CATEGORIES.includes(rawCategory) ? rawCategory : 'specials';

      const choices: OddChoice[] = (market.market_choices ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((choice) => ({
          id: choice.id,
          label: choice.label,
          value: toNumber(choice.odds),
          previousValue: choice.previous_odds == null ? undefined : toNumber(choice.previous_odds),
          trend: choice.trend,
          isSuspended: choice.is_suspended,
        }));

      return { id: market.id, name: market.name, category, choices };
    })
    .filter((market) => market.choices.length > 0);

  const sport = row.league?.sport === 'basketball' ? 'basketball' : 'football';
  const liveMinute = row.minute ?? 0;
  const period = !isLive
    ? 'Pré-Jogo'
    : sport === 'basketball'
      ? `Q${Math.min(4, Math.floor(liveMinute / 12) + 1)}`
      : liveMinute <= 45
        ? '1º Tempo'
        : '2º Tempo';

  return {
    id: row.id,
    sport,
    league: row.league?.name ?? 'Amistoso',
    country: row.league?.country ?? '',
    homeTeam: row.home?.name ?? 'Casa',
    awayTeam: row.away?.name ?? 'Fora',
    homeLogo: row.home?.logo_url ?? undefined,
    awayLogo: row.away?.logo_url ?? undefined,
    homeScore: row.home_score,
    awayScore: row.away_score,
    minute: liveMinute,
    period,
    status: isLive ? 'LIVE' : row.status === 'FINISHED' ? 'FINISHED' : 'SCHEDULED',
    startTime: formatKickoff(row.kickoff_at),
    isHot: isLive,
    stats: EMPTY_STATS,
    events: [],
    markets,
  };
}

/**
 * "Hoje, 19:30" / "Amanhã, 16:00" / "08/10, 16:00" no fuso do usuario — o
 * mesmo formato dos mocks. O card divide por ',' para exibir data e hora em
 * linhas separadas e os filtros "Hoje"/"Amanhã" procuram esses prefixos; com
 * o horario puro, os dois recursos ficavam quebrados para o banco real.
 */
function formatKickoff(iso: string): string {
  const kickoff = new Date(iso);
  const time = kickoff.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const now = new Date();
  const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayOf(kickoff) - dayOf(now)) / 86_400_000);

  if (diffDays === 0) return `Hoje, ${time}`;
  if (diffDays === 1) return `Amanhã, ${time}`;
  if (diffDays === -1) return `Ontem, ${time}`;
  return `${kickoff.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${time}`;
}

/**
 * profiles do banco real (projeto mmm_imperium).
 *
 * A identidade e `user_id` (FK auth.users) — `id` e um uuid separado e NAO
 * equivale a auth.uid(). `role` tem tres valores e `status` quatro; o app
 * normaliza para dois na interface (UserAccount). `document_number` guarda o
 * CPF; `daily_deposit_limit` nao existe (o app usa o default).
 */
export interface RowProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  document_number: string | null;
  role: 'user' | 'admin' | 'super_admin';
  status: 'active' | 'inactive' | 'suspended' | 'banned';
  is_verified: boolean;
  kyc_status: string | null;
  created_at: string;
}

/** wallet_balances: `realBalance` da tela vem de `wallet_balance`. */
export interface RowWallet {
  user_id: string;
  wallet_balance: number;
  bonus_balance: number;
  yield_balance: number;
  locked_balance: number;
}

/**
 * financial_ledger. Nao tem `status` nem `bet_id`: extrato e livro de razao, e
 * todo lancamento ja entra concluido.
 */
export interface RowTransaction {
  id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

/** deposits (schema real): `user_id` aponta para profiles.user_id. */
export interface RowDeposit {
  id: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  method: string;
  transaction_hash: string | null;
  proof_url: string | null;
  created_at: string;
}

/**
 * withdrawals (schema real): o destino fica em `destination_address` (uma
 * coluna, nao "tipo:chave"). `method` e o acesso (pix, usdt, ...).
 */
export interface RowWithdraw {
  id: string;
  user_id: string;
  amount: number;
  status:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'processing'
    | 'completed'
    | 'cancelled';
  method: string;
  destination_address: string;
  created_at: string;
}

/** Numero que vem do Postgres as vezes chega como string ("150.00"). */
function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Datas sao formatadas para pt-BR; o front exibe "Hoje, 14:22". */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function rowToProfile(row: RowProfile): UserAccount {
  return {
    // A identidade do dominio e auth.uid() (= profiles.user_id), nao profiles.id.
    id: row.user_id,
    name: row.full_name ?? '',
    email: row.email ?? '',
    cpf: row.document_number ?? '',
    phone: row.phone ?? '',
    role: row.role === 'super_admin' ? 'admin' : row.role,
    isVerified: row.is_verified,
    // O banco real usa active/inactive/suspended/banned; a tela so conhece dois.
    status: row.status === 'active' ? 'active' : 'blocked',
    wallet: { realBalance: 0, bonusBalance: 0, currency: 'BRL' },
    // daily_deposit_limit nao existe no schema real; default de balcao.
    dailyDepositLimit: 5000,
    createdAt: formatDate(row.created_at),
  };
}

export function rowToWallet(row: RowWallet): UserAccount['wallet'] {
  return {
    realBalance: toNumber(row.wallet_balance),
    bonusBalance: toNumber(row.bonus_balance),
    currency: 'BRL',
  };
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

export async function fetchProfile(userId: string): Promise<UserAccount | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(describeSupabaseError(error));
  return data ? rowToProfile(data as RowProfile) : null;
}

export async function fetchWallet(userId: string): Promise<UserAccount['wallet']> {
  const { data, error } = await supabase
    .from('wallet_balances')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(describeSupabaseError(error));
  if (!data) return { realBalance: 0, bonusBalance: 0, currency: 'BRL' };
  return rowToWallet(data as RowWallet);
}

/**
 * Perfil + carteira em uma leitura. O menu e a carteira abrem juntos, e duas
 * queries sequenciais criam sensacao de lentidao na navegacao.
 */
export async function fetchAccount(userId: string): Promise<UserAccount | null> {
  const [profileResult, walletResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('wallet_balances').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  if (profileResult.error) throw new Error(describeSupabaseError(profileResult.error));
  if (!profileResult.data) return null;

  const profile = rowToProfile(profileResult.data as RowProfile);
  if (walletResult.data) {
    profile.wallet = rowToWallet(walletResult.data as RowWallet);
  }
  return profile;
}

/**
 * Lista de usuarios. So a RLS libera isso (admin). Sem policy para role=user,
 * o retorno vem vazio — que e o comportamento correto, nao um erro.
 */
export async function fetchAllProfiles(): Promise<UserAccount[]> {
  const [{ data: profiles, error }, { data: wallets }] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('wallet_balances').select('*'),
  ]);

  if (error) throw new Error(describeSupabaseError(error));

  const walletByUser = new Map(
    ((wallets ?? []) as RowWallet[]).map(w => [w.user_id, rowToWallet(w)])
  );

  return ((profiles ?? []) as RowProfile[]).map(row => {
    const profile = rowToProfile(row);
    const wallet = walletByUser.get(row.user_id);
    if (wallet) profile.wallet = wallet;
    return profile;
  });
}

/** profiles tem `full_name`, nao `name`. A identidade e user_id, nao id. */
export async function updateProfileName(userId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: name })
    .eq('user_id', userId);
  if (error) throw new Error(describeSupabaseError(error));
}

// ---------------------------------------------------------------------------
// Transacoes
// ---------------------------------------------------------------------------

/**
 * financial_ledger.type e TEXT livre, minusculo (deposit/withdrawal/bet/...).
 * As chaves sao as escritas pelas RPCs em 0002/0003; o mapeamento para o rotulo
 * da UI acontece aqui, num lugar so.
 */
const TRANSACTION_TYPE_MAP: Record<string, Transaction['type']> = {
  deposit: 'DEPOSIT_PIX',
  bonus: 'DEPOSIT_PIX',
  withdrawal: 'WITHDRAW_PIX',
  bet: 'BET_PLACED',
  bet_winnings: 'BET_WON',
  bet_refund: 'CASH_OUT',
};

export function rowToTransaction(row: RowTransaction): Transaction {
  return {
    id: row.id,
    type: TRANSACTION_TYPE_MAP[row.type] ?? 'DEPOSIT_PIX',
    amount: toNumber(row.amount),
    // Todo lancamento do livro de razao ja entra concluido; nao ha status
    // pendente aqui porque nao ha tabela de transacoes de outro produto em uso.
    status: 'COMPLETED',
    date: formatDate(row.created_at),
    description: row.description ?? '',
    txid: row.reference_id ?? undefined,
  };
}

/**
 * Extrato do usuario, lido de `financial_ledger`.
 *
 * A tabela `transactions` do projeto e de outro produto (profile_id + label +
 * amount, sem balanco) e fica intacta.
 */
export async function fetchTransactions(userId: string, limit = 50): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('financial_ledger')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(describeSupabaseError(error));
  return ((data ?? []) as RowTransaction[]).map(rowToTransaction);
}

// ---------------------------------------------------------------------------
// Depositos e saques
// ---------------------------------------------------------------------------

/** uuid do Postgres chega como string no JSON; a UI trata id como string. */
function rowToDeposit(row: RowDeposit): DepositRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: '',
    userCpf: '',
    amount: toNumber(row.amount),
    // O bonus nao fica em coluna: e creditado por approve_deposit_atomic e
    // registrado como lancamento BONUS (financial_ledger.type 'bonus').
    bonusAmount: 0,
    // deposits.status do banco real usa 'confirmed'; a UI fala 'approved'.
    txid: row.transaction_hash ?? '',
    paymentMethod: (row.method || 'pix').toUpperCase(),
    date: formatDate(row.created_at),
    status: row.status === 'confirmed' ? 'approved' : row.status === 'pending' ? 'pending' : 'rejected',
  };
}

export async function fetchDeposits(userId: string): Promise<DepositRequest[]> {
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(describeSupabaseError(error));
  return ((data ?? []) as RowDeposit[]).map(rowToDeposit);
}

/**
 * Fila global de pedidos (admin).
 *
 * Sem filtro de usuario de propósito: quem decide se esta consulta volta com
 * tudo ou só com o próprio é a RLS — policy "usuario le os proprios depositos"
 * + "admin le todos os depositos". Um admin recebe a fila inteira; um usuário
 * comum recebe só o dele, mesmo chamando esta função.
 */
export async function fetchAllDeposits(): Promise<DepositRequest[]> {
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(describeSupabaseError(error));
  return ((data ?? []) as RowDeposit[]).map(rowToDeposit);
}

/**
 * Cria pedido de deposito via RPC.
 *
 * Nao inserimos direto: minimo, bonus e trava em locked_balance sao decididos
 * no banco (ver request_deposit em 0002). Confiar no calculo do cliente
 * deixaria o bonus e o minimo como sugestao.
 */
export async function createDepositRequest(
  amount: number,
  pixTxid?: string
): Promise<DepositRequest> {
  const { data, error } = await supabase.rpc('request_deposit', {
    p_amount: amount,
    p_method: 'pix',
    p_txid: pixTxid ?? null,
  });

  if (error) throw new Error(describeSupabaseError(error));
  if (data == null) throw new Error('Deposito nao registrado.');

  const { data: readData, error: readError } = await supabase
    .from('deposits')
    .select('*')
    .eq('id', data as string)
    .single();

  if (readError) throw new Error(describeSupabaseError(readError));
  return rowToDeposit(readData as RowDeposit);
}

/**
 * withdrawals do schema real: `method` determina o tipo de destino e
 * `destination_address` carrega a chave. O split antigo de "tipo:chave" num
 * unico campo nao existe mais — a leitura aqui e direta.
 */
function rowToWithdraw(row: RowWithdraw): WithdrawRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: '',
    userCpf: '',
    amount: toNumber(row.amount),
    pixKeyType: (row.method || 'pix').toUpperCase(),
    pixKey: row.destination_address,
    date: formatDate(row.created_at),
    // O schema real aceita processing/completed/cancelled; a tela conhece so
    // pending/approved/rejected. Normaliza para o vocabulario da interface.
    status:
      row.status === 'pending' || row.status === 'processing'
        ? 'pending'
        : row.status === 'approved' || row.status === 'completed'
          ? 'approved'
          : 'rejected',
  };
}

export async function fetchWithdrawals(userId: string): Promise<WithdrawRequest[]> {
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(describeSupabaseError(error));
  return ((data ?? []) as RowWithdraw[]).map(rowToWithdraw);
}

/**
 * Fila global de saques (admin). Mesmo raciocínio de fetchAllDeposits: o que
 * limita o retorno é a RLS, não o filtro.
 */
export async function fetchAllWithdrawals(): Promise<WithdrawRequest[]> {
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(describeSupabaseError(error));
  return ((data ?? []) as RowWithdraw[]).map(rowToWithdraw);
}

/**
 * Cria pedido de saque via RPC: o débito do saldo acontece dentro da mesma
 * transação, então o valor não pode ser usado em outra aposta enquanto o saque
 * não é liquidado.
 *
 * `pixKeyType` e `pixKey` viram `p_method` e `p_destination` na assinatura do
 * schema real (request_withdraw(numeric, text, text)).
 */
export async function createWithdrawRequest(
  amount: number,
  pixKeyType: string,
  pixKey: string
): Promise<WithdrawRequest> {
  const { data, error } = await supabase.rpc('request_withdraw', {
    p_amount: amount,
    p_method: 'pix',
    p_destination: pixKey.trim(),
  });

  if (error) throw new Error(describeSupabaseError(error));
  if (!data) throw new Error('Saque nao registrado.');

  const { data: readData, error: readError } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('id', data as string)
    .single();

  if (readError) throw new Error(describeSupabaseError(readError));
  return rowToWithdraw(readData as RowWithdraw);
}

// ---------------------------------------------------------------------------
// House settings
// ---------------------------------------------------------------------------

export const DEFAULT_HOUSE_SETTINGS: HouseSettings = {
  minDeposit: 20,
  minWithdraw: 30,
  welcomeBonusEnabled: true,
  welcomeBonusPercent: 100,
  autoApproveSmallDeposits: false,
  autoApproveThreshold: 100,
  houseMarginPercent: 5,
  maintenanceMode: false,
  pixKeyType: 'auto',
  pixKey: 'financeiro@primasbet.bet.br',
  pixMerchantName: 'PRIMASBET PAGAMENTOS S.A.',
  pixMerchantCity: 'SAO PAULO',
  bankName: '',
  bankAgency: '',
  bankAccount: '',
};

/**
 * Parametros da casa, lidos de `system_settings` (linhas key/value texto).
 *
 * O rascunho lia uma `house_settings` de colunas fixas que nao existe. Aqui as
 * chaves sao montadas num mapa e caem no default quando ausentes, entao a
 * ausencia de uma linha nunca quebra a tela.
 */
export async function fetchHouseSettings(): Promise<HouseSettings> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', [
      'min_deposit',
      'min_withdraw',
      'welcome_bonus_enabled',
      'welcome_bonus_percent',
      'house_margin',
      'maintenance_mode',
      'pix_key_type',
      'pix_key',
      'pix_merchant_name',
      'pix_merchant_city',
      'bank_name',
      'bank_agency',
      'bank_account',
    ]);

  if (error) throw new Error(describeSupabaseError(error));

  const settings = new Map<string, string>(
    ((data ?? []) as { key: string; value: string }[]).map(row => [row.key, row.value])
  );

  const readBool = (key: string, fallback: boolean): boolean => {
    const raw = settings.get(key);
    if (raw == null) return fallback;
    return raw === 'true' || raw === '1';
  };

  const overround = toNumber(settings.get('house_margin'), 1.05);

  return {
    minDeposit: toNumber(settings.get('min_deposit'), DEFAULT_HOUSE_SETTINGS.minDeposit),
    minWithdraw: toNumber(settings.get('min_withdraw'), DEFAULT_HOUSE_SETTINGS.minWithdraw),
    welcomeBonusEnabled: readBool('welcome_bonus_enabled', true),
    welcomeBonusPercent: toNumber(
      settings.get('welcome_bonus_percent'),
      DEFAULT_HOUSE_SETTINGS.welcomeBonusPercent
    ),
    autoApproveSmallDeposits: false,
    autoApproveThreshold: 100,
    // O banco guarda a margem como overround (1.05); a UI fala em percentual (5).
    houseMarginPercent: overround * 100 - 100,
    maintenanceMode: readBool('maintenance_mode', false),
    pixKeyType: settings.get('pix_key_type') || DEFAULT_HOUSE_SETTINGS.pixKeyType,
    pixKey: settings.get('pix_key') || DEFAULT_HOUSE_SETTINGS.pixKey,
    pixMerchantName:
      settings.get('pix_merchant_name') || DEFAULT_HOUSE_SETTINGS.pixMerchantName,
    pixMerchantCity: settings.get('pix_merchant_city') || DEFAULT_HOUSE_SETTINGS.pixMerchantCity,
    bankName: settings.get('bank_name') || DEFAULT_HOUSE_SETTINGS.bankName,
    bankAgency: settings.get('bank_agency') || DEFAULT_HOUSE_SETTINGS.bankAgency,
    bankAccount: settings.get('bank_account') || DEFAULT_HOUSE_SETTINGS.bankAccount,
  };
}

/**
 * Coloca uma aposta.
 *
 * Delegada a `place_bet_atomic`, que debita a carteira e grava a aposta na mesma
 * transacao. Nao chamamos `wallets.update` aqui: a RLS nega, e o saldo confiado
 * ao cliente e o que permitia forgery — o usuario enviava `stake: 0`.
 *
 * `totalOdd` e `potentialReturn` sao ENTRADA do usuario e nao vao na RPC: o
 * preco e lido de `market_choices` dentro da transacao. O retorno traz a odd e
 * o payout que o banco gravou, e a UI usa esses valores — calcular o payout no
 * navegador criaria a chance de mostrar um premio que o servidor nunca vai pagar.
 */
export async function placeBet(input: {
  type: 'single' | 'multiple';
  selections: unknown;
  stake: number;
}): Promise<{ betId: string; totalOdd: number; potentialReturn: number }> {
  const { data, error } = await supabase.rpc('place_bet_atomic', {
    p_type: input.type,
    p_selections: input.selections,
    p_stake: input.stake,
  });

  if (error) throw new Error(describeSupabaseError(error));

  const row = (Array.isArray(data) ? data[0] : data) as
    | { bet_id: string; total_odds: number; potential_return: number }
    | null;

  if (!row) throw new Error('Aposta nao registrada.');

  return {
    betId: row.bet_id,
    totalOdd: toNumber(row.total_odds),
    potentialReturn: toNumber(row.potential_return),
  };
}

// ---------------------------------------------------------------------------
// Mercados eleitorais
// ---------------------------------------------------------------------------

export interface ElectionCandidate {
  id: string;
  name: string;
  party: string | null;
  odds: number;
  previousOdds?: number;
  /** Intencao de voto (%) em pesquisa/apuracao real. */
  voteIntention: number | null;
  /** Fonte da pesquisa/apuracao (ex.: "Datafolha", "TSE ..."). */
  pollSource: string | null;
  pollDate: string | null;
}

export interface ElectionContest {
  id: string;
  scope: 'PRESIDENT' | 'GOVERNOR';
  stateCode: string | null;
  title: string;
  status: 'OPEN' | 'SUSPENDED' | 'CLOSED';
  electionDate: string | null;
  candidates: ElectionCandidate[];
}

/**
 * Presidentes e governadores abertos, com candidatos e odds.
 *
 * So `status = 'OPEN'` entra: um prototyping suspenso continua no banco para
 * preservar as apostas ja feitas, mas some da vitrine.
 */
export async function fetchElectionContests(): Promise<ElectionContest[]> {
  const { data, error } = await supabase
    .from('election_contests')
    .select(
      `
        id, scope, state_code, title, status, election_date,
        election_candidates (
          id, name, party, odds, previous_odds, vote_intention, poll_source, poll_date, sort_order
        )
      `
    )
    .eq('status', 'OPEN')
    .order('scope', { ascending: true })
    .order('title', { ascending: true });

  if (error) throw new Error(describeSupabaseError(error));

  return ((data ?? []) as unknown as RowElectionContest[]).map(row => ({
    id: row.id,
    scope: row.scope,
    stateCode: row.state_code,
    title: row.title,
    status: row.status,
    electionDate: row.election_date,
    candidates: (row.election_candidates ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(candidate => ({
        id: candidate.id,
        name: candidate.name,
        party: candidate.party,
        odds: toNumber(candidate.odds),
        previousOdds:
          candidate.previous_odds == null ? undefined : toNumber(candidate.previous_odds),
        voteIntention:
          candidate.vote_intention == null ? null : toNumber(candidate.vote_intention),
        pollSource: candidate.poll_source,
        pollDate: candidate.poll_date,
      })),
  }));
}

/**
 * Aposta em candidato.
 *
 * A odd e o retorno vem do banco — o mesmo cuidado de `placeBet`. Escrita em
 * `bets` normal, entao o extrato e a liquidacao nao precisam saber que a aposta
 * foi eleitoral.
 */
export async function placeElectionBet(input: {
  contestId: string;
  candidateId: string;
  stake: number;
}): Promise<{ betId: string; odds: number; potentialReturn: number; candidateName: string }> {
  const { data, error } = await supabase.rpc('place_election_bet_atomic', {
    p_contest_id: input.contestId,
    p_candidate_id: input.candidateId,
    p_stake: input.stake,
  });

  if (error) throw new Error(describeSupabaseError(error));

  const row = (Array.isArray(data) ? data[0] : data) as
    | { bet_id: string; odds: number; potential_return: number; candidate_name: string }
    | null;

  if (!row) throw new Error('Aposta nao registrada.');

  return {
    betId: row.bet_id,
    odds: toNumber(row.odds),
    potentialReturn: toNumber(row.potential_return),
    candidateName: row.candidate_name,
  };
}

// ---------------------------------------------------------------------------
// Minhas Apostas — leitura das apostas gravadas
// ---------------------------------------------------------------------------

interface RowBet {
  id: string;
  user_id?: string;
  type: string;
  status: string;
  selections: unknown;
  total_odds: number | string;
  stake: number | string;
  potential_return: number | string;
  placed_at: string;
  election_contest_id: string | null;
}

interface ElectionRef {
  id: string;
  title: string;
  scope: 'PRESIDENT' | 'GOVERNOR';
}

const BET_STATUSES = ['OPEN', 'WON', 'LOST', 'CASHED_OUT', 'VOID'];

function formatBetDate(iso: string): string {
  const placed = new Date(iso);
  const now = new Date();
  const hh = String(placed.getHours()).padStart(2, '0');
  const mm = String(placed.getMinutes()).padStart(2, '0');
  if (placed.toDateString() === now.toDateString()) return `Hoje, ${hh}:${mm}`;
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (placed.toDateString() === yesterday.toDateString()) return `Ontem, ${hh}:${mm}`;
  return `${String(placed.getDate()).padStart(2, '0')}/${String(
    placed.getMonth() + 1
  ).padStart(2, '0')}, ${hh}:${mm}`;
}

/**
 * Uma linha de `bets` vira um BetTicket do boletim.
 *
 * Selecao eleitoral gravada pelo `place_election_bet_atomic` nao tem odd dentro
 * do jsonb (so candidateName/ids) — o preco mora em `bets.total_odds`, que e o
 * que a aposta realmente usou. Titulo do contesto vem da vitrine ja carregada.
 */
function rowToTicket(row: RowBet, contests: ElectionRef[]): BetTicket {
  const raw = Array.isArray(row.selections) ? (row.selections as Record<string, unknown>[]) : [];
  const totalOdd = toNumber(row.total_odds);

  const selections: BetSelection[] = raw.map((s, idx) => {
    if (s.kind === 'election') {
      const contestId = String(s.contestId ?? row.election_contest_id ?? '');
      const contest = contests.find((c) => c.id === contestId);
      const scope: 'PRESIDENT' | 'GOVERNOR' = s.scope === 'GOVERNOR' ? 'GOVERNOR' : 'PRESIDENT';
      const candidateName = String(s.candidateName ?? '');
      return {
        kind: 'election',
        electionContestId: contestId,
        electionCandidateId: String(s.candidateId ?? ''),
        matchId: contestId || 'election',
        matchTitle: contest?.title ?? ELECTION_SCOPE_LABEL[scope],
        homeTeam: candidateName,
        awayTeam: '',
        league: 'Eleições',
        sport: 'politics',
        isLive: false,
        marketId: 'election-winner',
        marketName: ELECTION_SCOPE_LABEL[scope],
        choiceId: String(s.candidateId ?? `candidato-${idx}`),
        choiceLabel: candidateName,
        odd: totalOdd,
        initialOdd: totalOdd,
      };
    }

    return {
      kind: 'match',
      matchId: String(s.matchId ?? ''),
      matchTitle: String(s.matchTitle ?? ''),
      homeTeam: String(s.homeTeam ?? ''),
      awayTeam: String(s.awayTeam ?? ''),
      league: String(s.league ?? ''),
      sport: (s.sport as SportId) ?? 'football',
      isLive: Boolean(s.isLive),
      minute: s.minute == null ? undefined : Number(s.minute),
      marketId: String(s.marketId ?? ''),
      marketName: String(s.marketName ?? ''),
      choiceId: String(s.choiceId ?? `selecao-${idx}`),
      choiceLabel: String(s.choiceLabel ?? ''),
      odd: toNumber(s.odd ?? totalOdd),
      initialOdd: toNumber(s.initialOdd ?? s.odd ?? totalOdd),
    };
  });

  return {
    id: row.id,
    userId: row.user_id,
    date: formatBetDate(row.placed_at),
    type: row.type === 'multiple' ? 'multiple' : 'single',
    selections,
    totalOdd,
    stake: toNumber(row.stake),
    potentialReturn: toNumber(row.potential_return),
    status: (BET_STATUSES.includes(row.status) ? row.status : 'OPEN') as BetTicket['status'],
  };
}

/**
 * Minhas Apostas vem do banco, nao de memoria: a mesma lista sobrevive a
 * reload e mostra aposta esportiva e eleitoral no mesmo lugar.
 *
 * O filtro por `user_id` e obrigatorio aqui: a policy de admin le TODAS as
 * apostas, e o admin nao quer a lista dos outros usuarios no proprio boletim.
 */
export async function fetchBets(
  userId: string,
  contests: ElectionRef[] = []
): Promise<BetTicket[]> {
  const { data, error } = await supabase
    .from('bets')
    .select(
      'id, type, status, selections, total_odds, stake, potential_return, placed_at, election_contest_id'
    )
    .eq('user_id', userId)
    .order('placed_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(describeSupabaseError(error));

  return ((data ?? []) as unknown as RowBet[]).map((row) => rowToTicket(row, contests));
}

/**
 * Fila de liquidacao do painel admin: TODAS as apostas, com o dono.
 *
 * Sem `.eq('user_id')` de proposito: a policy "admin le todas as apostas" e
 * quem autoriza. Role=user passa pela mesma consulta e so enxerga as proprias
 * (RLS aplica o filtro), mas o painel nem tenta — a lista so e pedida em sessao
 * de admin.
 */
export async function fetchAllBets(contests: ElectionRef[] = []): Promise<BetTicket[]> {
  const { data, error } = await supabase
    .from('bets')
    .select(
      'id, user_id, type, status, selections, total_odds, stake, potential_return, placed_at, election_contest_id'
    )
    .order('placed_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(describeSupabaseError(error));

  return ((data ?? []) as unknown as RowBet[]).map((row) => rowToTicket(row, contests));
}

/**
 * Partidas e mercados, lidos direto do Postgres.
 *
 * Substitui o `/api/matches` do Express removido. A consulta traz partidas
 * visiveis junto com home:teams, away:teams, leagues e os mercados aninhados —
 * sem isso, a tela ficaria com partida sem nome de time ou sem odd.
 *
 * `markets` e um array json montado no Postgres porque a UI precisa do mercado
 * inteiro de uma vez; o preco de desnormalizar e paginacao por partida.
 */
export async function fetchLiveMatches(): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
        id, status, kickoff_at, minute, home_score, away_score, margin,
        home:teams!matches_home_team_id_fkey ( id, name, logo_url ),
        away:teams!matches_away_team_id_fkey ( id, name, logo_url ),
        league:leagues ( id, name, country, sport ),
        match_markets (
          id, name, category,
          market_choices ( id, label, odds, previous_odds, trend, is_suspended, sort_order )
        )
      `
    )
    .in('status', ['OPEN', 'LIVE'])
    .order('kickoff_at', { ascending: true })
    .limit(60);

  if (error) throw new Error(describeSupabaseError(error));
  return ((data ?? []) as unknown as RowMatch[]).map(toMatch);
}

/**
 * O overround vem como 1.05 no banco (multiplicador) e a UI fala em
 * "percentual de margem" (5). Converte para o formato do banco.
 */
export function marginPercentToOverround(percent: number): number {
  const clamped = Math.min(50, Math.max(2, percent));
  return Number((1 + clamped / 100).toFixed(4));
}

// ---------------------------------------------------------------------------
// Feed esportivo real (Edge Function sync-sports / ESPN)
// ---------------------------------------------------------------------------

export interface SyncFeedResult {
  throttled?: boolean;
  synced: number;
  leagues?: number;
  errors?: number;
  skipped?: number;
  waitSeconds?: number;
  timestamp?: string;
}

let lastSyncAt = 0;

/**
 * Dispara a sincronizacao com o feed real (ESPN). Nao lanca erro quando a Edge
 * Function apenas trava o intervalo minimo — isso e rotina, nao falha.
 *
 * O feed grava partidas/mercados com service_role; este cliente continua
 * somente-leitura (anon key + RLS).
 */
export async function syncMatchFeed(
  minIntervalMs = 20_000
): Promise<SyncFeedResult> {
  const now = Date.now();
  if (now - lastSyncAt < minIntervalMs) {
    return { throttled: true, synced: 0 };
  }

  const { data, error } = await supabase.functions.invoke('sync-sports', {});

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const parsed = (await context.json().catch(() => null)) as { error?: string } | null;
      if (parsed?.error) throw new Error(parsed.error);
    }
    throw new Error(describeSupabaseError(error));
  }

  lastSyncAt = Date.now();
  return {
    throttled: Boolean((data as { throttled?: boolean } | null)?.throttled),
    synced: (data as { synced?: number } | null)?.synced ?? 0,
    leagues: (data as { leagues?: number } | null)?.leagues,
    errors: (data as { errors?: number } | null)?.errors,
    skipped: (data as { skipped?: number } | null)?.skipped,
    waitSeconds: (data as { waitSeconds?: number } | null)?.waitSeconds,
    timestamp: (data as { timestamp?: string } | null)?.timestamp,
  };
}