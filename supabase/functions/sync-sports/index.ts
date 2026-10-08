/**
 * sync-sports — feed de partidas reais (ESPN).
 *
 * Busca os scoreboards publicos da ESPN (sem chave / sem CORS no servidor)
 * para as ligas configuradas, grava times, ligas, partidas e mercados no
 * Supabase com service_role e devolve quantas partidas sincronizou.
 *
 * A RLS so libera leitura do catalogo: quem escreve e esta funcao. As odds sao
 * calculadas aqui (modelo de probabilidade + margem da casa) e recriadas a cada
 * sync — o placar/relogio reais vêm da ESPN, o preco e da casa.
 *
 * Configuracoes:
 *   system_settings.sports_feed_config = JSON array de {
 *     sport, slug, name, country }
 *   (slug e o identificador da ESPN; ex.: "bra.1", "nba")
 *
 * Seguranca: exige sessao autenticada (qualquer usuario logado pode agendar as
 * atualizacoes do front; nao ha dado sensivel). Trava de 45s entre syncs.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface FeedLeague {
  sport: 'football' | 'basketball' | 'tennis' | 'volleyball' | 'mma';
  slug: string;
  name: string;
  country: string;
}

const DEFAULT_LEAGUES: FeedLeague[] = [
  { sport: 'football', slug: 'bra.1', name: 'Brasileirao Serie A', country: 'Brasil' },
  { sport: 'football', slug: 'eng.1', name: 'Premier League', country: 'Inglaterra' },
  { sport: 'football', slug: 'esp.1', name: 'La Liga', country: 'Espanha' },
  { sport: 'football', slug: 'ita.1', name: 'Serie A Italiana', country: 'Italia' },
  { sport: 'football', slug: 'ger.1', name: 'Bundesliga', country: 'Alemanha' },
  { sport: 'football', slug: 'fra.1', name: 'Ligue 1', country: 'Franca' },
  { sport: 'football', slug: 'por.1', name: 'Liga Portugal', country: 'Portugal' },
  { sport: 'football', slug: 'ned.1', name: 'Eredivisie', country: 'Holanda' },
  { sport: 'football', slug: 'uefa.champions', name: 'Champions League', country: 'Europa' },
  { sport: 'football', slug: 'uefa.europa', name: 'Europa League', country: 'Europa' },
  { sport: 'basketball', slug: 'nba', name: 'NBA', country: 'Estados Unidos' },
  { sport: 'tennis', slug: 'atp', name: 'ATP', country: 'Mundo' },
  { sport: 'tennis', slug: 'wta', name: 'WTA', country: 'Mundo' },
  { sport: 'mma', slug: 'ufc', name: 'UFC', country: 'Mundo' },
  { sport: 'mma', slug: 'bellator', name: 'Bellator', country: 'Mundo' },
  { sport: 'volleyball', slug: 'womens-college-volleyball', name: 'Volei Feminino NCAA', country: 'EUA' },
  { sport: 'volleyball', slug: 'mens-college-volleyball', name: 'Volei Masculino NCAA', country: 'EUA' },
];

const MIN_SYNC_INTERVAL_MS = 45_000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey =
    Deno.env.get('PRIMASBET_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    '';

  if (!serviceRoleKey) {
    return json({ error: 'Service role nao configurada.' }, 500);
  }

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

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: 'Sessao invalida.' }, 401);
  }

  // Trava de reentrancia POR TABELA (segura com transaction-pooling): um
  // advisory lock de sessao vazaria entre conexoes pooled do pool e o
  // pgBouncer reusa a conexao -> lock 'fantasma'. A versao em tabela expira
  // sozinha se a execucao morrer no meio do caminho.
  const { data: lockOk, error: lockError } = await admin.rpc('try_acquire_sync_lock2', {
    lock_key: 'sports_sync',
    timeout_secs: 180,
  });
  if (lockError) {
    return json({ error: 'Falha ao adquirir trava de sync.', detalhe: lockError.message }, 500);
  }
  if (lockOk !== true) {
    return json({
      locked: true,
      synced: 0,
      waitSeconds: 0,
      lastSync: null,
      lastError: 'Outro sync em andamento.',
    });
  }

  try {
    return await runSyncPass(admin);
  } finally {
    await admin
      .rpc('release_sync_lock2', { lock_key: 'sports_sync' })
      .then(() => undefined, () => undefined);
  }
});

async function runSyncPass(admin: ReturnType<typeof createClient>) {
  // Trava entre syncs: evita que o front dispare em rajada.
  const { data: lastRow } = await admin
    .from('system_settings')
    .select('value, updated_at')
    .eq('key', 'sports_last_sync')
    .maybeSingle();

  if (lastRow?.updated_at) {
    const elapsed = Date.now() - new Date(lastRow.updated_at).getTime();
    if (elapsed < MIN_SYNC_INTERVAL_MS) {
      return json({
        throttled: true,
        synced: 0,
        lastSync: lastRow.updated_at,
        waitSeconds: Math.ceil((MIN_SYNC_INTERVAL_MS - elapsed) / 1000),
      });
    }
  }

  // Configuracao das ligas (padrao se ausente).
  let leagues: FeedLeague[] = DEFAULT_LEAGUES;
  const { data: cfgRow } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'sports_feed_config')
    .maybeSingle();
  if (cfgRow?.value) {
    try {
      const parsed = JSON.parse(cfgRow.value) as FeedLeague[];
      if (Array.isArray(parsed) && parsed.length > 0) leagues = parsed;
    } catch {
      // config invalida: mantem o padrao
    }
  }

  const margin = await loadHouseMargin(admin);
  const catalog = await loadCatalog(admin);
  const results: { leagues: number; synced: number; errors: number; skipped: number; lastError?: string } = {
    leagues: leagues.length,
    synced: 0,
    errors: 0,
    skipped: 0,
  };

  for (const league of leagues) {
    try {
      const events = await fetchScoreboard(league.sport, league.slug);
      const existingMatches = await loadExistingMatches(
        admin,
        events.map((e) => e.id)
      );
      for (const event of events) {
        const written = await persistEvent(admin, league, event, margin, catalog, existingMatches);
        if (written === 'synced') results.synced++;
        else if (written === 'skipped') results.skipped++;
      }
    } catch (err) {
      results.errors++;
      let message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
      const details =
        err && typeof err === 'object' && 'details' in err && (err as { details: unknown }).details
          ? String((err as { details: unknown }).details)
          : '';
      const code =
        err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code
          ? String((err as { code: unknown }).code)
          : '';
      if (details) message = `${message} [detalhe: ${details}]`;
      if (code) message = `${message} [codigo: ${code}]`;
      message = `${league.sport}/${league.slug}: ${message}`;
      console.error(`sync falhou em ${league.sport}/${league.slug}:`, err);
      results.lastError = results.lastError
        ? `${results.lastError} | ${message}`
        : message;
    }
    // Evita rajada para o CDN da ESPN entre ligas.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  // Super Odd Turbinada: escolhe os alvos do dia, aplica o boost REAL na odd
  // (morada em market_choices) e grava a campanha para o front montar o banner.
  try {
    await refreshSuperOdd(admin);
  } catch (err) {
    console.error('super_odd refresh failed', err);
  }

  const nowIso = new Date().toISOString();
  const { error: upsertError } = await admin.from('system_settings').upsert(
    { key: 'sports_last_sync', value: nowIso, updated_at: nowIso },
    { onConflict: 'key' }
  );
  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  return json({
    throttled: false,
    ...results,
    timestamp: nowIso,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function loadHouseMargin(
  admin: ReturnType<typeof createClient>
): Promise<number> {
  const { data } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'house_margin')
    .maybeSingle();
  const parsed = Number(data?.value);
  if (Number.isFinite(parsed) && parsed > 1 && parsed < 2) return parsed;
  return 1.05;
}

/**
 * Super Odd Turbinada.
 *
 * Escolhe dois jogos de futebol abertos nas proximas 24h (prefere Flamengo e
 * Real Madrid), aplica um boost REAL de 1.25 na odd "Mais de X" de um dos
 * lados e grava a campanha em system_settings ('super_odd') para o banner do
 * front montar titulo e cotacoes.
 *
 * A odd turbinada mora em market_choices: boletim, place_bet_atomic e
 * liquidacao continuam lendo o preco do banco sem regra especial — o que a
 * tela promete e o que o banco paga. O diff normal do sync rebaixa a linha ao
 * valor justo a cada passada, entao reaplicar o boost aqui e idempotente
 * (a campanha anterior guarda a base para nao turbinar em dobro).
 */
