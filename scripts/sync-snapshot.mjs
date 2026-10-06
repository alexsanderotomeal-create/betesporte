// Snapshot manual de partidas reais (ESPN) para o banco — roda LOCALMENTE.
//
// Por que existe: o egresso do Supabase as vezes recebe 400
// ("Failed to get events endpoint") da ESPN só no futebol; o IP local
// (Brasil) responde 200. Este script grava o mesmo shape do sync-sports
// (ligas, times, partidas, mercados) para garantir dados até o feed normal
// do edge voltar a responder. É idêntico ao persist do sync-sports.
//
// Uso: node scripts/sync-snapshot.mjs
//   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY lidos de .env copia ou env.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const CWD = fileURLToPath(new URL('../', import.meta.url));

function envVal(key) {
  if (process.env[key]) return process.env[key];
  for (const f of ['.env local', '.env local.example', '.env copy.example', '.env']) {
    const p = `${CWD}/${f}`;
    if (existsSync(p)) {
      const line = readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
      if (line) return line.slice(key.length + 1).trim();
    }
  }
  return null;
}

const DB_URL = envVal('VITE_SUPABASE_URL') ?? envVal('SUPABASE_URL');
const DB_KEY = envVal('VITE_SUPABASE_SERVICE_ROLE') ?? envVal('SUPABASE_SERVICE_ROLE_KEY');
if (!DB_URL || !DB_KEY) {
  console.error('Faltam SUPABASE_URL / service role key.');
  process.exit(1);
}

const admin = createClient(DB_URL, DB_KEY, { auth: { persistSession: false } });

const LEAGUES = [
  { sport: 'football', slug: 'bra.1', name: 'Brasileirao Serie A', country: 'Brasil' },
  { sport: 'football', slug: 'eng.1', name: 'Premier League', country: 'Inglaterra' },
  { sport: 'football', slug: 'esp.1', name: 'La Liga', country: 'Espanha' },
  { sport: 'football', slug: 'ita.1', name: 'Serie A Italiana', country: 'Italia' },
  { sport: 'basketball', slug: 'nba', name: 'NBA', country: 'Estados Unidos' },
];

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';

async function fetchScoreboard(sport, slug) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${encodeURIComponent(slug)}/scoreboard?dates=${today}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} em ${slug}: ${t.slice(0, 120)}`);
  }
  const json = await res.json().catch(() => ({ events: [] }));
  return json.events ?? [];
}

async function loadHouseMargin() {
  const { data } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'house_margin')
    .maybeSingle();
  const parsed = Number(data?.value);
  if (Number.isFinite(parsed) && parsed > 1 && parsed < 2) return parsed;
  return 1.05;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function fairToOdd(p, margin) {
  return round2((1 / clamp(p, 0.02, 0.98)) / margin);
}

function computeMinute(sport, competition) {
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

function computeOdds(sport, state, minute, homeScore, awayScore) {
  const live = state === 'in';
  const diff = homeScore - awayScore;
  if (sport === 'basketball') {
    const t = live ? clamp(minute / 48, 0, 1) : 0;
    const pHome = live ? clamp(0.5 + diff * 0.14 * t, 0.01, 0.99) : 0.56;
    const line = 225.5;
    const predicted = homeScore + awayScore + (48 - minute) * 2.2;
    const pOver = live ? clamp(0.5 + (predicted - line) * 0.02, 0.05, 0.95) : 0.52;
    return { home: pHome, draw: null, away: 1 - pHome, over: pOver, line };
  }
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
  const expectedTotal = homeScore + awayScore + 2.7 * (1 - t);
  const pOver = clamp(0.5 + (expectedTotal - 2.5) * 0.22, 0.05, 0.95);
  return { home: pHome, draw: pDraw, away: pAway, over: pOver, line: 2.5 };
}

async function replaceMarkets(matchId, sport, margin, market) {
  const { error: clearError } = await admin
    .from('match_markets')
    .delete()
    .eq('match_id', matchId);
  if (clearError) throw clearError;

  const { odds } = market;
  const m = margin;
  const rows =
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
      market_id: inserted.data?.id,
      label,
      odds: odd,
      previous_odds: null,
      trend: 'stable',
      is_suspended: false,
      sort_order: i,
    }));
    const { error: choiceError } = await admin.from('market_choices').insert(choices);
    if (choiceError) throw choiceError;
  }
}

async function upsertTeam(team) {
  const logo = team.logos?.[0]?.href ?? team.logo ?? null;
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
  return { id: upsert.data?.id };
}

async function persistEvent(league, event, margin) {
  const competition = event.competitions?.[0];
  if (!competition) return 'skipped';
  const home = competition.competitors.find((c) => c.homeAway === 'home');
  const away = competition.competitors.find((c) => c.homeAway === 'away');
  if (!home || !away) return 'skipped';

  const state = competition.status?.type?.state ?? 'pre';
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
  const leagueId = leagueUpsert.data?.id;

  const homeTeam = await upsertTeam(home.team);
  const awayTeam = await upsertTeam(away.team);

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
  const matchId = matchUpsert.data?.id;

  await replaceMarkets(matchId, league.sport, margin, {
    homeName: home.team.shortDisplayName || home.team.displayName,
    awayName: away.team.shortDisplayName || away.team.displayName,
    odds: computeOdds(league.sport, state, minute, homeScore, awayScore),
  });

  return 'synced';
}

const margin = await loadHouseMargin();
console.log(`margem = ${margin}`);

const done = new Set();
const started = Date.now();
const OVERALL_MS = 15 * 60 * 1000; // 15 min tentando pegar janela boa
const ROUND_GAP_MS = 20_000;

let rounds = 0;
while (done.size < LEAGUES.length && Date.now() - started < OVERALL_MS) {
  rounds++;
  for (const league of LEAGUES) {
    if (done.has(league.slug)) continue;
    try {
      const events = await fetchScoreboard(league.sport, league.slug);
      let synced = 0;
      let skipped = 0;
      for (const event of events) {
        const r = await persistEvent(league, event, margin);
        if (r === 'synced') synced++;
        else skipped++;
      }
      done.add(league.slug);
      console.log(`[round ${rounds}] ${league.slug.padEnd(8)} eventos=${events.length} synced=${synced} skipped=${skipped}`);
    } catch (err) {
      console.log(`[round ${rounds}] ${league.slug.padEnd(8)} ainda em 400: ${err.message.slice(0, 60)}`);
    }
  }
  if (done.size < LEAGUES.length) await new Promise((r) => setTimeout(r, ROUND_GAP_MS));
}
console.log(
  `snapshot concluido em ${Math.round((Date.now() - started) / 1000)}s: ` +
    (done.size ? `ok em ${[...done].join(', ')}` : 'nenhuma liga (ESPN indisponivel)')
);
const pending = LEAGUES.map((l) => l.slug).filter((s) => !done.has(s));
console.log('pendencias:', pending.length ? pending.join(', ') : '(nenhuma)');