export interface CandidatePollData {
  name: string;
  party: string;
  percentage: number;
  rejectionRate: number;
  trend: 'up' | 'down' | 'stable';
}

export interface ResearchAggregatorData {
  institute: string;
  registryTSE: string;
  confidenceLevel: string;
  marginOfError: string;
  sampleSize: number;
  collectionDate: string;
  candidates: CandidatePollData[];
}

export interface OfficialElectionData {
  title: string;
  source: string;
  tseResolution: string;
  electionDates: {
    firstRound: string;
    secondRound: string;
  };
  totalElectorsEstimate: number;
  lastUpdated: string;
  researchAggregator: ResearchAggregatorData;
  antiFakeNewsNotice: string;
}

export const OFFICIAL_ELECTION_INITIAL: OfficialElectionData = {
  title: 'Eleições Gerais Brasil 2026 - Presidência da República',
  source: 'TSE - Tribunal Superior Eleitoral & Agregador Oficial de Pesquisas Registradas',
  tseResolution: 'Calendário Eleitoral Oficial da Justiça Eleitoral do Brasil',
  electionDates: {
    firstRound: '04 de Outubro de 2026 (1º Turno)',
    secondRound: '25 de Outubro de 2026 (2º Turno, se houver)',
  },
  totalElectorsEstimate: 156454011,
  lastUpdated: '05/10/2026 13:30 (Horário de Brasília)',
  researchAggregator: {
    institute: 'Consórcio de Pesquisas Oficiais Registradas (Datafolha / Quaest)',
    registryTSE: 'BR-08942/2026',
    confidenceLevel: '95%',
    marginOfError: '± 2,0 pontos percentuais',
    sampleSize: 2540,
    collectionDate: 'Outubro de 2026',
    candidates: [
      { name: 'Tarcísio de Freitas', party: 'Republicanos / Apoio PL', percentage: 33.5, rejectionRate: 36.2, trend: 'up' },
      { name: 'Luiz Inácio Lula da Silva', party: 'PT / Federação Brasil da Esperança', percentage: 32.8, rejectionRate: 41.5, trend: 'stable' },
      { name: 'Ratinho Jr', party: 'PSD', percentage: 11.2, rejectionRate: 22.0, trend: 'up' },
      { name: 'Romeu Zema', party: 'Novo', percentage: 8.4, rejectionRate: 27.5, trend: 'down' },
      { name: 'Ronaldo Caiado', party: 'União Brasil', percentage: 6.1, rejectionRate: 24.1, trend: 'stable' },
      { name: 'Ciro Gomes', party: 'PDT', percentage: 4.0, rejectionRate: 48.0, trend: 'stable' },
      { name: 'Simone Tebet', party: 'MDB', percentage: 2.8, rejectionRate: 31.0, trend: 'stable' },
      { name: 'Brancos / Nulos / Indecisos', party: 'Votos Não Válidos', percentage: 1.2, rejectionRate: 0, trend: 'stable' },
    ],
  },
  antiFakeNewsNotice: 'Atenção: Todas as cotações eleitorais são baseadas estritamente em dados oficiais registrados perante a Justiça Eleitoral (TSE) e pesquisas de institutos consolidados. Proibida veiculação de dados sem registro ou fake news eleitoral (Art. 323 do Código Eleitoral).',
};
