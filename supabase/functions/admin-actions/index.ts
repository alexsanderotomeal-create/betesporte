/**
 * Backoffice financeiro.
 *
 * Roda com service_role: e a unica via para aprovar deposito, liquidar saque e
 * creditar saldo. A RLS nega escrita em wallet_balances e em deposits para
 * qualquer papel, inclusive admin — de proposito. Um cliente com bug nao pode
 * virar o proprio aprovador, mesmo que vaze um token de admin.
 *
 * O schema real reaproveita deposits/withdrawals/system_settings. Status:
 * deposits usa 'confirmed' (nao 'approved'); withdrawals ja aceita 'approved'.
 * profiles tem role admin/super_admin e status active/inactive/suspended/banned,
 * e a identidade e user_id (FK auth.users), nao profiles.id.
 *
 * Toda mudanca de dinheiro e status passa por RPC security definer: aqui a
 * funcao so autoriza e repassa. Nao ha UPDATE direto em tabela financeira.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ActionPayload {
  action:
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
    | 'settle_bet';
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  /**
   * Chave de bypass de RLS. O Supabase trocou `service_role` (JWT `eyJ...`) por
   * `sb_secret_...`; ambas funcionam em supabase-js v2, entao as duas sao lidas.
   * Esta variavel NUNCA vem de import.meta.env: se entrasse no bundle do front,
   * viraria leitura publica de qualquer tabela.
   */
  const serviceRoleKey =
    Deno.env.get('PRIMASBET_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    '';

  if (!serviceRoleKey) {
    return json({ error: 'Service role nao configurada na Edge Function.' }, 500);
  }

  // Confia no gateway do Supabase: ele valida o JWT do usuario e o repassa.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Token ausente.' }, 401);
  }

  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Autorizacao conferida aqui, com service_role. A RLS nao ajuda neste ponto
  // porque o cliente admin acima ja ignora as politicas por design.
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: 'Sessao invalida.' }, 401);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('user_id, role, status')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  // O schema real tem 'super_admin' alem de 'admin'; ambos comandam o painel.
  if (
    !profile ||
    (profile.role !== 'admin' && profile.role !== 'super_admin') ||
    profile.status !== 'active'
  ) {
    return json({ error: 'Acesso restrito a administradores.' }, 403);
  }

  let payload: ActionPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo invalido.' }, 400);
  }

  const reviewerId = userData.user.id;

  switch (payload.action) {
    case 'approve_deposit': {
      const requestId = payload.requestId;
      if (!requestId) return json({ error: 'requestId obrigatorio.' }, 400);

      const { data: request, error: readError } = await admin
        .from('deposits')
        .select('id, status, amount')
        .eq('id', requestId)
        .maybeSingle();

      if (readError) return json({ error: readError.message }, 500);
      if (!request) return json({ error: 'Deposito nao encontrado.' }, 404);

      // Checagem e feedback rapido. A corrida real e bloqueada dentro da RPC,
      // que faz SELECT ... FOR UPDATE e so aceita status 'pending'.
      if (request.status !== 'pending') {
        return json({ error: `Deposito ja esta ${request.status}.` }, 409);
      }

      const { error: txError } = await admin.rpc('approve_deposit_atomic', {
        p_request_id: requestId,
        p_reviewer_id: reviewerId,
      });

      if (txError) return json({ error: txError.message }, 409);

      return json({ success: true, requestId, amount: request.amount });
    }

    case 'reject_deposit': {
      const requestId = payload.requestId;
      if (!requestId) return json({ error: 'requestId obrigatorio.' }, 400);

      // Estorno do valor travado acontece dentro da RPC. Um UPDATE direto aqui
      // mudaria o status sem devolver o locked_balance.
      const { error } = await admin.rpc('reject_deposit_atomic', {
        p_request_id: requestId,
        p_reviewer_id: reviewerId,
      });

      if (error) return json({ error: error.message }, 409);
      return json({ success: true, requestId });
    }

    case 'approve_withdraw': {
      const requestId = payload.requestId;
      if (!requestId) return json({ error: 'requestId obrigatorio.' }, 400);

      // O saldo ja foi debitado quando o saque foi pedido (request_withdraw),
      // entao aprovar e so registrar a liquidacao.
      const { error } = await admin.rpc('approve_withdrawal_atomic', {
        p_request_id: requestId,
        p_reviewer_id: reviewerId,
      });

      if (error) return json({ error: error.message }, 409);
      return json({ success: true, requestId });
    }

    case 'reject_withdraw': {
      const requestId = payload.requestId;
      if (!requestId) return json({ error: 'requestId obrigatorio.' }, 400);

      // Estorno: o valor volta para a carteira do usuario.
      const { error } = await admin.rpc('reject_withdrawal_atomic', {
        p_request_id: requestId,
        p_reviewer_id: reviewerId,
      });

      if (error) return json({ error: error.message }, 409);
      return json({ success: true, requestId });
    }

    case 'credit_user': {
      const { userId, amount } = payload;
      if (!userId || typeof amount !== 'number' || amount <= 0) {
        return json({ error: 'userId e amount positivo obrigatorios.' }, 400);
      }

      const { error } = await admin.rpc('credit_wallet_atomic', {
        p_user_id: userId,
        p_amount: amount,
        p_description: 'Credito manual pelo administrador',
        p_reviewer_id: reviewerId,
      });

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, userId, amount });
    }

    case 'toggle_user_status': {
      const { userId, status } = payload;
      if (!userId || !status) return json({ error: 'userId e status obrigatorios.' }, 400);
      if (userId === reviewerId) {
        return json({ error: 'Administrador nao pode alterar o proprio status.' }, 400);
      }

      // O schema real nao tem is_banned: profiles.status e a fonte (active/
      // inactive/suspended/banned). set_user_status mapeia 'blocked'->'suspended'
      // para caber no check e grava is_active consistente.
      const { error } = await admin.rpc('set_user_status', {
        p_user_id: userId,
        p_status: status,
        p_reviewer_id: reviewerId,
      });

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, userId, status });
    }

    case 'set_user_role': {
      const { userId, role } = payload;
      if (!userId || !role) return json({ error: 'userId e role obrigatorios.' }, 400);
      if (role !== 'user' && role !== 'admin') {
        return json({ error: 'Role invalida.' }, 400);
      }

      const { error } = await admin.rpc('set_user_role', {
        p_user_id: userId,
        p_role: role,
        p_reviewer_id: reviewerId,
      });

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, userId, role });
    }

    case 'save_house_settings': {
      const settings = payload.settings;
      if (!settings) return json({ error: 'settings obrigatorio.' }, 400);

      const patch: Record<string, string> = {};
      if (typeof settings.minDeposit === 'number') patch.min_deposit = String(settings.minDeposit);
      if (typeof settings.minWithdraw === 'number') patch.min_withdraw = String(settings.minWithdraw);
      if (typeof settings.welcomeBonusEnabled === 'boolean') {
        patch.welcome_bonus_enabled = String(settings.welcomeBonusEnabled);
      }
      if (typeof settings.welcomeBonusPercent === 'number') {
        patch.welcome_bonus_percent = String(settings.welcomeBonusPercent);
      }
      if (typeof settings.houseMarginPercent === 'number') {
        patch.house_margin = (1 + settings.houseMarginPercent / 100).toFixed(4);
      }
      if (typeof settings.maintenanceMode === 'boolean') {
        patch.maintenance_mode = String(settings.maintenanceMode);
      }
      if (typeof settings.pixKey === 'string' && settings.pixKey.trim()) {
        patch.pix_key = settings.pixKey.trim();
      }
      if (typeof settings.pixMerchantName === 'string' && settings.pixMerchantName.trim()) {
        patch.pix_merchant_name = settings.pixMerchantName.trim();
      }
      if (typeof settings.pixMerchantCity === 'string' && settings.pixMerchantCity.trim()) {
        patch.pix_merchant_city = settings.pixMerchantCity.trim();
      }
      if (typeof settings.bankName === 'string' && settings.bankName.trim()) {
        patch.bank_name = settings.bankName.trim();
      }
      if (typeof settings.bankAgency === 'string' && settings.bankAgency.trim()) {
        patch.bank_agency = settings.bankAgency.trim();
      }
      if (typeof settings.bankAccount === 'string' && settings.bankAccount.trim()) {
        patch.bank_account = settings.bankAccount.trim();
      }

      // system_settings e key/value e nao tem unique em key confirmado. Por isso
      // update-then-insert em vez de upsert, que abortaria em coluna sem indice.
      for (const [key, value] of Object.entries(patch)) {
        const { error: updateError } = await admin
          .from('system_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', key);

        if (updateError) return json({ error: updateError.message }, 500);

        const { data: existing } = await admin
          .from('system_settings')
          .select('key')
          .eq('key', key)
          .maybeSingle();

        if (!existing) {
          const { error: insertError } = await admin
            .from('system_settings')
            .insert({ key, value, updated_at: new Date().toISOString() });

          if (insertError) return json({ error: insertError.message }, 500);
        }
      }

      return json({ success: true, updated: Object.keys(patch) });
    }

    case 'set_election_odd': {
      const { candidateId, odds } = payload;
      if (!candidateId || typeof odds !== 'number') {
        return json({ error: 'candidateId e odds numerico obrigatorios.' }, 400);
      }

      // Faixa validada aqui e de novo na RPC. A RPC e quem decide: passar direto
      // por ela ja exigiria service_role e o perfil admin ativo.
      if (odds <= 1 || odds > 1000) {
        return json({ error: 'Odd fora da faixa permitida.' }, 400);
      }

      const { error } = await admin.rpc('set_election_candidate_odd_atomic', {
        p_candidate_id: candidateId,
        p_odds: odds,
        p_changed_by: reviewerId,
      });

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, candidateId, odds });
    }

    case 'upsert_election_contest': {
      const { contest } = payload;
      if (!contest || !contest.title || !contest.title.trim()) {
        return json({ error: 'Titulo do contesto e obrigatorio.' }, 400);
      }

      const fields: Record<string, unknown> = {
        title: contest.title.trim(),
        status: contest.status ?? 'OPEN',
        election_date: contest.status === 'CLOSED' ? undefined : contest.scope === 'PRESIDENT' ? '2026-10-25' : undefined,
      };
      if (contest.scope) fields.scope = contest.scope;
      if (contest.stateCode != null) fields.state_code = contest.stateCode;

      if (contest.id) {
        const { data, error } = await admin
          .from('election_contests')
          .update(fields)
          .eq('id', contest.id)
          .select('id')
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, contest: data });
      }

      const { data, error } = await admin
        .from('election_contests')
        .insert({
          scope: contest.scope ?? 'PRESIDENT',
          state_code: contest.stateCode ?? null,
          title: contest.title.trim(),
          status: contest.status ?? 'OPEN',
        })
        .select('id')
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, contest: data });
    }

    case 'save_election_candidate': {
      const { candidate } = payload;
      if (!candidate) return json({ error: 'candidate obrigatorio.' }, 400);

      const campaign: Record<string, unknown> = {};
      if (candidate.name !== undefined) {
        if (!candidate.name.trim()) return json({ error: 'Nome obrigatorio.' }, 400);
        campaign.name = candidate.name.trim();
      }
      if (candidate.party !== undefined && candidate.party !== null) {
        campaign.party = candidate.party.trim() || null;
      }
      if (candidate.voteIntention !== undefined && candidate.voteIntention !== null) {
        if (candidate.voteIntention < 0 || candidate.voteIntention > 100) {
          return json({ error: 'Intencao de voto fora da faixa (0-100).' }, 400);
        }
        campaign.vote_intention = candidate.voteIntention;
      }
      if (candidate.pollSource !== undefined && candidate.pollSource !== null) {
        campaign.poll_source = candidate.pollSource.trim() || null;
      }
      if (candidate.pollDate !== undefined && candidate.pollDate !== null) {
        campaign.poll_date = candidate.pollDate || null;
      }
      if (candidate.sortOrder !== undefined) campaign.sort_order = candidate.sortOrder;

      const validOdds = (n: unknown): n is number =>
        typeof n === 'number' && n > 1 && n <= 1000;

      if (candidate.id) {
        const { data: current } = await admin
          .from('election_candidates')
          .select('odds')
          .eq('id', candidate.id)
          .maybeSingle();

        // Mudanca de odd passa pela RPC para auditagem no odds_history.
        if (candidate.odds !== undefined && current) {
          if (!validOdds(candidate.odds)) {
            return json({ error: 'Odd fora da faixa permitida.' }, 400);
          }
          if (candidate.odds !== Number(current.odds)) {
            const { error: rpcError } = await admin.rpc('set_election_candidate_odd_atomic', {
              p_candidate_id: candidate.id,
              p_odds: candidate.odds,
              p_changed_by: reviewerId,
            });
            if (rpcError) return json({ error: rpcError.message }, 500);
          }
        }

        if (Object.keys(campaign).length === 0) {
          return json({ success: true, candidate: current });
        }

        const { data, error } = await admin
          .from('election_candidates')
          .update({ ...campaign, updated_at: new Date().toISOString() })
          .eq('id', candidate.id)
          .select()
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, candidate: data });
      }

      if (!candidate.contestId || !candidate.name) {
        return json({ error: 'contestId e name obrigatorios para criar candidato.' }, 400);
      }
      if (candidate.odds !== undefined && !validOdds(candidate.odds)) {
        return json({ error: 'Odd fora da faixa permitida.' }, 400);
      }

      const { data, error } = await admin
        .from('election_candidates')
        .insert({
          contest_id: candidate.contestId,
          name: candidate.name.trim(),
          party: candidate.party?.trim() ?? null,
          odds: candidate.odds ?? 2,
          vote_intention: candidate.voteIntention ?? null,
          poll_source: candidate.pollSource?.trim() ?? null,
          poll_date: candidate.pollDate ?? null,
          sort_order: candidate.sortOrder ?? (await nextSortOrder(admin, candidate.contestId)),
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, candidate: data });
    }

    case 'delete_election_candidate': {
      const { candidateId } = payload;
      if (!candidateId) return json({ error: 'candidateId obrigatorio.' }, 400);

      const { error } = await admin.from('election_candidates').delete().eq('id', candidateId);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, candidateId });
    }

    case 'delete_election_contest': {
      const { contestId } = payload;
      if (!contestId) return json({ error: 'contestId obrigatorio.' }, 400);

      const { error } = await admin.from('election_contests').delete().eq('id', contestId);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, contestId });
    }

    /**
     * Liquidacao de aposta. A RPC e quem paga: debita o wallet, grava o ledger
     * e so aceita aposta ainda OPEN. VOID devolve a stake por conta propria e
     * LOST zera o retorno, entao os dois valem null aqui.
     */
    case 'settle_bet': {
      const { betId, result, amount } = payload;
      if (!betId) return json({ error: 'betId obrigatorio.' }, 400);
      if (result !== 'WON' && result !== 'LOST' && result !== 'VOID') {
        return json({ error: 'Resultado invalido: use WON, LOST ou VOID.' }, 400);
      }
      if (result === 'WON' && (typeof amount !== 'number' || amount <= 0)) {
        return json({ error: 'amount positivo obrigatorio para WON.' }, 400);
      }

      const { error } = await admin.rpc('settle_bet_atomic', {
        p_bet_id: betId,
        p_status: result,
        p_return: result === 'WON' ? amount : null,
        p_reviewer_id: reviewerId,
      });

      if (error) return json({ error: error.message }, 409);
      return json({ success: true, betId, result });
    }

    default:
      return json({ error: `Acao desconhecida: ${payload.action}` }, 400);
  }
});

async function nextSortOrder(
  admin: ReturnType<typeof createClient>,
  contestId: string
): Promise<number> {
  const { data } = await admin
    .from('election_candidates')
    .select('sort_order')
    .eq('contest_id', contestId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 1;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}