async function refreshSuperOdd(
  admin: ReturnType<typeof createClient>
): Promise<boolean> {
  const BOOST = 1.25;
  const PREF = ['flamengo', 'real madrid'];
  const now = Date.now();

  const { data, error } = await admin
    .from('matches')
    .select(
      `
      id, kickoff_at,
      home:teams!matches_home_team_id_fkey ( name ),
      away:teams!matches_away_team_id_fkey ( name ),
      league:leagues ( sport ),
      match_markets ( id, category, market_choices ( id, label, odds ) )
    `
    )
    .eq('status', 'OPEN')
    .order('kickoff_at', { ascending: true })
    .limit(80);
  if (error) throw error;

  interface PromoRow {
    id: string;
    kickoff_at: string;
    home: { name: string } | null;
    away: { name: string } | null;
    league: { sport: string } | null;
    match_markets: Array<{
      id: string;
      category: string;
      market_choices: Array<{ id: string; label: string; odds: number | string }>;
    }>;
  }

  const overOf = (row: PromoRow) => {
    const goals = row.match_markets.find((mk) => mk.category === 'goals');
    const choice = goals?.market_choices.find((c) => c.label.startsWith('Mais de'));
    return goals && choice ? { goals, choice } : null;
  };

  const rows = (data ?? []) as unknown as PromoRow[];
  const cands = rows.filter((row) => {
    const kickoff = Date.parse(row.kickoff_at);
    return (
      row.league?.sport === 'football' &&
      Number.isFinite(kickoff) &&
      kickoff > now &&
      kickoff < now + 24 * 3_600_000 &&
      Boolean(overOf(row))
    );
  });

  const names = (row: PromoRow) =>
    `${row.home?.name ?? ''} ${row.away?.name ?? ''}`.toLowerCase();
  const preferred = cands.filter((row) => PREF.some((p) => names(row).includes(p)));
  const targets = [
    ...preferred,
    ...cands.filter((row) => !preferred.includes(row)),
  ].slice(0, 2);

  const upsertCampaign = (payload: Record<string, unknown>) =>
    admin
      .from('system_settings')
      .upsert(
        {
          key: 'super_odd',
          value: JSON.stringify(payload),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

  if (targets.length < 2) {
    const { error: upd } = await upsertCampaign({ enabled: false });
    if (upd) throw upd;
    return false;
  }

  let previous: { boosted_choice_id?: string; boosted_base?: number } = {};
  const { data: prevRow } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'super_odd')
    .maybeSingle();
  if (prevRow?.value) {
    try {
      previous = JSON.parse(prevRow.value) as typeof previous;
    } catch {
      // campanha corrompida: trata como inexistente
    }
  }

  const legA = overOf(targets[0]);
  const legB = overOf(targets[1]);
  if (!legA || !legB) return false;

  const current = Number(legA.choice.odds);
  // Se a linha atual ainda e a turbinada da passada anterior, a base e a
  // registrada; senao o diff ja devolveu o justo e a base e o valor atual.
  let base = current;
  if (previous.boosted_choice_id === legA.choice.id && previous.boosted_base) {
    const expected = Math.max(1.01, round2(previous.boosted_base * BOOST));
    if (Math.abs(current - expected) < 0.02) base = previous.boosted_base;
  }
  const boosted = Math.max(1.01, round2(base * BOOST));

  if (Math.abs(current - boosted) > 0.001) {
    const { error: upd } = await admin
      .from('market_choices')
      .update({
        odds: boosted,
        previous_odds: current,
        trend: boosted > current ? 'up' : 'down',
      })
      .eq('id', legA.choice.id);
    if (upd) throw upd;
  }

  const { error: upd } = await upsertCampaign({
    enabled: true,
    match_ids: [targets[0].id, targets[1].id],
    choice_ids: [legA.choice.id, legB.choice.id],
    boosted_choice_id: legA.choice.id,
    boosted_base: base,
    base_total: round2(base * Number(legB.choice.odds)),
    boosted_total: round2(boosted * Number(legB.choice.odds)),
    updated_at: new Date().toISOString(),
  });
  if (upd) throw upd;
  return true;
}

// ---------------------------------------------------------------------------
// ESPN
// ---------------------------------------------------------------------------

const ESPN_HOST = 'https://site.api.espn.com/apis/site/v2/sports';

// Janela do feed: de ontem (liquidacao de encerrados) ate FIXTURE_DAYS_AHEAD
// dias de fixtures. Um unico ponto de definicao para fetch e persistencia.
const FIXTURE_DAYS_AHEAD = 10;
// Limite pedido a ESPN por request; a resposta ordenada do inicio do mes e
// cortada aqui — detectado pelo tamanho para acionar o fallback dia-a-dia.
const SCOREBOARD_LIMIT = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface EspnTeam {
  id: string;
  displayName: string;
  shortDisplayName?: string;
  logo?: string;
  logos?: { href: string }[];
}

interface EspnCompetitor {
  homeAway?: 'home' | 'away';
  score?: string;
  winner?: boolean | null;
  team?: EspnTeam;
  // Tenis/MMA: a ESPN entrega atleta no lugar de clube (sem team).
  athlete?: {
    id?: string;
    guid?: string;
    displayName: string;
    shortName?: string;
    flag?: { href?: string };
  };
  linescores?: { value?: number; winner?: boolean }[];
}

interface EspnCompetition {
  competitors?: EspnCompetitor[];
  status?: {
    type: { state?: string; detail?: string };
    displayClock?: string;
    period?: number;
  };
}

interface EspnEvent {
  id: string;
  date: string;
  name?: string;
  competitions?: EspnCompetition[];
  // Tenis agrupa a partida em groupings[].competitions[] (nunca no evento).
  groupings?: Array<{ competitions?: EspnCompetition[] }>;
}

/**
 * Partida do evento: futebol/basquete/volei colocam competitions direto no
 * evento; tenis usa groupings[].competitions[]. A funcao resolve os dois.
 */
function competitionOf(event: EspnEvent): EspnCompetition | undefined {
  if (event.competitions?.length) return event.competitions[0];
  for (const grouping of event.groupings ?? []) {
    if (grouping.competitions?.length) return grouping.competitions[0];
  }
  return undefined;
}

/**
 * Casa/fora: a ESPN omite homeAway em alguns esportes (MMA) — ai a ordem dos
 * competidores decide (o primeiro e a casa).
 */
function sides(competition: EspnCompetition): { home?: EspnCompetitor; away?: EspnCompetitor } {
  const list = competition.competitors ?? [];
  let home = list.find((c) => c.homeAway === 'home');
  let away = list.find((c) => c.homeAway === 'away');
  if ((!home || !away) && list.length >= 2) {
    home = list[0];
    away = list[1];
  }
  return { home, away };
}

/**
 * Placeholder da ESPN: torneio sem chaveamento (tenis "TBD x TBD") ou jogo
 * de mata-mata com chave ainda nao sorteada. Nao e partida — descarta.
 */
const PLACEHOLDER_TEAM = /^(TBD|TBA|To Be Determined)$/i;

/**
 * Time do competidor: tenis entrega atleta (nome + bandeira) no lugar do clube —
 * sintetiza um "time" para o catalogo, com chave prefixada para nao colidir com
 * ids de clubes de outros esportes.
 */
function teamOf(competitor: EspnCompetitor): EspnTeam | undefined {
  if (competitor.team) return competitor.team;
  const athlete = competitor.athlete;
  if (!athlete?.displayName || PLACEHOLDER_TEAM.test(athlete.displayName.trim())) {
    return undefined;
  }
  return {
    id: `athlete-${athlete.guid ?? athlete.id ?? athlete.displayName}`,
    displayName: athlete.displayName,
    shortDisplayName: athlete.shortName,
    logos: athlete.flag?.href ? [{ href: athlete.flag.href }] : undefined,
  };
}

/**
 * Placar do competidor: pontuacao direta quando existe; em tenis o `score`
 * vem vazio e o placar da partida sao sets vencidos (linescores com winner).
 */
function scoreOf(competitor?: EspnCompetitor): number {
  if (!competitor) return 0;
  const direct = Number(competitor.score);
  if (competitor.score != null && competitor.score !== '' && Number.isFinite(direct)) {
    return direct;
  }
  if (competitor.linescores?.length) {
    return competitor.linescores.filter((l) => l.winner).length;
  }
  return 0;
}

/**
 * Inicio de ontem em UTC: janela minima do feed (fetch busca ontem+hoje).
 * A ESPN ignora `dates` em alguns esportes (tenis devolve partidas antigas ja
 * finalizadas) — fora da janela o evento e descartado antes de persistir.
 */
function startOfYesterdayMs(): number {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

async function fetchScoreboard(sport: string, slug: string): Promise<EspnEvent[]> {
  const espnSport = sport === 'football' ? 'soccer' : sport;
  // A ESPN so aceita `dates=YYYYMMDD` (dia) ou `YYYYMM` (mes) — range nao
  // existe. O mes inteiro em um request cobre ontem (liquidacao de jogos
  // encerrados), hoje e o horizonte de fixtures, com metade dos requests da
  // versao dia-a-dia. A janela de persistencia (persistEvent) corta o resto.
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const months = [
    ...new Set(
      [now - dayMs, now, now + FIXTURE_DAYS_AHEAD * dayMs].map((t) =>
        new Date(t).toISOString().slice(0, 7).replace('-', '')
      )
    ),
  ];

  const merged: EspnEvent[] = [];
  const seen = new Set<string>();
  const addAll = (events: EspnEvent[]) => {
    for (const event of events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      merged.push(event);
    }
  };

  let capped = false;
  for (const month of months) {
    const events = await fetchScoreboardDay(espnSport, slug, month);
    addAll(events);
    // ESPN ordena do inicio do mes e corta em SCOREBOARD_LIMIT: ligas densas
    // (Volei NCAA, ~44 jogos/dia) devolvem so comeco de mes — tudo fora da
    // janela — e os fixtures reais ficam cortados. Detectou o corte, refaz
    // dia a dia nos dias da janela (12 requests, dedupe por id).
    if (events.length >= SCOREBOARD_LIMIT) {
      capped = true;
      break;
    }
    if (months.length > 1) await sleep(350);
  }

  if (capped) {
    console.log(`scoreboard ${slug}: limite de ${SCOREBOARD_LIMIT} atingido, fallback dia-a-dia`);
    merged.length = 0;
    seen.clear();
    for (let i = -1; i <= FIXTURE_DAYS_AHEAD; i++) {
      const day = new Date(now + i * dayMs).toISOString().slice(0, 10).replace(/-/g, '');
      addAll(await fetchScoreboardDay(espnSport, slug, day));
      await sleep(200);
    }
  }

  return merged;
}

async function fetchScoreboardDay(espnSport: string, slug: string, dates: string): Promise<EspnEvent[]> {
  const url = `${ESPN_HOST}/${espnSport}/${encodeURIComponent(slug)}/scoreboard?dates=${dates}&limit=${SCOREBOARD_LIMIT}`;

  // ESPN devolve 403 para o User-Agent padrao do Deno; um User-Agent de
  // navegador passa. Sem chave, sem cookie — so o feed publico.
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'application/json',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    // Uma repeticao por erro transiente (throttle do CDN da ESPN).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { signal: controller.signal, headers });
        if (!res.ok) {
          if (attempt === 0 && (res.status === 400 || res.status === 403 || res.status === 429)) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          const snippet =
            res.status === 400 || res.status === 403 || res.status === 429
              ? await res.text().catch(() => '').then((t) => t.slice(0, 160))
              : '';
          throw new Error(`HTTP ${res.status} em ${slug}${snippet ? `: ${snippet}` : ''}`);
        }
        const payload = (await res.json()) as { events?: EspnEvent[] };
        return payload.events ?? [];
      } catch (err) {
        if (attempt === 0 && err instanceof Error && (err.name === 'AbortError' || /fetch/i.test(err.message))) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          continue;
        }
        throw err;
      }
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Persistencia (diff: so grava o que mudou)
// ---------------------------------------------------------------------------

interface TeamRef {
  id: string;
}

type Catalog = {
  leagues: Map<string, Record<string, unknown>>;
  teams: Map<string, Record<string, unknown>>;
};

/** Pre-carrega ligas/times do banco uma vez por passada (cache em memoria). */
async function loadCatalog(admin: ReturnType<typeof createClient>): Promise<Catalog> {
  const [leaguesRes, teamsRes] = await Promise.all([
    admin.from('leagues').select('id, external_key, name, country, sport'),
    admin.from('teams').select('id, external_key, name, short_name, logo_url'),
  ]);
  if (leaguesRes.error) throw leaguesRes.error;
  if (teamsRes.error) throw teamsRes.error;

  const leagues = new Map<string, Record<string, unknown>>();
  for (const r of leaguesRes.data ?? []) {
    if (r.external_key) leagues.set(r.external_key, r);
  }
  const teams = new Map<string, Record<string, unknown>>();
  for (const r of teamsRes.data ?? []) {
    if (r.external_key) teams.set(r.external_key, r);
  }
  return { leagues, teams };
}

/** Liga, partidas (com mercados/labels ja resolvidos) das event ids desta passada. */
async function loadExistingMatches(
  admin: ReturnType<typeof createClient>,
  externalIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (externalIds.length === 0) return map;

  // A PostgREST monta ?in.(...) na query string: passar de ~500 ids estoura
  // o limite de URI do fetch ("URI too long"). O volei NCAA chega a ~530
  // jogos na janela, entao cada select e fatiado em pedacos de 150.
  const CHUNK = 150;
  const chunks = (ids: string[]): string[][] => {
    const out: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK));
    return out;
  };

  const matchRows: Array<Record<string, unknown>> = [];
  for (const chunk of chunks(externalIds)) {
    const { data, error } = await admin
      .from('matches')
      .select('id, external_id, league_id, home_team_id, away_team_id, status, kickoff_at, minute, home_score, away_score, margin')
      .in('external_id', chunk);
    if (error) throw error;
    matchRows.push(...(data ?? []));
  }

  for (const m of matchRows) {
    if (m.external_id) map.set(String(m.external_id), { ...m, markets: [] });
  }
  if (matchRows.length === 0) return map;

  const matchIds = matchRows.map((m) => String(m.id));
  const marketRows: Array<Record<string, unknown>> = [];
  for (const chunk of chunks(matchIds)) {
    const { data, error } = await admin
      .from('match_markets')
      .select('id, match_id, name, category')
      .in('match_id', chunk);
    if (error) throw error;
    marketRows.push(...(data ?? []));
  }

  const marketIds = marketRows.map((m) => String(m.id));
  const choicesByMarket = new Map<string, Array<Record<string, unknown>>>();
  for (const chunk of chunks(marketIds)) {
    const { data, error } = await admin
      .from('market_choices')
      .select('id, market_id, label, odds, previous_odds, trend, is_suspended, sort_order')
      .in('market_id', chunk);
    if (error) throw error;
    for (const c of data ?? []) {
      const arr = choicesByMarket.get(c.market_id) ?? [];
      arr.push(c);
      choicesByMarket.set(c.market_id, arr);
    }
  }

  const marketsByMatch = new Map<string, Array<Record<string, unknown>>>();
  for (const m of marketRows) {
    const arr = marketsByMatch.get(m.match_id) ?? [];
    arr.push({ ...m, market_choices: choicesByMarket.get(m.id) ?? [] });
    marketsByMatch.set(m.match_id, arr);
  }
  for (const m of matchRows) {
    const key = m.external_id;
    if (!key) continue;
    map.set(String(key), { ...map.get(String(key)), markets: marketsByMatch.get(String(m.id)) ?? [] });
  }
  return map;
}

