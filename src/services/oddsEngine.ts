/**
 * Motor de odds da PrimasBet.
 *
 * A casa nao copia cota de terceiro: calcula a propria a partir de dados reais
 * de jogos e resultados, e aplica a margem que definir. Onde o mercado tem
 * pregao de US$100+/mes, aqui o custo e zero e a margem e nossa.
 *
 * Pipeline:
 *   1. xG por time (entradas de gol + mando de campo + ajuste de liga)
 *   2. Poisson => matriz de placares e probabilidades
 *   3. Derivacao dos mercados: 1X2, ambas marcam, over/under, handicap
 *   4. Overround => margem da casa distribuida proporcionalmente
 *
 * Entrada: dados de TheSportsDB / football-data.org (gratuitos e publicos).
 * Saida: odds proprias, explicaveis e reproduziveis.
 */

/** Overround minimo aceito. Abaixo de 1.02 a margem e insuficiente para cobrir custo. */
export const MIN_MARGIN = 1.02;

/** Teto de odd. Alem disso o modelo perde credibilidade e vira alvo de arbitragem. */
export const MAX_ODD = 1000;

/**
 * Historico de um time. Ataque e defesa sao medidos em campos separados porque
 * o modelo cruza o ataque de um com a defesa do outro. Passar so o que o time
 * marca e uma leitura legitima: um `TeamAttack` sem `goalsConceded`.
 */
export interface TeamStrengthInput {
  /** Gols marcados nos ultimos N jogos. */
  goalsScored?: number;
  /** Gols sofridos nos ultimos N jogos. */
  goalsConceded?: number;
  /** Numero de jogos usados na amostra. Amostra pequena => mais ruido. */
  matchesPlayed?: number;
  /** Mandante (true) ou visitante (false). Vale ~0.12 gols esperados. */
  isHome?: boolean;
}

export interface MatchStrengthInput {
  home: TeamStrengthInput;
  away: TeamStrengthInput;
  /** Media de gols por jogo da liga. Precisa para normalizar Times fortes. */
  leagueAverageGoals?: number;
  /** Overround final. 1.05 = 5% de margem. */
  margin?: number;
}

export interface DerivedOdd {
  key: string;
  label: string;
  /** Probabilidade bruta do evento, 0..1, antes da margem. */
  fairProbability: number;
  /** Odd com a margem ja aplicada. */
  odds: number;
}

export interface DerivedMarket {
  name: string;
  category: 'main' | 'goals' | 'halves' | 'handicap' | 'specials' | 'corners';
  choices: DerivedOdd[];
}

export interface MatchOddsResult {
  homeXg: number;
  awayXg: number;
  probabilityHome: number;
  probabilityDraw: number;
  probabilityAway: number;
  markets: DerivedMarket[];
}

