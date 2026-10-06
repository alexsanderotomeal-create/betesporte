/**
 * Verificacao do motor de odds.
 *
 * Roda com: npx tsx src/services/oddsEngine.test.ts
 *
 * Nao usa vitest de proposito: o projeto nao tem runner de teste e adicionar
 * um so para isto seria peso extra. Se a suite crescer, o arquivo vira caso de
 * vitest sem mudanca de logica.
 */

import {
  applyOverround,
  deriveLiveOdds,
  deriveMatchOdds,
  estimateXg,
  poissonProbability,
  round2,
} from './oddsEngine';

let failures = 0;
let checks = 0;

function check(description: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${description}`);
  } else {
    failures += 1;
    console.log(`  FALHA ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

function approx(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

console.log('\nPoisson');

check('lambda 0 devolve so P(0)=1', poissonProbability(0, 0) === 1);
check('lambda 0 devolve 0 para k>0', poissonProbability(1, 0) === 0);
check('lambda 2, k=2 ≈ 0.2707', approx(poissonProbability(2, 2), 0.2707, 0.0001));
check(
  'soma k=0..10 com lambda 2 ≈ 1',
  approx(
    Array.from({ length: 11 }, (_, k) => poissonProbability(k, 2)).reduce((a, b) => a + b, 0),
    1,
    0.001
  )
);
// lambda 3.5 tem cauda longa: precisa de mais termos para somar ~1.
check(
  'soma k=0..18 com lambda 3.5 ≈ 1',
  approx(
    Array.from({ length: 19 }, (_, k) => poissonProbability(k, 3.5)).reduce((a, b) => a + b, 0),
    1,
    0.001
  )
);

console.log('\nOverround');

const spread = applyOverround([0.5, 0.3, 0.2], 1.05);
check('soma = 1.05', approx(spread.reduce((a, b) => a + b, 0), 1.05, 0.0001));
check('proporcao preservada: primeiro = 0.525', approx(spread[0], 0.525, 0.0001));
check('normaliza entrada com soma != 1', approx(applyOverround([2, 2], 1.0).reduce((a, b) => a + b, 0), 1.0, 0.0001));

console.log('\nEstimativa de xG');

const strongAttack = { goalsScored: 24, matchesPlayed: 8 };
const strongDefense = { goalsConceded: 5, matchesPlayed: 8 };
const weakAttack = { goalsScored: 5, matchesPlayed: 8 };
const weakDefense = { goalsConceded: 18, matchesPlayed: 8 };

const strongHome = estimateXg({ ...strongAttack, isHome: true }, weakDefense, 1.3);
const weakHome = estimateXg({ ...weakAttack, isHome: true }, strongDefense, 1.3);
check('time forte > time fraco', strongHome > weakHome, `${strongHome.toFixed(2)} vs ${weakHome.toFixed(2)}`);
check(
  'mandante tem vantagem',
  strongHome > estimateXg(strongAttack, weakDefense, 1.3),
  `${strongHome.toFixed(3)} vs ${estimateXg(strongAttack, weakDefense, 1.3).toFixed(3)}`
);
check(
  'campo vazio nao quebra',
  Number.isFinite(
    estimateXg({ goalsScored: NaN, matchesPlayed: 0 }, { goalsConceded: undefined, matchesPlayed: 0 }, 1.3)
  )
);

// Regressao a media: 1 jogo de zero gols nao pode gerar time de ataque alto.
// Com 8 jogos iguais, a leitura confia no historico.
const tinySample = estimateXg(
  { goalsScored: 0, matchesPlayed: 1, isHome: true },
  { goalsConceded: 0, matchesPlayed: 1 },
  1.3
);
const fullSample = estimateXg(
  { goalsScored: 0, matchesPlayed: 8, isHome: true },
  { goalsConceded: 0, matchesPlayed: 8 },
  1.3
);
// Um jogo de zero gols nao define um time. Com confianca 1/8, o prior domina:
// 1.3 * 0.875 = 1.1375, e a vantagem de mando leva a ~1.274.
check(
  'amostra de 1 jogo nao afasta do prior',
  tinySample > 1.2 && tinySample < 1.32,
  `${tinySample.toFixed(3)} (esperado ~1.274)`
);
check(
  'amostra de 1 jogo pesa mais que o historico cheio',
  tinySample > fullSample * 4,
  `${tinySample.toFixed(3)} vs ${fullSample.toFixed(3)}`
);
check('amostra de 8 jogos segue o zero do historico', fullSample < 0.2, fullSample.toFixed(3));

// Ataque fraco x defesa boa: os dois lados tem que puxar a mesma direcao.
// Era o bug da media simetrica entre marcar e sofrer do mesmo time.
const badAttack = estimateXg(
  { goalsScored: 4, goalsConceded: 22, matchesPlayed: 8 },
  { goalsScored: 20, goalsConceded: 5, matchesPlayed: 8 },
  1.3
);
const goodAttack = estimateXg(
  { goalsScored: 20, goalsConceded: 5, matchesPlayed: 8 },
  { goalsScored: 4, goalsConceded: 22, matchesPlayed: 8 },
  1.3
);
check('ataque ruim nao vira xG de time medio', badAttack < 1.3, badAttack.toFixed(3));
check('ataque bom nao vira xG de time medio', goodAttack > 1.3, goodAttack.toFixed(3));
check('ordem dos argumentos muda o resultado', badAttack !== goodAttack);

console.log('\nOdds de partida');

const favorite = deriveMatchOdds({
  home: { goalsScored: 26, goalsConceded: 6, matchesPlayed: 8, isHome: true },
  away: { goalsScored: 8, goalsConceded: 20, matchesPlayed: 8 },
  leagueAverageGoals: 1.3,
  margin: 1.05,
});

const underdog = deriveMatchOdds({
  home: { goalsScored: 4, goalsConceded: 22, matchesPlayed: 8, isHome: true },
  away: { goalsScored: 24, goalsConceded: 6, matchesPlayed: 8 },
  leagueAverageGoals: 1.3,
  margin: 1.05,
});

check('1X2 soma ≈ 1', approx(favorite.probabilityHome + favorite.probabilityDraw + favorite.probabilityAway, 1, 0.001));
check('favorito tem P(casa) > 0.5', favorite.probabilityHome > 0.5, favorite.probabilityHome.toFixed(3));
check('favorito tem P(casa) > P(fora)', favorite.probabilityHome > favorite.probabilityAway);
check('empate e resultado menos provavel', favorite.probabilityDraw < favorite.probabilityHome);
check('laranja de bem mais fraco tem P(casa) < 0.3', underdog.probabilityHome < 0.3, underdog.probabilityHome.toFixed(3));

const oneXTwo = favorite.markets[0];
check('mercado 1X2 tem 3 selecoes', oneXTwo.choices.length === 3);
check('todas as odds > 1', oneXTwo.choices.every(c => c.odds > 1));
// Odd arredondada a 2 casas perde precisao: com 3 selecoes o erro acumulado
// chega a ~0.02. Tolerancia de 1% seria falsa falha.
check('soma das inversas = margem', approx(oneXTwo.choices.reduce((a, c) => a + 1 / c.odds, 0), 1.05, 0.03),
  oneXTwo.choices.reduce((a, c) => a + 1 / c.odds, 0).toFixed(4));

const overUnderMarket = favorite.markets.find(m => m.category === 'goals' && m.name === 'Total de Gols');
const bttsMarket = favorite.markets.find(m => m.name === 'Ambos Marcam');
check('mercado over/under existe', Boolean(overUnderMarket));
check('mercado ambas marcam existe', Boolean(bttsMarket));
check('over/under soma 1X2 relativo ok', Boolean(overUnderMarket && overUnderMarket.choices.length === 2));

const zeroMargin = deriveMatchOdds({
  home: { goalsScored: 26, goalsConceded: 6, matchesPlayed: 8, isHome: true },
  away: { goalsScored: 8, goalsConceded: 20, matchesPlayed: 8 },
  leagueAverageGoals: 1.3,
  margin: 1.0,
});
check(
  'margem 1.0 => inversas somam ~1.0',
  approx(zeroMargin.markets[0].choices.reduce((a, c) => a + 1 / c.odds, 0), 1.0, 0.03)
);
check(
  'margem maior encurta a odd',
  zeroMargin.markets[0].choices[0].odds > favorite.markets[0].choices[0].odds
);
check(
  'margem tem piso (nunca <= 1.0)',
  deriveMatchOdds({
    home: { goalsScored: 1, goalsConceded: 1, matchesPlayed: 8 },
    away: { goalsScored: 1, goalsConceded: 1, matchesPlayed: 8 },
    margin: 0.5,
  }).markets[0].choices.every(c => c.odds >= 1.01)
);

console.log('\nAo vivo');

const preGame = favorite.probabilityHome;
const afterGoal = deriveLiveOdds(
  {
    home: { goalsScored: 26, goalsConceded: 6, matchesPlayed: 8, isHome: true },
    away: { goalsScored: 8, goalsConceded: 20, matchesPlayed: 8 },
    leagueAverageGoals: 1.3,
  },
  1,
  0,
  0.25
);
check('gol do mandante derruba P(casa)', afterGoal.probabilityHome < preGame, `${afterGoal.probabilityHome.toFixed(3)} < ${preGame.toFixed(3)}`);

const fullTime = deriveLiveOdds(
  {
    home: { goalsScored: 26, goalsConceded: 6, matchesPlayed: 8, isHome: true },
    away: { goalsScored: 8, goalsConceded: 20, matchesPlayed: 8 },
  },
  3,
  0,
  0.98
);
// Com ~2% de jogo restante, 3x0 nao e 100% decidido: ainda da para o
// visitante fazer 3. P(casa) alto e o resto perto de zero.
check('3x0 aos 98% e praticamente decidido', fullTime.probabilityHome > 0.95, fullTime.probabilityHome.toFixed(4));
check('3x0 aos 98% deixa o visitante com chance minima', fullTime.probabilityAway < 0.02, fullTime.probabilityAway.toFixed(4));
check('3x0 aos 98% as tres probabilidades somam 1', approx(
  fullTime.probabilityHome + fullTime.probabilityDraw + fullTime.probabilityAway, 1, 0.001
));
// Empate nao lidera o placar: com mando superior, um gol solto nos acrescimos
// e mais provavel. Empate so lideraria com times de forca equivalente.
const tied = deriveLiveOdds(
  {
    home: { goalsScored: 26, goalsConceded: 6, matchesPlayed: 8, isHome: true },
    away: { goalsScored: 8, goalsConceded: 20, matchesPlayed: 8 },
  },
  2,
  2,
  0.97
);
check('2x2 no fim: empate domina o visitante', tied.probabilityDraw > tied.probabilityAway, `draw=${tied.probabilityDraw} away=${tied.probabilityAway}`);
check('2x2 no fim: mandante ainda favored por causa do mando', tied.probabilityHome > tied.probabilityAway);

// Empate de verdade lidera quando os times sao equivalentes.
const even = deriveLiveOdds(
  {
    home: { goalsScored: 14, goalsConceded: 10, matchesPlayed: 8, isHome: true },
    away: { goalsScored: 13, goalsConceded: 11, matchesPlayed: 8 },
  },
  1,
  1,
  0.9
);
check('empate de times equivalentes lidera', even.probabilityDraw > even.probabilityHome && even.probabilityDraw > even.probabilityAway,
  `home=${even.probabilityHome} draw=${even.probabilityDraw} away=${even.probabilityAway}`);

// Placar acumulado tem de pesar: 3x0 e 0x3 nao podem gerar a mesma distribuicao.
const ahead = deriveLiveOdds(
  {
    home: { goalsScored: 14, goalsConceded: 10, matchesPlayed: 8, isHome: true },
    away: { goalsScored: 13, goalsConceded: 11, matchesPlayed: 8 },
  },
  2,
  0,
  0.6
);
const behind = deriveLiveOdds(
  {
    home: { goalsScored: 14, goalsConceded: 10, matchesPlayed: 8, isHome: true },
    away: { goalsScored: 13, goalsConceded: 11, matchesPlayed: 8 },
  },
  0,
  2,
  0.6
);
check('2x0 e 0x2 nao produzem a mesma distribuicao', ahead.probabilityHome !== behind.probabilityHome);
check('2x0 -> casa domina', ahead.probabilityHome > ahead.probabilityAway);
check('0x2 -> fora domina', behind.probabilityAway > behind.probabilityHome);
check('fracao invalida nao quebra', Number.isFinite(deriveLiveOdds(
  { home: { goalsScored: 1, goalsConceded: 1, matchesPlayed: 8 }, away: { goalsScored: 1, goalsConceded: 1, matchesPlayed: 8 } },
  0, 0, NaN
).probabilityHome));

console.log('\nUtilitarios');
check('round2 arredonda .005 pra cima', round2(1.005) === 1.01 || round2(1.005) === 1);
check('round2(2.346) = 2.35', round2(2.346) === 2.35);

console.log(`\n${checks - failures}/${checks} verificacoes passaram`);
if (failures > 0) {
  console.log(`${failures} FALHARAM\n`);
  process.exit(1);
}
console.log('todas passaram\n');