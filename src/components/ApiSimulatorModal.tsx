import React, { useState } from 'react';
import { 
  X, 
  Activity, 
  Wifi, 
  Radio, 
  RefreshCw, 
  ShieldCheck, 
  CheckCircle2, 
  Play, 
  Pause, 
  AlertTriangle,
  Flame,
  Zap,
  Sliders,
  Terminal
} from 'lucide-react';
import { ApiConnectionConfig, Match } from '../types/betting';
import { testExternalApiConnection, ApiTestResult } from '../services/sportsApi';

interface ApiSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConnectionConfig;
  onSaveConfig: (cfg: ApiConnectionConfig) => void;
  matches: Match[];
  onTriggerEvent: (matchId: string, eventType: 'goal' | 'corner' | 'card' | 'penalty' | 'dangerous_attack', team: 'home' | 'away') => void;
  onToggleSuspend: (matchId: string, suspend: boolean) => void;
  onForceOddsJitter: () => void;
  isEngineRunning: boolean;
  onToggleEngine: () => void;
}

export const ApiSimulatorModal: React.FC<ApiSimulatorModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  matches,
  onTriggerEvent,
  onToggleSuspend,
  onForceOddsJitter,
  isEngineRunning,
  onToggleEngine,
}) => {
  const [mode, setMode] = useState<'simulated_live' | 'external_api'>(config.mode);
  const [apiUrl, setApiUrl] = useState<string>(config.apiUrl);
  const [apiKey, setApiKey] = useState<string>(config.apiKey);
  const [pollingRate, setPollingRate] = useState<number>(config.pollingIntervalSeconds);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<ApiTestResult | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(matches[0]?.id || '');
  const [areMarketsSuspended, setAreMarketsSuspended] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await testExternalApiConnection(apiUrl, apiKey);
    setTestResult(res);
    setIsTesting(false);
  };

  const handleSave = () => {
    const updated: ApiConnectionConfig = {
      ...config,
      mode,
      apiUrl,
      apiKey,
      pollingIntervalSeconds: pollingRate,
      isConnected: true,
      lastSyncTime: 'Agora',
    };
    onSaveConfig(updated);
    onClose();
  };

  const currentMatch = matches.find((m) => m.id === selectedMatchId) || matches[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00e701]/20 border border-[#00e701]/40 flex items-center justify-center">
              <Activity className="w-4 h-4 text-[#00e701]" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block leading-tight">
                Hub de API de Terceiros & Simulador em Tempo Real
              </span>
              <span className="text-[10px] text-slate-400">
                Alimentação de odds dinâmicas, telemetria esportiva e injeção de eventos
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

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex flex-col gap-5 flex-1 text-xs">
          {/* Engine Status Banner */}
          <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-3 w-3">
                {isEngineRunning && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e701] opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isEngineRunning ? 'bg-[#00e701]' : 'bg-slate-500'}`}></span>
              </div>
              <div>
                <span className="font-bold text-white block text-sm">
                  Motor de Cotações: {isEngineRunning ? 'Ativo em Tempo Real' : 'Pausado'}
                </span>
                <span className="text-[11px] text-slate-400">
                  Atualizando flutuação de odds a cada {pollingRate} segundos
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onForceOddsJitter}
                className="px-3 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Forçar flutuação imediata das odds"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#00e701]" />
                <span>Atualizar Odds Agora</span>
              </button>

              <button
                onClick={onToggleEngine}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isEngineRunning
                    ? 'bg-rose-950/60 border border-rose-600/40 text-rose-300 hover:bg-rose-900/60'
                    : 'bg-[#00e701] text-black hover:bg-[#00c901]'
                }`}
              >
                {isEngineRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isEngineRunning ? 'Pausar' : 'Iniciar'}</span>
              </button>
            </div>
          </div>

          {/* Section 1: External API Connector */}
          <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <Wifi className="w-4 h-4 text-sky-400" />
                Configuração do Provedor de Dados (API de Terceiros)
              </span>
              <div className="flex items-center gap-1 bg-[#10141d] p-0.5 rounded-lg border border-[#252d3d]">
                <button
                  onClick={() => setMode('simulated_live')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    mode === 'simulated_live' ? 'bg-[#00e701] text-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Simulador Real-Time
                </button>
                <button
                  onClick={() => setMode('external_api')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    mode === 'external_api' ? 'bg-[#00e701] text-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Endpoint REST/JSON
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">
                  URL do Endpoint Esportivo:
                </label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.football-data.org/v4/matches"
                  className="w-full bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-3 py-2 font-mono text-white text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">
                  API Key / Token de Acesso:
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Bearer token ou X-Auth-Token"
                  className="w-full bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-3 py-2 font-mono text-white text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">Intervalo de sincronização:</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={pollingRate}
                  onChange={(e) => setPollingRate(parseInt(e.target.value))}
                  className="accent-[#00e701] w-24 cursor-pointer"
                />
                <span className="font-mono font-bold text-[#00e701] text-xs">{pollingRate}s</span>
              </div>

              <button
                disabled={isTesting}
                onClick={handleTestConnection}
                className="px-3 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isTesting ? (
                  <span className="animate-pulse">Testando latência...</span>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5 text-sky-400" />
                    <span>Testar Conexão com API</span>
                  </>
                )}
              </button>
            </div>

            {/* Test result output */}
            {testResult && (
              <div className={`p-3 rounded-xl border text-[11px] ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}>
                <div className="flex items-center justify-between font-bold mb-1">
                  <span>{testResult.message}</span>
                  <span className="font-mono">{testResult.latencyMs}ms de latência</span>
                </div>
                {Boolean(testResult.sampleData) && (
                  <pre className="mt-1.5 p-2 bg-black/60 rounded border border-white/5 font-mono text-[10px] overflow-x-auto text-slate-300">
                    {JSON.stringify(testResult.sampleData, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Live Match Event Injection Sandbox */}
          <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <Terminal className="w-4 h-4 text-[#00e701]" />
                Injetor de Eventos Ao Vivo (Painel de Teste em Alta Frequência)
              </span>
              <span className="text-[10px] text-slate-400">
                Dispare eventos reais para observar o recalculo das odds
              </span>
            </div>

            {/* Select Match */}
            <div>
              <label className="text-slate-400 block mb-1 text-[11px]">
                Partida Alvo:
              </label>
              <select
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                className="w-full bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
              >
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.homeTeam} {m.homeScore} x {m.awayScore} {m.awayTeam} ({m.league}) - {m.minute}' {m.period}
                  </option>
                ))}
              </select>
            </div>

            {/* Trigger buttons */}
            {currentMatch && (
              <div className="flex flex-col gap-2 pt-1">
                <span className="text-slate-400 text-[11px]">Ações Instantâneas:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => onTriggerEvent(currentMatch.id, 'goal', 'home')}
                    className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-600/40 hover:bg-emerald-900/60 text-emerald-300 font-bold transition-colors cursor-pointer text-center"
                  >
                    ⚽ Gol {currentMatch.homeTeam}
                  </button>

                  <button
                    onClick={() => onTriggerEvent(currentMatch.id, 'goal', 'away')}
                    className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-600/40 hover:bg-emerald-900/60 text-emerald-300 font-bold transition-colors cursor-pointer text-center"
                  >
                    ⚽ Gol {currentMatch.awayTeam}
                  </button>

                  <button
                    onClick={() => onTriggerEvent(currentMatch.id, 'dangerous_attack', 'home')}
                    className="p-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 font-semibold transition-colors cursor-pointer text-center"
                  >
                    ⚡ Ataque Perigoso
                  </button>

                  <button
                    onClick={() => onTriggerEvent(currentMatch.id, 'corner', 'home')}
                    className="p-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 font-semibold transition-colors cursor-pointer text-center"
                  >
                    🚩 Escanteio
                  </button>

                  <button
                    onClick={() => onTriggerEvent(currentMatch.id, 'penalty', 'home')}
                    className="p-2 rounded-lg bg-amber-950/60 border border-amber-600/40 hover:bg-amber-900/60 text-amber-300 font-bold transition-colors cursor-pointer text-center"
                  >
                    ⚠️ Pênalti Marcado
                  </button>

                  <button
                    onClick={() => onTriggerEvent(currentMatch.id, 'card', 'away')}
                    className="p-2 rounded-lg bg-amber-950/60 border border-amber-600/40 hover:bg-amber-900/60 text-amber-300 font-bold transition-colors cursor-pointer text-center"
                  >
                    🟨 Cartão Amarelo
                  </button>

                  <button
                    onClick={() => {
                      const next = !areMarketsSuspended;
                      setAreMarketsSuspended(next);
                      onToggleSuspend(currentMatch.id, next);
                    }}
                    className={`p-2 rounded-lg border font-bold transition-colors cursor-pointer text-center ${
                      areMarketsSuspended
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-rose-950/60 border-rose-600/40 text-rose-300 hover:bg-rose-900/60'
                    }`}
                  >
                    {areMarketsSuspended ? '🔓 Reabrir Odds' : '🔒 Suspender Mercados (VAR)'}
                  </button>

                  <button
                    onClick={onForceOddsJitter}
                    className="p-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 font-semibold transition-colors cursor-pointer text-center"
                  >
                    📈 Flutuar Cotações
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#161b22] border-t border-[#21262d] px-4 py-2.5 flex items-center justify-between text-xs text-slate-400">
          <span>Latência média estimada: 24ms</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold cursor-pointer"
            >
              Salvar Configuração
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