/** Numeros quebrados viram 1.5. Evita NaN se o sync trouxer campo vazio. */
function num(value: number | undefined | null, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Fator de Poisson. Recursao classica: P(k) = P(k-1) * lambda / k
 * Uso direto de Math.exp(-lambda) * lambda^k / k! perde precisao para k alto.
 */
export function poissonProbability(goals: number, lambda: number): number {
  if (lambda <= 0) return goals === 0 ? 1 : 0;
  let result = Math.exp(-lambda);
  for (let k = 1; k <= goals; k += 1) {
    result = (result * lambda) / k;
  }
  return result;
}

/** Arredonda odd a 2 casas, que e como o mercado exibe cota. */
function toBookOdds(fairProbability: number, overround: number): number {
  if (fairProbability <= 0) return MAX_ODD;
  const adjusted = fairProbability * overround;
  return round2(clamp(1 / adjusted, 1.01, MAX_ODD));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Distribui a margem proporcionalmente a cada selecao. Somar as inversas das
 * odds deve devolver exatamente o overround pedido.
 */
export function applyOverround(probabilities: number[], overround: number): number[] {
  const total = probabilities.reduce((acc, p) => acc + p, 0);
  if (total <= 0) return probabilities;
  return probabilities.map(p => (p / total) * overround);
}

/**
 * Gols por jogo de um time, com regressao a media da liga quando a amostra e
 * pequena. Amostra de 2 jogos nao diz nada; a media da liga e o prior.
 */
function goalsPerMatch(
  goals: number | undefined | null,
  played: number | undefined | null,
  leagueAverageGoals: number
): number {
  const sample = Math.max(1, num(played, 0));
  const observed = num(goals, leagueAverageGoals * sample) / sample;
  const confidence = clamp(sample / 8, 0, 1);
  return leagueAverageGoals * (1 - confidence) + observed * confidence;
}

/**
 * Estima gols esperados de UM time contra UM adversario especifico.
 *
 * Cruza ataque proprio com defesa do rival. Nao se usa media entre o que marca
 * e o que sofre do mesmo time: um time que marca pouco e sofre muito tem
 * ataque ruim E defesa ruim, e a media simetrica cancela as duas falhas e
 * devolve um xG de time medio — exatamente o time que nao e.
 */
export function estimateXg(
  attack: TeamStrengthInput,
  opponentDefense: TeamStrengthInput,
  leagueAverageGoals = 1.35
): number {
  const attackRate = goalsPerMatch(attack.goalsScored, attack.matchesPlayed, leagueAverageGoals);
  // Sem historio de defesa do rival, o prior e a media da liga.
  const defenseRate = goalsPerMatch(
    opponentDefense?.goalsConceded,
    opponentDefense?.matchesPlayed,
    leagueAverageGoals
  );

  // Media das duas taxas: o time ataca na medida em que a defesa do rival permite.
  let xg = (attackRate + defenseRate) / 2;

  // Vantagem de mando: derivacao classica de expected goals em futebol.
  if (attack.isHome) xg *= 1.12;

  return clamp(xg, 0.15, 4.5);
}

/**
 * Calcular odds de uma partida.
 *
 * @example
 * const result = deriveMatchOdds({
 *   home: { goalsScored: 18, goalsConceded: 6, matchesPlayed: 8, isHome: true },
 *   away: { goalsScored: 9,  goalsConceded: 11, matchesPlayed: 8 },
 *   leagueAverageGoals: 1.3,
 *   margin: 1.05,
 * });
 * // result.probabilityHome ~0.55, odds de victory ~1.85
 */
export function deriveMatchOdds(input: MatchStrengthInput): MatchOddsResult {
  const leagueAverageGoals = clamp(num(input.leagueAverageGoals, 1.35), 0.4, 4.0);
  const overround = clamp(num(input.margin, 1.05), MIN_MARGIN, 2.0);

  const homeXg = estimateXg(input.home, input.away, leagueAverageGoals);
  const awayXg = estimateXg(input.away, input.home, leagueAverageGoals);

  return buildMarkets(homeXg, awayXg, overround);
}

/**
 * Monta os mercados a partir de dois xG ja definidos. Caminho unico tanto para
 * pre-jogo (xG de partida inteira) quanto para ao vivo (xG restante) — assim
 * nao existe uma segunda implementacao que possa divergir da primeira.
 */
function buildMarkets(
  homeXg: number,
  awayXg: number,
  overround: number,
  currentHomeScore = 0,
  currentAwayScore = 0
): MatchOddsResult {
  const probabilities = scoreMatrixProbabilities(homeXg, awayXg, currentHomeScore, currentAwayScore);

  const pHome = probabilities.home;
  const pDraw = probabilities.draw;
  const pAway = probabilities.away;

  const markets: DerivedMarket[] = [
    {
      name: 'Resultado do Jogo',
      category: 'main',
      choices: applyMargin([
        { key: 'home', label: 'Vitória do Mandante', fairProbability: pHome },
        { key: 'draw', label: 'Empate', fairProbability: pDraw },
        { key: 'away', label: 'Vitória do Visitante', fairProbability: pAway },
      ], overround),
    },
  ];

  const overUnder = buildOverUnder(homeXg, awayXg);
  if (overUnder) {
    markets.push({
      name: 'Total de Gols',
      category: 'goals',
      choices: applyMargin([
        { key: 'over', label: `Mais de ${overUnder.line}`, fairProbability: overUnder.over },
        { key: 'under', label: `Menos de ${overUnder.line}`, fairProbability: overUnder.under },
      ], overround),
    });
  }

  const btts = buildBothTeamsToScore(homeXg, awayXg);
  markets.push({
    name: 'Ambos Marcam',
    category: 'goals',
    choices: applyMargin([
      { key: 'yes', label: 'Sim', fairProbability: btts.yes },
      { key: 'no', label: 'Não', fairProbability: btts.no },
    ], overround),
  });

  return {
    homeXg: round2(homeXg),
    awayXg: round2(awayXg),
    probabilityHome: round4(pHome),
    probabilityDraw: round4(pDraw),
    probabilityAway: round4(pAway),
    markets,
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function applyMargin(
  choices: Omit<DerivedOdd, 'odds'>[],
  overround: number
): DerivedOdd[] {
  const adjusted = applyOverround(choices.map(c => c.fairProbability), overround);
  return choices.map((choice, i) => ({
    ...choice,
    fairProbability: round4(choice.fairProbability),
    odds: toBookOdds(adjusted[i], 1),
  }));
}

/**
 * Soma as probabilidades da matriz de placares ate maxGoals.
 * Acima do limite a cauda e despresivel (<0.1%) e somar tudo deixa o loop caro.
 */
function scoreMatrixProbabilities(
  homeXg: number,
  awayXg: number,
  currentHomeScore = 0,
  currentAwayScore = 0
): { home: number; draw: number; away: number } {
  const maxGoals = 8;
  let home = 0;
  let draw = 0;
  let away = 0;

  // O resultado e do placar FINAL: o que ja saiu conta tanto quanto o que
  // ainda pode sair. Sem somar currentScore, um 3x0 nos minutos finais
  // trataria o visitante como favorito so pelo xG que ainda the resta.
  for (let h = 0; h <= maxGoals; h += 1) {
    const ph = poissonProbability(h, homeXg);
    for (let a = 0; a <= maxGoals; a += 1) {
      const prob = ph * poissonProbability(a, awayXg);
      const finalHome = currentHomeScore + h;
      const finalAway = currentAwayScore + a;
      if (finalHome > finalAway) home += prob;
      else if (finalHome === finalAway) draw += prob;
      else away += prob;
    }
  }

  const total = home + draw + away;
  // Normaliza: a truncacao em maxGames deixa um residuo que precisa ir embora.
  return total > 0
    ? { home: home / total, draw: draw / total, away: away / total }
    : { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
}

/** Linha de over/under na media Poisson do total de gols esperado. */
function buildOverUnder(
  homeXg: number,
  awayXg: number
): { line: number; over: number; under: number } | null {
  const total = homeXg + awayXg;
  const line = round2(clamp(Math.round(total), 1, 6));
  let over = 0;
  for (let g = 0; g <= 10; g += 1) {
    // Probabilidade de "total >= line+1" = soma de Poisson(total) a partir de line+1.
    if (g >= line + 1) over += poissonProbability(g, total);
  }
  return { line, over: clamp(over, 0.001, 0.999), under: clamp(1 - over, 0.001, 0.999) };
}

function buildBothTeamsToScore(homeXg: number, awayXg: number): { yes: number; no: number } {
  const homeScores = 1 - poissonProbability(0, homeXg);
  const awayScores = 1 - poissonProbability(0, awayXg);
  const yes = clamp(homeScores * awayScores, 0.001, 0.999);
  return { yes, no: clamp(1 - yes, 0.001, 0.999) };
}

/**
 * Reavalia ao vivo. Entrar gol muda o xG restante e a odd se move sozinha —
 * esse movimento e o que o usuario enxerga como "cota ao vivo".
 *
 *
 * @param elapsedFraction 0..1, fracao da partida ja disputada.
 */
export function deriveLiveOdds(
  input: MatchStrengthInput,
  homeScore: number,
  awayScore: number,
  elapsedFraction: number,
  margin?: number
): MatchOddsResult {
  const leagueAverageGoals = clamp(num(input.leagueAverageGoals, 1.35), 0.4, 4.0);
  const overround = clamp(num(margin, input.margin ?? 1.05), MIN_MARGIN, 2.0);
  const fraction = clamp(elapsedFraction, 0, 0.95);

  // xG de partida inteira, calculado uma vez do historico dos dois times.
  const homeFullXg = estimateXg(input.home, input.away, leagueAverageGoals);
  const awayFullXg = estimateXg(input.away, input.home, leagueAverageGoals);

  // Quao da partida ja foi disputada, em termos de gols esperados. O segundo
  // tempo tem menos gols por minuto que o primeiro.
  const elapsedShare = fraction * (fraction < 0.5 ? 1.1 : 0.9);

// Projeta o total da partida ao ritmo atual e tira o que ja saiu do placar.
  // Gol nao se desfaz: o xG restante vai a zero, mas o placar acumulado segue
  // valendo e e ele que decide 1X2.
  const remainingHome = clamp(homeFullXg * elapsedShare - homeScore, 0.02, 4.5);
  const remainingAway = clamp(awayFullXg * elapsedShare - awayScore, 0.02, 4.5);

  return buildMarkets(remainingHome, remainingAway, overround, homeScore, awayScore);
}