async function syncLeague(
  admin: ReturnType<typeof createClient>,
  league: FeedLeague,
  leagueMap: Map<string, Record<string, unknown>>
): Promise<string> {
  const existing = leagueMap.get(league.slug);
  if (
    existing &&
    existing.name === league.name &&
    existing.country === league.country &&
    existing.sport === league.sport
  ) {
    return existing.id as string;
  }

  const upsert = await admin
    .from('leagues')
    .upsert(
      {
        external_key: league.slug,
        name: league.name,
        country: league.country,
        sport: league.sport,
      },
      { onConflict: 'external_key', ignoreDuplicates: false }
    )
    .select('id, external_key, name, country, sport')
    .maybeSingle();
  if (upsert.error) throw upsert.error;
  leagueMap.set(league.slug, upsert.data as Record<string, unknown>);
  return upsert.data?.id as string;
}

async function syncTeam(
  admin: ReturnType<typeof createClient>,
  team: EspnTeam,
  teamMap: Map<string, Record<string, unknown>>
): Promise<TeamRef> {
  const externalKey = String(team.id);
  const logo =
    team.logos?.[0]?.href ??
    team.logo ??
    null;
  const name = team.displayName;
  const short = team.shortDisplayName ?? team.displayName;

  const existing = teamMap.get(externalKey);
  if (
    existing &&
    existing.name === name &&
    (existing.short_name ?? existing.name) === short &&
    (existing.logo_url ?? null) === (logo ?? null)
  ) {
    return { id: existing.id as string };
  }

  const upsert = await admin
    .from('teams')
    .upsert(
      {
        external_key: externalKey,
        name,
        short_name: short,
        logo_url: logo,
      },
      { onConflict: 'external_key', ignoreDuplicates: false }
    )
    .select('id, external_key, name, short_name, logo_url')
    .maybeSingle();
  if (upsert.error) throw upsert.error;
  teamMap.set(externalKey, upsert.data as Record<string, unknown>);
  return { id: upsert.data?.id as string };
}

