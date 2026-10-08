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
  sport: 'football' | 'basketball';
  slug: string;
  name: string;
  country: string;
}

const DEFAULT_LEAGUES: FeedLeague[] = [
  { sport: 'football', slug: 'bra.1', name: 'Brasileirao Serie A', country: 'Brasil' },
  { sport: 'football', slug: 'eng.1', name: 'Premier League', country: 'Inglaterra' },
  { sport: 'football', slug: 'esp.1', name: 'La Liga', country: 'Espanha' },
  { sport: 'football', slug: 'ita.1', name: 'Serie A Italiana', country: 'Italia' },
  { sport: 'basketball', slug: 'nba', name: 'NBA', country: 'Estados Unidos' },
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
      results.lastError = results.lastError
        ? `${results.lastError} | ${message}`
        : message;
    }
    // Evita rajada para o CDN da ESPN entre ligas.
    await new Promise((resolve) => setTimeout(resolve, 350));
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

// ---------------------------------------------------------------------------
// ESPN
// ---------------------------------------------------------------------------

const ESPN_HOST = 'https://site.api.espn.com/apis/site/v2/sports';

interface EspnEvent {
  id: string;
  date: string;
  name?: string;
  competitions: {
    competitors: {
      homeAway: 'home' | 'away';
      score: string;
      winner?: boolean | null;
      team: {
        id: string;
        displayName: string;
        shortDisplayName?: string;
        logo?: string;
        logos?: { href: string }[];
      };
    }[];
    status: {
      type: { state: string; detail?: string };
      displayClock?: string;
      period?: number;
    };
  }[];
}

async function fetchScoreboard(sport: string, slug: string): Promise<EspnEvent[]> {
  const espnSport = sport === 'football' ? 'soccer' : sport;
  // Ontem + hoje: o scoreboard do dia so mostra a partida enquanto ela existe
  // naquele dia — sem repetir ontem, um jogo encerrado nunca recebe o
  // resultado e fica preso para sempre em OPEN 0-0.
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const dates = [now - dayMs, now].map((t) =>
    new Date(t).toISOString().slice(0, 10).replace(/-/g, '')
  );

  const merged: EspnEvent[] = [];
  const seen = new Set<string>();
  for (const date of dates) {
    const events = await fetchScoreboardDay(espnSport, slug, date);
    for (const event of events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      merged.push(event);
    }
    // Evita rajada para o CDN da ESPN entre dias.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return merged;
}

async function fetchScoreboardDay(espnSport: string, slug: string, date: string): Promise<EspnEvent[]> {
  const url = `${ESPN_HOST}/${espnSport}/${encodeURIComponent(slug)}/scoreboard?dates=${date}`;

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

  const { data: matches, error } = await admin
    .from('matches')
    .select('id, external_id, league_id, home_team_id, away_team_id, status, kickoff_at, minute, home_score, away_score, margin')
    .in('external_id', externalIds);
  if (error) throw error;

  for (const m of matches ?? []) {
    if (m.external_id) map.set(m.external_id, { ...m, markets: [] });
  }

  const matchRows = matches ?? [];
  if (matchRows.length === 0) return map;
  const matchIds = matchRows.map((m: { id: string }) => m.id);

  const { data: markets, error: mErr } = await admin
    .from('match_markets')
    .select('id, match_id, name, category')
    .in('match_id', matchIds);
  if (mErr) throw mErr;

  const marketRows = markets ?? [];
  const marketIds = marketRows.map((m: { id: string }) => m.id);
  const choicesByMarket = new Map<string, Array<Record<string, unknown>>>();
  if (marketIds.length > 0) {
    const { data: choices, error: cErr } = await admin
      .from('market_choices')
      .select('id, market_id, label, odds, previous_odds, trend, is_suspended, sort_order')
      .in('market_id', marketIds);
    if (cErr) throw cErr;
    for (const c of choices ?? []) {
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
    map.set(key, { ...map.get(key), markets: marketsByMatch.get(m.id) ?? [] });
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
  team: EspnEvent['competitions'][number]['competitors'][number]['team'],
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
  const competition = event.competitions?.[0];
  const state = competition?.status?.type?.state ?? 'pre';
  const status = state === 'in' ? 'LIVE' : state === 'post' ? 'FINISHED' : 'OPEN';
  const minute = state === 'pre' ? 0 : computeMinute(sport, competition!);
  const homeScore = Number(competition?.competitors.find((c) => c.homeAway === 'home')?.score) || 0;
  const awayScore = Number(competition?.competitors.find((c) => c.homeAway === 'away')?.score) || 0;
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
  const competition = event.competitions?.[0];
  if (!competition) return 'skipped';

  const home = competition.competitors.find((c) => c.homeAway === 'home');
  const away = competition.competitors.find((c) => c.homeAway === 'away');
  if (!home || !away) return 'skipped';

  const state = competition.status?.type?.state ?? 'pre';
  if (!['pre', 'in', 'post'].includes(state)) return 'skipped';

  const leagueId = await syncLeague(admin, league, catalog.leagues);
  const homeTeam = await syncTeam(admin, home.team, catalog.teams);
  const awayTeam = await syncTeam(admin, away.team, catalog.teams);

  const matchId = await syncMatch(
    admin,
    league.sport,
    leagueId,
    homeTeam.id,
    awayTeam.id,
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
        homeName: home.team.shortDisplayName || home.team.displayName,
        awayName: away.team.shortDisplayName || away.team.displayName,
        odds: computeOdds(league.sport, state, computeMinute(league.sport, competition), Number(home.score) || 0, Number(away.score) || 0),
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
  competition: EspnEvent['competitions'][number]
): number {
  const state = competition.status?.type?.state;
  if (state === 'post') return sport === 'basketball' ? 48 : 90;

  const clock = competition.status?.displayClock ?? '';
  const period = competition.status?.period ?? 1;

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