/**
 * Chamada ao backoffice (Edge Function admin-actions).
 *
 * Toda operacao que mexe em dinheiro passa pelo servidor com service_role. Nao
 * ha, neste arquivo, nenhuma escrita direta em `wallets`: a RLS proibe e o
 * proprio banco recusaria.
 */

import { describeSupabaseError, supabase } from '../lib/supabase';
import type { AdminUserDetail } from '../types/auth';

/** Resumo retornado pela liquidacao automatica (auto_settle_bets). */
export interface AutoSettleSummary {
  settled_won: number;
  settled_lost: number;
  settled_void: number;
  skipped_pending: number;
  skipped_unresolved: number;
  skipped_election: number;
}

export type AdminAction =
  | 'approve_deposit'
  | 'reject_deposit'
  | 'approve_withdraw'
  | 'reject_withdraw'
  | 'credit_user'
  | 'toggle_user_status'
  | 'save_house_settings'
  | 'set_election_odd'
  | 'set_user_role'
  | 'upsert_election_contest'
  | 'save_election_candidate'
  | 'delete_election_candidate'
  | 'delete_election_contest'
  | 'settle_bet'
  | 'auto_settle_bets'
  | 'update_user'
  | 'debit_user'
  | 'get_user_detail'
  | 'review_kyc'
  | 'send_notification'
  | 'delete_user';

export interface AdminActionBody {
  requestId?: string;
  userId?: string;
  candidateId?: string;
  contestId?: string;
  betId?: string;
  result?: 'WON' | 'LOST' | 'VOID';
  odds?: number;
  amount?: number;
  status?: 'active' | 'blocked';
  role?: 'user' | 'admin';
  fields?: Record<string, unknown>;
  kycStatus?: 'pending' | 'approved' | 'rejected';
  notes?: string;
  title?: string;
  message?: string;
  kind?: string;
  settings?: Record<string, unknown>;
  contest?: {
    id?: string;
    scope?: 'PRESIDENT' | 'GOVERNOR';
    stateCode?: string | null;
    title: string;
    status?: 'OPEN' | 'SUSPENDED' | 'CLOSED' | 'FINISHED';
  };
  candidate?: {
    id?: string;
    contestId?: string;
    name?: string;
    party?: string | null;
    odds?: number;
    voteIntention?: number | null;
    pollSource?: string | null;
    pollDate?: string | null;
    sortOrder?: number;
  };
}

/**
 * `functions.invoke` usa a client JWT automaticamente. Se a Edge Function nao
 * estiver implantada, o Supabase devolve 404 e o erro real chega em `context`.
 */
export async function invokeAdminAction(
  action: AdminAction,
  body: AdminActionBody = {}
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-actions', {
    body: { action, ...body },
  });

  if (error) {
    // A Edge Function respondeu com corpo de erro, e nao com erro de rede.
    const context = (error as { context?: Response }).context;
    if (context) {
      const parsed = (await context.json().catch(() => null)) as { error?: string } | null;
      if (parsed?.error) throw new Error(parsed.error);
    }
    throw new Error(describeSupabaseError(error));
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const parsed = data as { error?: string };
    if (parsed.error) throw new Error(parsed.error);
  }
}

/**
 * Variante que devolve o corpo da Edge Function (para acoes com resposta,
 * como o resumo da liquidacao automatica). A validacao de erro e a mesma.
 */
export async function invokeAdminActionData<T>(
  action: AdminAction,
  body: AdminActionBody = {}
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-actions', {
    body: { action, ...body },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const parsed = (await context.json().catch(() => null)) as { error?: string } | null;
      if (parsed?.error) throw new Error(parsed.error);
    }
    throw new Error(describeSupabaseError(error));
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const parsed = data as { error?: string };
    if (parsed.error) throw new Error(parsed.error);
  }

  return (data ?? {}) as T;
}

export const adminActions = {
  approveDeposit: (requestId: string) => invokeAdminAction('approve_deposit', { requestId }),
  rejectDeposit: (requestId: string) => invokeAdminAction('reject_deposit', { requestId }),
  approveWithdraw: (requestId: string) => invokeAdminAction('approve_withdraw', { requestId }),
  rejectWithdraw: (requestId: string) => invokeAdminAction('reject_withdraw', { requestId }),
  creditUser: (userId: string, amount: number) => invokeAdminAction('credit_user', { userId, amount }),
  toggleUserStatus: (userId: string, status: 'active' | 'blocked') =>
    invokeAdminAction('toggle_user_status', { userId, status }),
  saveHouseSettings: (settings: Record<string, unknown>) =>
    invokeAdminAction('save_house_settings', { settings }),
  /**
   * Ajusta a cotacao da casa de um candidato. E o unico caminho para mexer no
   * numero: a RLS barra escrita direta pela anon key, e a RPC registra a mudanca
   * em election_odds_history com o id de quem fez.
   */
  setElectionOdd: (candidateId: string, odds: number) =>
    invokeAdminAction('set_election_odd', { candidateId, odds }),
  setUserRole: (userId: string, role: 'user' | 'admin') =>
    invokeAdminAction('set_user_role', { userId, role }),
  upsertElectionContest: (contest: AdminActionBody['contest']) =>
    invokeAdminAction('upsert_election_contest', { contest }),
  saveElectionCandidate: (candidate: NonNullable<AdminActionBody['candidate']>) =>
    invokeAdminAction('save_election_candidate', { candidate }),
  deleteElectionCandidate: (candidateId: string) =>
    invokeAdminAction('delete_election_candidate', { candidateId }),
  deleteElectionContest: (contestId: string) =>
    invokeAdminAction('delete_election_contest', { contestId }),
  /**
   * Liquida uma aposta aberta. O valor de `amount` e o retorno de
   * bets.potential_return (a tela so confirma); LOST e VOID nao pagam escolha:
   * a RPC zera o perdedor e faz a anulacao devolver a stake.
   */
  settleBet: (betId: string, result: 'WON' | 'LOST' | 'VOID', amount?: number) =>
    invokeAdminAction('settle_bet', { betId, result, amount }),
  /**
   * Varre apostas abertas, confronta com o placar final das partidas e
   * liquida as resolvidas por lote. Retorna o resumo do que aconteceu.
   */
  autoSettleBets: () =>
    invokeAdminActionData<AutoSettleSummary>('auto_settle_bets'),
  /**
   * Edita a conta de um usuario no backoffice. So os campos realmente enviados
   * entram na whitelist da RPC admin_update_user_atomic.
   */
  updateUser: (userId: string, fields: Record<string, unknown>) =>
    invokeAdminAction('update_user', { userId, fields }),
  /** Debito manual (ajuste negativo) pelo backoffice. */
  debitUser: (userId: string, amount: number, message?: string) =>
    invokeAdminAction('debit_user', { userId, amount, message }),
  /** Detalhe completo do usuario (perfil, carteira, pedidos, apostas, extrato). */
  getUserDetail: (userId: string) =>
    invokeAdminActionData<AdminUserDetail>('get_user_detail', { userId }),
  reviewKyc: (userId: string, kycStatus: 'pending' | 'approved' | 'rejected', notes?: string) =>
    invokeAdminAction('review_kyc', { userId, kycStatus, notes }),
  sendNotification: (userId: string, title: string, message?: string, kind?: string) =>
    invokeAdminAction('send_notification', { userId, title, message, kind }),
  /**
   * Exclusao definitiva da conta. Remove perfil, carteira, historico e o
   * auth.users numa transacao. A RPC recusa excluir a si mesmo ou outro admin.
   */
  deleteUser: (userId: string) => invokeAdminAction('delete_user', { userId }),
};