import React, { useState } from 'react';
import { 
  Activity, 
  Flag, 
  Zap, 
  ChevronDown, 
  ChevronUp, 
  Radio
} from 'lucide-react';
import { Match } from '../types/betting';

interface LivePitchTrackerProps {
  match: Match;
  onClose?: () => void;
}

export const LivePitchTracker: React.FC<LivePitchTrackerProps> = ({ match, onClose }) => {
  const [activeTab, setActiveTab] = useState<'pitch' | 'stats' | 'events'>('pitch');
  const [isExpanded, setIsExpanded] = useState(true);

  const isHomeAttacking = match.activeAttackTeam === 'home';
  const isAwayAttacking = match.activeAttackTeam === 'away';
  const intensity = match.attackIntensity || 'normal';

  return (
    <div className="bg-[#12161f] border border-[#21262d] rounded-xl overflow-hidden shadow-lg text-slate-200 mb-4 transition-all">
      {/* Header with Live Score & Period */}
      <div className="bg-gradient-to-r from-[#161b22] to-[#12161f] border-b border-[#21262d] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-600/20 border border-rose-500/40 text-rose-400 text-xs font-bold font-mono">
            <Radio className="w-3 h-3 animate-pulse text-rose-500" />
            {match.minute}' {match.period}
          </span>
          <span className="text-xs font-medium text-slate-400 hidden sm:inline">
            {match.league} · {match.country}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#1a202c] p-0.5 rounded-lg border border-[#30363d]">
            <button
              onClick={() => setActiveTab('pitch')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'pitch' ? 'bg-[#00e701] text-black font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Campo
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'stats' ? 'bg-[#00e701] text-black font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Estatísticas
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'events' ? 'bg-[#00e701] text-black font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Lances ({match.events.length})
            </button>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#21262d]"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Match Score Banner */}
      <div className="px-4 py-3 bg-[#10141d] flex items-center justify-between border-b border-[#21262d]">
        {/* Home Team */}
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 rounded-full bg-[#1c2331] border border-slate-700 flex items-center justify-center font-bold text-xs text-white shadow">
            {match.homeTeam.substring(0, 3).toUpperCase()}
          </div>
          <div className="text-left">
            <span className="text-sm sm:text-base font-bold text-white block leading-tight">
              {match.homeTeam}
            </span>
            <span className="text-[10px] text-slate-400">Mandante</span>
          </div>
        </div>

        {/* Big Score Box */}
        <div className="flex flex-col items-center px-4">
          <div className="font-mono text-2xl sm:text-3xl font-extrabold text-white tracking-wider bg-[#161b22] px-3 py-1 rounded-lg border border-[#30363d] shadow-inner">
            <span className={match.activeAttackTeam === 'home' ? 'text-[#00e701]' : 'text-white'}>{match.homeScore}</span>
            <span className="text-slate-500 mx-2">:</span>
            <span className={match.activeAttackTeam === 'away' ? 'text-[#00e701]' : 'text-white'}>{match.awayScore}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 mt-1">Ao Vivo</span>
        </div>

        {/* Away Team */}
        <div className="flex items-center justify-end gap-3 flex-1 text-right">
          <div className="text-right">
            <span className="text-sm sm:text-base font-bold text-white block leading-tight">
              {match.awayTeam}
            </span>
            <span className="text-[10px] text-slate-400">Visitante</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#1c2331] border border-slate-700 flex items-center justify-center font-bold text-xs text-white shadow">
            {match.awayTeam.substring(0, 3).toUpperCase()}
          </div>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* TAB 1: 2D Pitch Visualization */}
          {activeTab === 'pitch' && (
            <div className="p-3 sm:p-4 bg-[#0a0d14]">
              {/* Pitch Visual Board */}
              <div className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden border-2 border-emerald-800/80 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 shadow-inner flex items-center justify-center">
                {/* Grass stripe pattern */}
                <div className="absolute inset-0 opacity-25 bg-[repeating-linear-gradient(90deg,transparent,transparent_40px,rgba(0,0,0,0.3)_40px,rgba(0,0,0,0.3)_80px)] pointer-events-none"></div>

                {/* Field Markings: Center Line, Circle, Boxes */}
                <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-emerald-400/40 -translate-x-1/2"></div>
                <div className="absolute top-1/2 left-1/2 w-20 h-20 rounded-full border-2 border-emerald-400/40 -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400/80 -translate-x-1/2 -translate-y-1/2"></div>

                {/* Left Penalty Box (Home) */}
                <div className="absolute top-1/2 left-0 w-16 h-28 border-r-2 border-y-2 border-emerald-400/40 -translate-y-1/2"></div>
                <div className="absolute top-1/2 left-0 w-6 h-14 border-r-2 border-y-2 border-emerald-400/40 -translate-y-1/2"></div>

                {/* Right Penalty Box (Away) */}
                <div className="absolute top-1/2 right-0 w-16 h-28 border-l-2 border-y-2 border-emerald-400/40 -translate-y-1/2"></div>
                <div className="absolute top-1/2 right-0 w-6 h-14 border-l-2 border-y-2 border-emerald-400/40 -translate-y-1/2"></div>

                {/* Corner arcs */}
                <div className="absolute top-0 left-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400/40 rounded-br-full"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400/40 rounded-tr-full"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400/40 rounded-bl-full"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400/40 rounded-tl-full"></div>

                {/* Active Attack Indicator / Ball Visual */}
                <div 
                  className={`absolute top-1/2 -translate-y-1/2 transition-all duration-700 ease-in-out ${
                    isHomeAttacking 
                      ? (intensity === 'dangerous' ? 'right-8' : 'right-28') 
                      : isAwayAttacking 
                        ? (intensity === 'dangerous' ? 'left-8' : 'left-28') 
                        : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-white border-2 border-slate-900 flex items-center justify-center shadow-lg shadow-black/80 animate-bounce">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-900"></div>
                    </div>
                    {/* Attack Pulse Aura */}
                    <div className="absolute -inset-2 rounded-full bg-[#00e701]/40 animate-ping"></div>
                  </div>
                </div>

                {/* Live Action Banner Overlay */}
                <div className="absolute bottom-2 inset-x-4 bg-black/75 backdrop-blur-sm border border-white/10 rounded-lg py-1.5 px-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#00e701] animate-ping"></span>
                    <span className="font-semibold text-white">
                      {isHomeAttacking
                        ? `${match.homeTeam} em ataque ${intensity === 'dangerous' ? 'perigoso!' : 'organizado'}`
                        : isAwayAttacking
                        ? `${match.awayTeam} pressionando ${intensity === 'dangerous' ? 'na área adversária!' : 'no meio-campo'}`
                        : 'Disputa de bola no centro do gramado'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[#00e701] uppercase font-bold">
                    {intensity === 'dangerous' ? '🔥 Perigo de Gol' : 'Tempo Real'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Match Statistics */}
          {activeTab === 'stats' && (
            <div className="p-4 bg-[#0a0d14] flex flex-col gap-3 text-xs">
              {/* Possession Bar */}
              <div>
                <div className="flex justify-between font-mono font-bold mb-1 text-slate-300">
                  <span>{match.stats.possessionHome}%</span>
                  <span className="text-slate-400 font-sans text-[11px]">Posse de Bola</span>
                  <span>{match.stats.possessionAway}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#1c2331] overflow-hidden flex">
                  <div 
                    className="bg-[#00e701] h-full transition-all duration-500" 
                    style={{ width: `${match.stats.possessionHome}%` }}
                  ></div>
                  <div 
                    className="bg-sky-500 h-full transition-all duration-500" 
                    style={{ width: `${match.stats.possessionAway}%` }}
                  ></div>
                </div>
              </div>

              {/* Stats Rows Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t border-[#21262d]">
                <div className="flex items-center justify-between py-1 border-b border-[#1c2331]">
                  <span className="font-mono font-bold text-white">{match.stats.shotsOnTargetHome}</span>
                  <span className="text-slate-400 text-[11px]">Finalizações no Alvo</span>
                  <span className="font-mono font-bold text-white">{match.stats.shotsOnTargetAway}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[#1c2331]">
                  <span className="font-mono font-bold text-white">{match.stats.shotsOffTargetHome}</span>
                  <span className="text-slate-400 text-[11px]">Finalizações Fora</span>
                  <span className="font-mono font-bold text-white">{match.stats.shotsOffTargetAway}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[#1c2331]">
                  <span className="font-mono font-bold text-white">{match.stats.cornersHome}</span>
                  <span className="text-slate-400 text-[11px]">Escanteios</span>
                  <span className="font-mono font-bold text-white">{match.stats.cornersAway}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[#1c2331]">
                  <span className="font-mono font-bold text-white">{match.stats.dangerousAttacksHome}</span>
                  <span className="text-slate-400 text-[11px]">Ataques Perigosos</span>
                  <span className="font-mono font-bold text-white">{match.stats.dangerousAttacksAway}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[#1c2331]">
                  <span className="font-mono font-bold text-amber-400">{match.stats.yellowCardsHome}</span>
                  <span className="text-slate-400 text-[11px]">Cartões Amarelos</span>
                  <span className="font-mono font-bold text-amber-400">{match.stats.yellowCardsAway}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[#1c2331]">
                  <span className="font-mono font-bold text-slate-300">{match.stats.foulsHome}</span>
                  <span className="text-slate-400 text-[11px]">Faltas Cometidas</span>
                  <span className="font-mono font-bold text-slate-300">{match.stats.foulsAway}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Event Commentary Feed */}
          {activeTab === 'events' && (
            <div className="p-3 bg-[#0a0d14] max-h-56 overflow-y-auto flex flex-col gap-2">
              {match.events.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  Ainda sem lances capitais registrados nesta partida.
                </div>
              ) : (
                match.events.map((ev) => (
                  <div 
                    key={ev.id}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-[#12161f] border border-[#21262d] text-xs"
                  >
                    <span className="px-1.5 py-0.5 rounded bg-[#1c2331] font-mono text-[10px] font-bold text-[#00e701] shrink-0">
                      {ev.minute}'
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 font-bold text-white">
                        {ev.type === 'goal' && '⚽ GOL!'}
                        {ev.type === 'yellow_card' && '🟨 Cartão Amarelo'}
                        {ev.type === 'red_card' && '🟥 Cartão Vermelho'}
                        {ev.type === 'corner' && '🚩 Escanteio'}
                        {ev.type === 'dangerous_attack' && '⚡ Lance Perigoso'}
                        <span className="text-slate-400 font-normal">({ev.team === 'home' ? match.homeTeam : match.awayTeam})</span>
                      </div>
                      <p className="text-slate-300 text-[11px] mt-0.5 leading-relaxed">
                        {ev.description}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {ev.timestamp}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