async function syncMatch(
  admin: ReturnType<typeof createClient>,
  sport: string,
  leagueId: string,
  homeTeamId: string,
  awayTeamId: string,
  event: EspnEvent,
  margin: number,
  existingMatches: Map<string, Record<string, unknown>>
): Promise<string> {
  const competition = competitionOf(event);
  const state = competition?.status?.type?.state ?? 'pre';
  const status = state === 'in' ? 'LIVE' : state === 'post' ? 'FINISHED' : 'OPEN';
  const minute = state === 'pre' ? 0 : computeMinute(sport, competition);
  const { home, away } = competition ? sides(competition) : {};
  const homeScore = scoreOf(home);
  const awayScore = scoreOf(away);
  const kickoffMs = Date.parse(event.date);
  const kickoffAt = new Date(kickoffMs).toISOString();

  const existing = existingMatches.get(event.id);
  if (
    existing &&
    existing.league_id === leagueId &&
    existing.home_team_id === homeTeamId &&
    existing.away_team_id === awayTeamId &&
    existing.status === status &&
    Math.abs(Date.parse(existing.kickoff_at as string) - kickoffMs) < 60_000 &&
    Number(existing.minute ?? 0) === minute &&
    Number(existing.home_score ?? 0) === homeScore &&
    Number(existing.away_score ?? 0) === awayScore &&
    Number(existing.margin ?? 0) === margin
  ) {
    return existing.id as string;
  }

  const upsert = await admin
    .from('matches')
    .upsert(
      {
        external_id: event.id,
        league_id: leagueId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        status,
        kickoff_at: kickoffAt,
        minute,
        home_score: homeScore,
        away_score: awayScore,
        margin,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'external_id', ignoreDuplicates: false }
    )
    .select('id, external_id, league_id, home_team_id, away_team_id, status, kickoff_at, minute, home_score, away_score, margin')
    .maybeSingle();
  if (upsert.error) throw upsert.error;

  const next = {
    ...(upsert.data as Record<string, unknown>),
    markets: (existing as Record<string, unknown> | undefined)?.markets ?? [],
  };
  existingMatches.set(event.id, next);
  return upsert.data?.id as string;
}

