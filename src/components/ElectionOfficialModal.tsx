import React from 'react';
import { 
  X, 
  ShieldCheck, 
  AlertTriangle, 
  Calendar, 
  Users, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  ExternalLink,
  BookOpen,
  Vote
} from 'lucide-react';
import { OfficialElectionData } from '../types/election';

interface ElectionOfficialModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: OfficialElectionData;
  onGoToBetting: () => void;
}

export const ElectionOfficialModal: React.FC<ElectionOfficialModalProps> = ({
  isOpen,
  onClose,
  data,
  onGoToBetting,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#161b22] to-[#12161f] px-4 py-3.5 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[#00e701]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-extrabold text-white">
                  Dados Oficiais & Checagem Anti-Fake News
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#00e701] text-black font-extrabold text-[10px] uppercase">
                  REGISTRO TSE
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                Eleições Presidenciais 2026 · Fontes Oficiais da Justiça Eleitoral
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex flex-col gap-4 text-xs">
          {/* Anti-Fake News Banner */}
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5 flex items-start gap-3 text-emerald-200">
            <ShieldCheck className="w-5 h-5 text-[#00e701] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white text-xs block mb-0.5">
                Compromisso com a Verdade e Dados Oficiais (Sem Fake News)
              </span>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {data.antiFakeNewsNotice}
              </p>
            </div>
          </div>

          {/* TSE Official Schedule */}
          <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-400" />
                Calendário Eleitoral Oficial (TSE)
              </span>
              <span className="text-[10px] text-slate-400">Constituição Federal & Código Eleitoral</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="bg-[#10141d] p-3 rounded-lg border border-[#21262d]">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">1º Turno Obrigatório</span>
                <span className="font-extrabold text-white text-xs block mt-0.5">
                  {data.electionDates.firstRound}
                </span>
                <span className="text-[10px] text-slate-500">Eleição para Presidente, Governador, Senador e Deputados</span>
              </div>

              <div className="bg-[#10141d] p-3 rounded-lg border border-[#21262d]">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">2º Turno (Se Houver)</span>
                <span className="font-extrabold text-white text-xs block mt-0.5">
                  {data.electionDates.secondRound}
                </span>
                <span className="text-[10px] text-slate-500">Disputado caso nenhum atinja maioria absoluta (50% + 1)</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Eleitorado estimado apto no Brasil e exterior:</span>
              <span className="font-mono font-bold text-white">~{data.totalElectorsEstimate.toLocaleString('pt-BR')} eleitores</span>
            </div>
          </div>

          {/* Research Aggregator Table */}
          <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 border-b border-[#21262d] pb-2">
              <div>
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Vote className="w-4 h-4 text-[#00e701]" />
                  Pesquisas Registradas no TSE (Agregador Oficial)
                </span>
                <span className="text-[10px] text-slate-400">
                  {data.researchAggregator.institute} · Reg. TSE {data.researchAggregator.registryTSE}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                <span>Margem: {data.researchAggregator.marginOfError}</span>
                <span>·</span>
                <span>Confiança: {data.researchAggregator.confidenceLevel}</span>
              </div>
            </div>

            {/* Candidates Poll List */}
            <div className="flex flex-col gap-1.5">
              {data.researchAggregator.candidates.map((cand, idx) => (
                <div 
                  key={idx}
                  className="bg-[#10141d] p-2.5 rounded-lg border border-[#21262d] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-[#1c2331] text-[10px] font-mono font-bold flex items-center justify-center text-slate-400">
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <span className="font-bold text-white block truncate text-xs">{cand.name}</span>
                      <span className="text-[10px] text-slate-400 truncate">{cand.party}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase block">Intenção de Voto</span>
                      <span className="font-mono text-sm font-extrabold text-[#00e701]">
                        {cand.percentage.toFixed(1)}%
                      </span>
                    </div>

                    {cand.rejectionRate > 0 && (
                      <div className="hidden sm:block">
                        <span className="text-[9px] text-slate-500 uppercase block">Rejeição</span>
                        <span className="font-mono text-xs font-bold text-rose-400">
                          {cand.rejectionRate.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#161b22] border-t border-[#21262d] px-4 py-3 flex items-center justify-between text-xs text-slate-400">
          <span>Última atualização: {data.lastUpdated}</span>
          <button
            onClick={() => {
              onClose();
              onGoToBetting();
            }}
            className="px-4 py-2 rounded-xl bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold uppercase tracking-wide cursor-pointer transition-colors shadow-md shadow-[#00e701]/25"
          >
            Apostar nas Eleições
          </button>
        </div>
      </div>
    </div>
  );
};
