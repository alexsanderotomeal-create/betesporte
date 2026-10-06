/**
 * Chamadas ao backoffice (Edge Function admin-actions).
 *
 * Toda operacao que mexe em dinheiro passa pelo servidor com service_role. Nao
 * ha, neste arquivo, nenhuma escrita direta em `wallets`: a RLS proibe e o
 * proprio banco recusaria.
 */

import { describeSupabaseError, supabase } from '../lib/supabase';

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
  | 'delete_election_contest';

export interface AdminActionBody {
  requestId?: string;
  userId?: string;
  candidateId?: string;
  contestId?: string;
  odds?: number;
  amount?: number;
  status?: 'active' | 'blocked';
  role?: 'user' | 'admin';
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
};