async function persistEvent(
  admin: ReturnType<typeof createClient>,
  league: FeedLeague,
  event: EspnEvent,
  margin: number,
  catalog: Catalog,
  existingMatches: Map<string, Record<string, unknown>>
): Promise<'synced' | 'skipped'> {
  const competition = competitionOf(event);
  if (!competition) return 'skipped';

  const { home, away } = sides(competition);
  if (!home || !away) return 'skipped';

  const homeTeam = teamOf(home);
  const awayTeam = teamOf(away);
  if (!homeTeam || !awayTeam) return 'skipped';
  // Mata-mata com chave nao sorteada chega como clube "TBD" (duas chaves
  // distintas nao colidem na constraint, mas virariam "TBD x TBD" no boletim).
  if (
    PLACEHOLDER_TEAM.test(homeTeam.displayName.trim()) ||
    PLACEHOLDER_TEAM.test(awayTeam.displayName.trim())
  ) {
    return 'skipped';
  }

  const state = competition.status?.type?.state ?? 'pre';
  if (!['pre', 'in', 'post'].includes(state)) return 'skipped';

  // Janela de persistencia: de ontem (liquidacao de encerrados) ate 10 dias
  // a frente (fixtures — a Europa League comeca no dia 16 e um horizonte de
  // 7d curto demais a deixava de fora ate o dia 15). A busca e por mes, mas
  // o mes cheio nao entra: a ESPN ignora `dates` em alguns esportes (tenis
  // devolve partidas antigas ja finalizadas) e jogo velho nunca sai de OPEN
  // no front — descarta aqui.
  const kickoffMs = Date.parse(event.date);
  if (
    !Number.isFinite(kickoffMs) ||
    kickoffMs < startOfYesterdayMs() ||
    kickoffMs > Date.now() + FIXTURE_DAYS_AHEAD * 24 * 3_600_000
  ) {
    return 'skipped';
  }

  const leagueId = await syncLeague(admin, league, catalog.leagues);
  const homeTeamRef = await syncTeam(admin, homeTeam, catalog.teams);
  const awayTeamRef = await syncTeam(admin, awayTeam, catalog.teams);

  const matchId = await syncMatch(
    admin,
    league.sport,
    leagueId,
    homeTeamRef.id,
    awayTeamRef.id,
    event,
    margin,
    existingMatches
  );

  // Mercados por diff. Falha aqui NAO pode abortar a partida nem os demais
  // eventos da liga: a partida ja esta com placar/status corretos e a
  // proxima passada tenta o preco de novo. O erro vai para o log.
  try {
    await syncMarkets(
      admin,
      matchId,
      league.sport,
      margin,
      {
        homeName: homeTeam.shortDisplayName || homeTeam.displayName,
        awayName: awayTeam.shortDisplayName || awayTeam.displayName,
        odds: computeOdds(league.sport, state, computeMinute(league.sport, competition), scoreOf(home), scoreOf(away)),
      },
      existingMatches.get(event.id)
    );
  } catch (err) {
    console.error(`syncMarkets falhou em ${matchId} (${league.slug}):`, err);
  }

  return 'synced';
}

