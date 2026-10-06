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
  const results: { leagues: number; synced: number; errors: number; skipped: number; lastError?: string } = {
    leagues: leagues.length,
    synced: 0,
    errors: 0,
    skipped: 0,
  };

  for (const league of leagues) {
    try {
      const events = await fetchScoreboard(league.sport, league.slug);
      for (const event of events) {
        const written = await persistEvent(admin, league, event, margin);
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
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const url = `${ESPN_HOST}/${sport}/${encodeURIComponent(slug)}/scoreboard?dates=${today}`;

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
// Persistencia
// ---------------------------------------------------------------------------

async function persistEvent(
  admin: ReturnType<typeof createClient>,
  league: FeedLeague,
  event: EspnEvent,
  margin: number
): Promise<'synced' | 'skipped'> {
  const competition = event.competitions?.[0];
  if (!competition) return 'skipped';

  const home = competition.competitors.find((c) => c.homeAway === 'home');
  const away = competition.competitors.find((c) => c.homeAway === 'away');
  if (!home || !away) return 'skipped';

  const state = competition.status?.type?.state ?? 'pre'; // pre | in | post
  if (!['pre', 'in', 'post'].includes(state)) return 'skipped';

  const status = state === 'in' ? 'LIVE' : state === 'post' ? 'FINISHED' : 'OPEN';

  const leagueUpsert = await admin
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
    .select('id')
    .maybeSingle();

  if (leagueUpsert.error) throw leagueUpsert.error;
  const leagueId = leagueUpsert.data?.id as string;

  const homeTeam = await upsertTeam(admin, home.team);
  const awayTeam = await upsertTeam(admin, away.team);

  const kickoffAt = new Date(event.date).toISOString();
  const minute = computeMinute(league.sport, competition);
  const homeScore = Number(home.score) || 0;
  const awayScore = Number(away.score) || 0;

  const matchUpsert = await admin
    .from('matches')
    .upsert(
      {
        external_id: event.id,
        league_id: leagueId,
        home_team_id: homeTeam.id,
        away_team_id: awayTeam.id,
        status,
        kickoff_at: kickoffAt,
        minute: state === 'pre' ? 0 : minute,
        home_score: homeScore,
        away_score: awayScore,
        margin,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'external_id', ignoreDuplicates: false }
    )
    .select('id')
    .maybeSingle();

  if (matchUpsert.error) throw matchUpsert.error;
  const matchId = matchUpsert.data?.id as string;

  // Mercados recriados a cada sync: placar/relogio reais, preco da casa.
  await replaceMarkets(admin, matchId, league.sport, margin, {
    homeName: home.team.shortDisplayName || home.team.displayName,
    awayName: away.team.shortDisplayName || away.team.displayName,
    odds: computeOdds(league.sport, state, minute, homeScore, awayScore),
  });

  return 'synced';
}

interface TeamRef {
  id: string;
}

async function upsertTeam(
  admin: ReturnType<typeof createClient>,
  team: EspnEvent['competitions'][number]['competitors'][number]['team']
): Promise<TeamRef> {
  const logo =
    team.logos?.[0]?.href ??
    team.logo ??
    null;

  const upsert = await admin
    .from('teams')
    .upsert(
      {
        external_key: team.id,
        name: team.displayName,
        short_name: team.shortDisplayName ?? team.displayName,
        logo_url: logo,
      },
      { onConflict: 'external_key', ignoreDuplicates: false }
    )
    .select('id')
    .maybeSingle();

  if (upsert.error) throw upsert.error;
  return { id: upsert.data?.id as string };
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

async function replaceMarkets(
  admin: ReturnType<typeof createClient>,
  matchId: string,
  sport: string,
  margin: number,
  market: MarketOdds
): Promise<void> {
  const { error: clearError } = await admin
    .from('match_markets')
    .delete()
    .eq('match_id', matchId);
  if (clearError) throw clearError;

  const { odds } = market;
  const m = margin;

  const rows: Array<{ name: string; category: string; choices: Array<[string, number]> }> =
    sport === 'basketball'
      ? [
          {
            name: 'Vencedor do Jogo (Inc. Prorrogacao)',
            category: 'main',
            choices: [
              [market.homeName, fairToOdd(odds.home, m)],
              [market.awayName, fairToOdd(odds.away, m)],
            ],
          },
          {
            name: `Total de Pontos (Mais/Menos ${odds.line.toFixed(0)})`,
            category: 'goals',
            choices: [
              [`Mais de ${odds.line.toFixed(0)}`, fairToOdd(odds.over, m)],
              [`Menos de ${odds.line.toFixed(0)}`, fairToOdd(1 - odds.over, m)],
            ],
          },
        ]
      : [
          {
            name: 'Resultado Final (1X2)',
            category: 'main',
            choices: [
              [market.homeName, fairToOdd(odds.home, m)],
              ['Empate', fairToOdd(odds.draw ?? 0.25, m)],
              [market.awayName, fairToOdd(odds.away, m)],
            ],
          },
          {
            name: 'Dupla Chance',
            category: 'main',
            choices: [
              [`${market.homeName} ou Empate`, fairToOdd((odds.home ?? 0) + (odds.draw ?? 0), m)],
              [`${market.homeName} ou ${market.awayName}`, fairToOdd((odds.home ?? 0) + (odds.away ?? 0), m)],
              [`Empate ou ${market.awayName}`, fairToOdd((odds.draw ?? 0) + (odds.away ?? 0), m)],
            ],
          },
          {
            name: 'Total de Gols (Mais/Menos 2.5)',
            category: 'goals',
            choices: [
              ['Mais de 2.5 Gols', fairToOdd(odds.over, m)],
              ['Menos de 2.5 Gols', fairToOdd(1 - odds.over, m)],
            ],
          },
        ];

  for (const marketRow of rows) {
    const inserted = await admin
      .from('match_markets')
      .insert({ match_id: matchId, name: marketRow.name, category: marketRow.category })
      .select('id')
      .single();

    if (inserted.error) throw inserted.error;

    const choices = marketRow.choices.map(([label, odd], i) => ({
      market_id: inserted.data?.id as string,
      label,
      odds: odd,
      previous_odds: null,
      trend: 'stable' as const,
      is_suspended: false,
      sort_order: i,
    }));

    const { error: choiceError } = await admin.from('market_choices').insert(choices);
    if (choiceError) throw choiceError;
  }
}

/** Garante que a soma das inversas = margem da casa (overround). */
function fairToOdd(fairProbability: number, margin: number): number {
  const p = clamp(fairProbability, 0.02, 0.98);
  return round2((1 / p) / margin);
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