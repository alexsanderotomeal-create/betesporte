import React from 'react';
import { 
  Trophy, 
  Flame, 
  Clock, 
  Radio, 
  ChevronRight, 
  ShieldAlert
} from 'lucide-react';
import { SportId } from '../types/betting';

interface SportsSidebarProps {
  selectedSport: string;
  onSelectSport: (sport: string) => void;
  selectedLeague: string;
  onSelectLeague: (league: string) => void;
  liveMatchesCount: number;
  timeFilter: string;
  onSelectTimeFilter: (filter: string) => void;
}

export const SportsSidebar: React.FC<SportsSidebarProps> = ({
  selectedSport,
  onSelectSport,
  selectedLeague,
  onSelectLeague,
  liveMatchesCount,
  timeFilter,
  onSelectTimeFilter,
}) => {
  const sports = [
    { id: 'all', name: 'Todos os Esportes', icon: '🌐', count: 7 },
    { id: 'football', name: 'Futebol', icon: '⚽', count: 4 },
    { id: 'basketball', name: 'Basquete', icon: '🏀', count: 1 },
    { id: 'tennis', name: 'Tênis', icon: '🎾', count: 1 },
    { id: 'esports', name: 'E-Sports', icon: '🎮', count: 1 },
    { id: 'volleyball', name: 'Vôlei', icon: '🏐', count: 0 },
    { id: 'mma', name: 'MMA / UFC', icon: '🥊', count: 0 },
  ];

  const featuredLeagues = [
    { name: 'Brasileirão Série A', country: '🇧🇷 Brasil', sport: 'football' },
    { name: 'UEFA Champions League', country: '🇪🇺 Europa', sport: 'football' },
    { name: 'Premier League', country: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Inglaterra', sport: 'football' },
    { name: 'NBA', country: '🇺🇸 EUA', sport: 'basketball' },
    { name: 'CS2 Major Championship', country: '🌐 Internacional', sport: 'esports' },
    { name: 'ATP Masters 1000', country: '🌐 Tênis', sport: 'tennis' },
  ];

  return (
    <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-4 text-slate-300">
      {/* Quick Time Navigation Bar */}
      <div className="bg-[#12161f] border border-[#21262d] rounded-xl p-2.5 shadow-sm">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-1.5 mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-[#00e701]" /> Filtro de Horário
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {[
            { id: 'all', label: 'Tudo' },
            { id: 'live', label: 'Ao Vivo' },
            { id: 'today', label: 'Hoje' },
            { id: '3h', label: 'Próx 3h' },
            { id: 'tomorrow', label: 'Amanhã' },
            { id: 'hot', label: '🔥 Super Odds' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectTimeFilter(item.id)}
              className={`py-1.5 px-2 text-[11px] font-medium rounded-md transition-colors text-center truncate ${
                timeFilter === item.id
                  ? 'bg-[#00e701] text-black font-bold shadow'
                  : 'bg-[#161b22] text-slate-300 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ao Vivo Pulse Banner */}
      <button
        onClick={() => {
          onSelectSport('live');
          onSelectTimeFilter('live');
          onSelectLeague('all');
        }}
        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
          selectedSport === 'live' || timeFilter === 'live'
            ? 'bg-rose-950/40 border-rose-600/60 text-white shadow-md'
            : 'bg-[#12161f] border-[#21262d] hover:border-rose-500/50 text-slate-200'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-rose-400 flex items-center gap-1">
              AO VIVO AGORA
            </div>
            <div className="text-[10px] text-slate-400">Odds e estatísticas em tempo real</div>
          </div>
        </div>
        <span className="bg-rose-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded-full">
          {liveMatchesCount}
        </span>
      </button>

      {/* Principais Ligas / Destaques */}
      <div className="bg-[#12161f] border border-[#21262d] rounded-xl p-2.5">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 py-1 flex items-center gap-1.5 mb-1">
          <Trophy className="w-3 h-3 text-amber-400" /> Principais Ligas
        </div>
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onSelectLeague('all')}
            className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors text-left ${
              selectedLeague === 'all'
                ? 'bg-[#21262d] text-[#00e701] font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-[#161b22]'
            }`}
          >
            <span>Ver Todas as Ligas</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {featuredLeagues.map((league) => (
            <button
              key={league.name}
              onClick={() => {
                onSelectLeague(league.name);
                onSelectSport(league.sport);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors text-left ${
                selectedLeague === league.name
                  ? 'bg-[#21262d] text-[#00e701] font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#161b22]'
              }`}
            >
              <div className="flex flex-col truncate pr-2">
                <span className="truncate">{league.name}</span>
                <span className="text-[10px] text-slate-500">{league.country}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Modalidades Esportivas */}
      <div className="bg-[#12161f] border border-[#21262d] rounded-xl p-2.5">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 py-1 flex items-center gap-1.5 mb-1">
          <Flame className="w-3 h-3 text-[#00e701]" /> Esportes
        </div>
        <div className="flex flex-col gap-0.5">
          {sports.map((sp) => (
            <button
              key={sp.id}
              onClick={() => {
                onSelectSport(sp.id);
                onSelectLeague('all');
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors text-left ${
                selectedSport === sp.id
                  ? 'bg-[#21262d] text-[#00e701] font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-[#161b22]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-sm">{sp.icon}</span>
                <span>{sp.name}</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {sp.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Responsible Gaming Notice */}
      <div className="bg-[#12161f] border border-[#21262d] rounded-xl p-3 text-[11px] text-slate-400 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="text-slate-200 font-semibold block">Jogo Consciente</span>
          Proibido para menores de 18 anos. Aposte apenas o que pode arriscar.
        </div>
      </div>
    </aside>
  );
};