// ---------------------------------------------------------------------------
// Odds (modelo da casa — justo e consistente com colocacao/relogio reais)
// ---------------------------------------------------------------------------

type Probs = {
  home: number;
  draw: number | null;
  away: number;
  over: number;
  line: number;
};

function computeOdds(
  sport: string,
  state: string,
  minute: number,
  homeScore: number,
  awayScore: number
): Probs {
  const live = state === 'in';
  const diff = homeScore - awayScore;

  if (sport === 'basketball') {
    const t = live ? clamp(minute / 48, 0, 1) : 0;
    const pHome = live
      ? clamp(0.5 + diff * 0.14 * t, 0.01, 0.99)
      : 0.56;
    const line = 225.5;
    const predicted = (homeScore + awayScore) + (48 - minute) * 2.2;
    const pOver = live
      ? clamp(0.5 + (predicted - line) * 0.02, 0.05, 0.95)
      : 0.52;
    return {
      home: pHome,
      draw: null,
      away: 1 - pHome,
      over: pOver,
      line,
    };
  }

  // Duelo (tenis, MMA, volei): dois lados, sem empate e sem total. O placar
  // de sets/jogos desloca a probabilidade; pre-jogo e 50/50.
  if (sport !== 'football') {
    const pHome = clamp(0.5 + (live ? diff * 0.12 : 0), 0.05, 0.95);
    return { home: pHome, draw: null, away: 1 - pHome, over: 0.5, line: 0 };
  }

  // Futebol: 1X2 com deslocamento logistico da colocacao ao longo do jogo.
  const t = live ? clamp(minute / 90, 0, 1) : 0;
  const s = clamp(diff / 3, -1, 1) * t;

  let pHome = 0.45 + 0.55 * s;
  let pDraw = 0.28 - 0.14 * Math.abs(s);
  let pAway = 0.27 - 0.55 * s;

  if (pAway < 0.02) pAway = 0.02;
  if (pHome < 0.02) pHome = 0.02;
  const sum = pHome + pDraw + pAway;
  pHome /= sum;
  pDraw /= sum;
  pAway /= sum;

  // Over/under 2.5: nivel esperado reage aos gols e ao tempo restante.
  const expectedTotal = (homeScore + awayScore) + 2.7 * (1 - t);
  const pOver = clamp(0.5 + (expectedTotal - 2.5) * 0.22, 0.05, 0.95);

  return { home: pHome, draw: pDraw, away: pAway, over: pOver, line: 2.5 };
}

