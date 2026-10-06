/**
 * Mercados eleitorais.
 *
 * Antes este arquivo era um "agregador de pesquisas registradas no TSE": com
 * percentuais de voto, nomes de institutos (Datafolha, Quaest), numero de
 * registro, margem de erro e tamanho de amostra. Nenhum desses numeros existia.
 * Eram inventados e atribuidos a instituicoes e a Justiça Eleitoral reais, num
 * produto que cobra dinheiro do usuario. Isso sai.
 *
 * O que e agora: candidatos a presidente e a governador, e o PRECO que a casa
 * paga por cada um. Odd nao e pesquisa — e cotacao. Sobe, desce e e ajustada
 * pela operacao, como o preco de qualquer outro mercado. O escopo e presidente
 * e governador; nada de senador, deputado ou prefeito.
 *
 * Odd e payout persistidos no Postgres e validados dentro da transacao de
 * aposta. Ver src/services/dataService.ts e
 * supabase/migrations/0003_election_market.sql.
 */

export type ElectionScope = 'PRESIDENT' | 'GOVERNOR';

export interface ElectionCandidate {
  id: string;
  name: string;
  party: string | null;
  /** Preco atual da casa. Decimal, mesmo formato das odds de futebol. */
  odds: number;
  /** Odd anterior, para o operador ver a variacao. */
  previousOdds?: number;
  /** Sobe, desce ou parado em relacao ao preco anterior. */
  trend?: 'up' | 'down' | 'stable';
  /** Intencao de voto (%) real — apuracao oficial ou pesquisa registrada. */
  voteIntention?: number | null;
  /** Fonte da intencao (ex.: "TSE", "Datafolha" ...). */
  pollSource?: string | null;
  /** Data da apuracao/pesquisa. */
  pollDate?: string | null;
}

export interface ElectionContest {
  id: string;
  scope: ElectionScope;
  /** NULL so para presidente: a votacao e nacional. */
  stateCode: string | null;
  title: string;
  status: 'OPEN' | 'SUSPENDED' | 'CLOSED';
  /** Data do 2o turno (null enquanto nao cadastrada). */
  electionDate?: string | null;
  candidates: ElectionCandidate[];
}

/**
 * Frappe que explica o que o numero e. Aparece na tela de aposta.
 *
 * Sem ela o usuario le "33,5%" e entende pesquisa de instituto — que e
 * exatamente o mal-entendido que este mercado nao quer criar.
 */
export const ELECTION_SOURCE_NOTE =
  'Os valores sao cotacoes da casa, nao resultados de pesquisa. Ajustaveis pela operacao e registrados com autor e hora.';

/** Como o mercado liquida. Exibido antes da aposta. */
export const ELECTION_SETTLEMENT_RULE =
  'Apostas liquidam com o candidato mais votado na urna de 1o turno. Em caso de empate, o mercado e anulado e o valor estornado.';

/** Escopos suportados, na ordem em que aparecem. */
export const ELECTION_SCOPES: ElectionScope[] = ['PRESIDENT', 'GOVERNOR'];

export const ELECTION_SCOPE_LABEL: Record<ElectionScope, string> = {
  PRESIDENT: 'Presidencia da Republica',
  GOVERNOR: 'Governo estadual',
};

/** Retorna 'up' | 'down' | 'stable' a partir do preco atual e do anterior. */
export function electionTrend(
  odds: number,
  previousOdds?: number
): 'up' | 'down' | 'stable' {
  if (previousOdds == null) return 'stable';
  if (odds > previousOdds) return 'up';
  if (odds < previousOdds) return 'down';
  return 'stable';
}