interface MarketOdds {
  homeName: string;
  awayName: string;
  odds: Probs;
}

interface DesiredChoice {
  label: string;
  odds: number;
  sort_order: number;
}

interface DesiredMarket {
  name: string;
  category: string;
  choices: DesiredChoice[];
}

function buildMarkets(
  sport: string,
  margin: number,
  market: MarketOdds
): DesiredMarket[] {
  const { odds } = market;
  const m = margin;
  const withSort = (arr: Array<[string, number]>): DesiredChoice[] =>
    arr.map(([label, odd], i) => ({ label, odds: odd, sort_order: i }));

  if (sport === 'basketball') {
    return [
      {
        name: 'Vencedor do Jogo (Inc. Prorrogacao)',
        category: 'main',
        choices: withSort([
          [market.homeName, fairToOdd(odds.home, m)],
          [market.awayName, fairToOdd(odds.away, m)],
        ]),
      },
      {
        name: `Total de Pontos (Mais/Menos ${odds.line.toFixed(0)})`,
        category: 'goals',
        choices: withSort([
          [`Mais de ${odds.line.toFixed(0)}`, fairToOdd(odds.over, m)],
          [`Menos de ${odds.line.toFixed(0)}`, fairToOdd(1 - odds.over, m)],
        ]),
      },
    ];
  }

  if (sport !== 'football') {
    return [
      {
        name: 'Vencedor da Partida',
        category: 'main',
        choices: withSort([
          [market.homeName, fairToOdd(odds.home, m)],
          [market.awayName, fairToOdd(odds.away, m)],
        ]),
      },
    ];
  }

  return [
    {
      name: 'Resultado Final (1X2)',
      category: 'main',
      choices: withSort([
        [market.homeName, fairToOdd(odds.home, m)],
        ['Empate', fairToOdd(odds.draw ?? 0.25, m)],
        [market.awayName, fairToOdd(odds.away, m)],
      ]),
    },
    {
      name: 'Dupla Chance',
      category: 'main',
      choices: withSort([
        [`${market.homeName} ou Empate`, fairToOdd((odds.home ?? 0) + (odds.draw ?? 0), m)],
        [`${market.homeName} ou ${market.awayName}`, fairToOdd((odds.home ?? 0) + (odds.away ?? 0), m)],
        [`Empate ou ${market.awayName}`, fairToOdd((odds.draw ?? 0) + (odds.away ?? 0), m)],
      ]),
    },
    {
      name: 'Total de Gols (Mais/Menos 2.5)',
      category: 'goals',
      choices: withSort([
        ['Mais de 2.5 Gols', fairToOdd(odds.over, m)],
        ['Menos de 2.5 Gols', fairToOdd(1 - odds.over, m)],
      ]),
    },
  ];
}

/**
 * Atualiza mercados por diff: so grava quando existiu mudanca real (mercado novo,
 * category alterada, choice novo, label removido ou odd alterada). Nao recria as
 * linhas a cada sync — preserva previous_odds/trend e elimina a amplificacao de
 * escrita (antes eram ~300 inserts/deletes por passada para ~20 linhas vivas).
 */
async function syncMarkets(
  admin: ReturnType<typeof createClient>,
  matchId: string,
  sport: string,
  margin: number,
  market: MarketOdds,
  existingMatchRow: Record<string, unknown> | undefined
): Promise<void> {
  const desired = buildMarkets(sport, margin, market);
  const existingRows = (Array.isArray(existingMatchRow?.markets)
    ? existingMatchRow.markets
    : []) as Array<Record<string, unknown> & { market_choices?: Array<Record<string, unknown>> }>;
  const existingByName = new Map(existingRows.map((em) => [em.name, em]));
  const desiredByName = new Map(desired.map((dm) => [dm.name, dm]));

  for (const dm of desired) {
    const em = existingByName.get(dm.name);
    if (!em) {
      const inserted = await admin
        .from('match_markets')
        .insert({ match_id: matchId, name: dm.name, category: dm.category })
        .select('id')
        .single();
      if (inserted.error) throw inserted.error;
      await syncChoices(admin, inserted.data?.id as string, [], dm.choices);
      continue;
    }

    if (em.category !== dm.category) {
      const upd = await admin
        .from('match_markets')
        .update({ category: dm.category })
        .eq('id', em.id as string)
        .select('id')
        .single();
      if (upd.error) throw upd.error;
    }
    await syncChoices(admin, em.id as string, em.market_choices ?? [], dm.choices);
  }

  // Mercados que nao existem mais (raros): apaga (choices caem em cascata).
  for (const em of existingRows) {
    if (!desiredByName.has(em.name as string)) {
      const del = await admin.from('match_markets').delete().eq('id', em.id as string);
      if (del.error) throw del.error;
    }
  }
}

async function syncChoices(
  admin: ReturnType<typeof createClient>,
  marketId: string,
  existingChoices: Array<Record<string, unknown>>,
  desiredChoices: DesiredChoice[]
): Promise<void> {
  const desiredMap = new Map(desiredChoices.map((dc) => [dc.label, dc]));

  for (const ec of existingChoices) {
    if (!desiredMap.has(ec.label as string)) {
      const del = await admin.from('market_choices').delete().eq('id', ec.id as string);
      if (del.error) throw del.error;
    }
  }

  for (const dc of desiredChoices) {
    const ec = existingChoices.find((c) => c.label === dc.label);
    if (!ec) {
      const ins = await admin.from('market_choices').insert({
        market_id: marketId,
        label: dc.label,
        odds: dc.odds,
        previous_odds: null,
        trend: 'stable',
        is_suspended: false,
        sort_order: dc.sort_order,
      });
      if (ins.error) throw ins.error;
      continue;
    }

    const oldOdd = Number(ec.odds);
    if (Math.abs(oldOdd - dc.odds) > 0.001) {
      const upd = await admin
        .from('market_choices')
        .update({
          odds: dc.odds,
          previous_odds: oldOdd,
          trend: dc.odds > oldOdd ? 'up' : 'down',
        })
        .eq('id', ec.id as string);
      if (upd.error) throw upd.error;
    }
  }
}

/** Garante que a soma das inversas = margem da casa (overround). */
function fairToOdd(fairProbability: number, margin: number): number {
  const p = clamp(fairProbability, 0.02, 0.98);
  // Piso 1.01: market_choices exige odds > 1 com 2 casas. Em mercados
  // quase certos a razao justa com margem cai para 1.00 ou menos (ex.:
  // 'Mais de 2.5' num jogo ja com 3 gols) e o CHECK derrubava o upsert —
  // que, por ser por partida, travava o sync inteiro da liga.
  return Math.max(1.01, round2((1 / p) / margin));
}

function computeMinute(
  sport: string,
  competition?: EspnCompetition
): number {
  const state = competition?.status?.type?.state;
  if (state === 'post') return sport === 'basketball' ? 48 : 90;

  const clock = competition?.status?.displayClock ?? '';
  const period = competition?.status?.period ?? 1;

  if (sport === 'basketball') {
    const raw = clock.split(':')[0];
    const remaining = Number(raw) || 12;
    return Math.max(0, (period - 1) * 12 + (12 - remaining));
  }

  const parsed = Number(clock.replace(/[^\d]/g, ''));
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 120) return parsed;
  return period >= 2 ? 60 : 25;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}