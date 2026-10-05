import React, { useState } from 'react';
import { 
  Zap, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Eye, 
  EyeOff, 
  Activity, 
  Settings, 
  History, 
  Search, 
  Menu, 
  X,
  ShieldCheck,
  Radio,
  User,
  Shield,
  LogOut,
  Sliders,
  Sparkles,
  RefreshCw,
  Database
} from 'lucide-react';
import { UserWallet } from '../types/betting';
import { UserAccount } from '../types/auth';

interface HeaderProps {
  wallet: UserWallet;
  currentUser: UserAccount | null;
  liveMatchesCount: number;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenApiModal: () => void;
  onOpenHistory: () => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenDashboard: () => void;
  onOpenAdminPanel: () => void;
  onLogout: () => void;
  pendingDepositsCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeSportFilter: string;
  onSelectSport: (sport: string) => void;
  oddsFormat: 'decimal' | 'fractional' | 'american';
  onOddsFormatChange: (f: 'decimal' | 'fractional' | 'american') => void;
  autoAcceptOdds: boolean;
  onToggleAutoAcceptOdds: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string;
  onTriggerSync?: () => void;
  onOpenElectionOfficial?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  wallet,
  currentUser,
  liveMatchesCount,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenApiModal,
  onOpenHistory,
  onOpenAuth,
  onOpenDashboard,
  onOpenAdminPanel,
  onLogout,
  pendingDepositsCount,
  searchQuery,
  onSearchChange,
  activeSportFilter,
  onSelectSport,
  oddsFormat,
  onOddsFormatChange,
  autoAcceptOdds,
  onToggleAutoAcceptOdds,
  isSyncing = false,
  lastSyncTime = 'Agora',
  onTriggerSync,
  onOpenElectionOfficial,
}) => {
  const [showBalance, setShowBalance] = useState(true);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0d1117] border-b border-[#21262d] shadow-lg">
      {/* Top Branding & Main Controls Bar */}
      <div className="max-w-[1720px] mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <a href="#" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00e701] to-[#00a801] flex items-center justify-center shadow-md shadow-[#00e701]/20 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 text-black font-extrabold fill-black" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-xl font-extrabold tracking-tight text-white font-sans">
                  PRIMAS<span className="text-[#00e701]">BET</span>
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#00e701]/10 text-[#00e701] border border-[#00e701]/30 rounded">
                  PRO
                </span>
              </div>
              <span className="text-[9px] text-slate-400 -mt-1 hidden sm:block tracking-wide">
                Apostas Esportivas & Políticas
              </span>
            </div>
          </a>
        </div>

        {/* Global Search Bar */}
        <div className="hidden md:flex flex-1 max-w-md mx-2">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar times, ligas, eleições ou candidatos..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button 
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* User Balance, Admin Panel, Database Sync & Auth */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Official TSE Anti-Fake News Badge Button */}
          {onOpenElectionOfficial && (
            <button
              onClick={onOpenElectionOfficial}
              className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 hover:bg-emerald-900/40 text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
              title="Ver dados oficiais registrados no TSE e checagem anti-fake news"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#00e701]" />
              <span>Dados TSE Oficiais</span>
            </button>
          )}

          {/* Database Sync Button */}
          {onTriggerSync && (
            <button
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#00e701]/60 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              title={`Sincronizar dados em tempo real com o banco de dados oficial (Última sincronização: ${lastSyncTime})`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00e701] ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isSyncing ? 'Sincronizando...' : 'Sync API'}
              </span>
            </button>
          )}

          {/* Admin Panel Quick Access Button */}
          <button
            onClick={onOpenAdminPanel}
            className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
              currentUser?.role === 'admin'
                ? 'bg-amber-950/40 border-amber-500/50 text-amber-300 hover:bg-amber-900/50 shadow-sm'
                : 'bg-[#161b22] border-[#30363d] text-slate-300 hover:text-white'
            }`}
            title="Acessar Painel de Controle Administrativo"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Admin</span>
            {pendingDepositsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-400 text-black font-extrabold rounded-full text-[10px] font-mono animate-pulse">
                {pendingDepositsCount}
              </span>
            )}
          </button>

          {/* API Integration / Simulator Status Button */}
          <button
            onClick={onOpenApiModal}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#00e701]/50 text-slate-300 hover:text-white text-xs transition-colors"
            title="Configurar Integração de API Esportiva / Simulador em Tempo Real"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e701] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00e701]"></span>
            </span>
            <Activity className="w-3.5 h-3.5 text-[#00e701]" />
            <span className="hidden xl:inline font-medium">API Feed</span>
          </button>

          {/* User Wallet Balance Box */}
          <div className="flex items-center bg-[#161b22] border border-[#30363d] rounded-lg px-2 sm:px-3 py-1.5 gap-2">
            <div className="flex flex-col text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Saldo Real
                </span>
                <button
                  onClick={() => setShowBalance(!showBalance)}
                  className="text-slate-400 hover:text-white"
                  title={showBalance ? "Ocultar Saldo" : "Mostrar Saldo"}
                >
                  {showBalance ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
              </div>
              <div className="font-mono text-xs sm:text-sm font-bold text-[#00e701] leading-tight">
                {showBalance ? formatCurrency(wallet.realBalance) : '••••••'}
              </div>
              {wallet.bonusBalance > 0 && showBalance && (
                <div className="text-[10px] text-amber-400 font-mono leading-none mt-0.5">
                  + {formatCurrency(wallet.bonusBalance)} Bônus
                </div>
              )}
            </div>

            <div className="hidden sm:block w-[1px] h-6 bg-[#30363d] mx-1"></div>

            {/* Quick Deposit & Withdraw Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenDeposit}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#00e701] hover:bg-[#00c901] active:bg-[#00aa01] text-black font-bold text-xs uppercase tracking-wide transition-all shadow-sm shadow-[#00e701]/20 cursor-pointer"
              >
                <ArrowDownLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="hidden sm:inline">Depositar</span>
                <span className="sm:hidden">PIX</span>
              </button>

              <button
                onClick={onOpenWithdraw}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                title="Sacar via PIX"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                <span>Sacar</span>
              </button>
            </div>
          </div>

          {/* User Auth / Profile Dropdown */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-slate-500 text-slate-200 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-[#00e701]/20 border border-[#00e701]/40 flex items-center justify-center text-[#00e701] font-bold text-xs">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:flex flex-col text-left">
                  <span className="text-xs font-bold text-white truncate max-w-[100px] leading-tight">
                    {currentUser.name.split(' ')[0]}
                  </span>
                  <span className="text-[9px] text-[#00e701] uppercase font-semibold">
                    {currentUser.role === 'admin' ? 'Admin' : 'Apostador'}
                  </span>
                </div>
              </button>

              {userDropdownOpen && (
                <div 
                  className="absolute right-0 mt-2 w-56 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  onClick={() => setUserDropdownOpen(false)}
                >
                  <div className="px-3 py-2 border-b border-[#21262d]">
                    <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{currentUser.email}</div>
                    <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                      CPF: {currentUser.cpf}
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={onOpenDashboard}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-200 hover:bg-[#21262d] rounded-lg transition-colors text-left"
                    >
                      <User className="w-3.5 h-3.5 text-[#00e701]" />
                      <span>Meu Painel & Limites</span>
                    </button>

                    <button
                      onClick={onOpenHistory}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-200 hover:bg-[#21262d] rounded-lg transition-colors text-left"
                    >
                      <History className="w-3.5 h-3.5 text-slate-400" />
                      <span>Extrato & Transações PIX</span>
                    </button>

                    <button
                      onClick={onOpenAdminPanel}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-amber-300 hover:bg-[#21262d] rounded-lg transition-colors text-left font-semibold"
                    >
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span>Painel de Gestão Admin</span>
                    </button>
                  </div>

                  <div className="border-t border-[#21262d] pt-1">
                    <button
                      onClick={onLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Encerrar Sessão</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onOpenAuth('login')}
                className="px-3 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Entrar
              </button>
              <button
                onClick={() => onOpenAuth('register')}
                className="px-3 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black text-xs font-extrabold uppercase transition-all shadow-sm cursor-pointer"
              >
                Cadastrar
              </button>
            </div>
          )}

          {/* Quick Odds Settings */}
          <div className="relative">
            <button
              onClick={() => setSettingsDropdownOpen(!settingsDropdownOpen)}
              className="p-2 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-slate-500 text-slate-300 hover:text-white transition-colors"
              aria-label="Configurações de Odds"
            >
              <Settings className="w-4 h-4" />
            </button>

            {settingsDropdownOpen && (
              <div 
                className="absolute right-0 mt-2 w-52 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                onClick={() => setSettingsDropdownOpen(false)}
              >
                <div className="px-3 py-1.5 border-b border-[#21262d]">
                  <div className="text-xs font-semibold text-white">Preferências</div>
                </div>

                <div className="py-2 px-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Regra de Cotações
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleAutoAcceptOdds();
                    }}
                    className="w-full flex items-center justify-between text-xs py-1 text-slate-300"
                  >
                    <span>Aceitar mudanças</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${autoAcceptOdds ? 'bg-[#00e701]/20 text-[#00e701]' : 'bg-[#21262d] text-slate-400'}`}>
                      {autoAcceptOdds ? 'Sempre' : 'Perguntar'}
                    </span>
                  </button>

                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-2.5 mb-1">
                    Formato de Odds
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['decimal', 'fractional', 'american'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOddsFormatChange(fmt);
                        }}
                        className={`text-[10px] py-1 font-semibold rounded text-center capitalize transition-colors ${oddsFormat === fmt ? 'bg-[#00e701] text-black font-bold' : 'bg-[#21262d] text-slate-400 hover:text-white'}`}
                      >
                        {fmt === 'decimal' ? 'Dec (1.8)' : fmt === 'fractional' ? 'Frac (4/5)' : 'Amer (+120)'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-Navigation Categories Bar */}
      <div className="bg-[#12161f] border-t border-[#21262d] px-3 sm:px-6 py-2 overflow-x-auto">
        <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-4">
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => onSelectSport('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeSportFilter === 'all' 
                  ? 'bg-[#00e701] text-black shadow-sm' 
                  : 'text-slate-300 hover:text-white hover:bg-[#1a202c]'
              }`}
            >
              <span>Todos os Esportes</span>
            </button>

            <button
              onClick={() => onSelectSport('live')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeSportFilter === 'live' 
                  ? 'bg-rose-600 text-white shadow-sm' 
                  : 'text-rose-400 hover:text-rose-300 hover:bg-[#1a202c]'
              }`}
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>AO VIVO</span>
              {liveMatchesCount > 0 && (
                <span className="px-1.5 py-0.2 bg-black/40 rounded-full text-[10px] font-mono">
                  {liveMatchesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectSport('politics')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeSportFilter === 'politics' 
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-md' 
                  : 'text-amber-300 hover:text-white hover:bg-[#1a202c]'
              }`}
            >
              <span>🗳️ Eleições Presidenciais</span>
              <span className="px-1 py-0.2 bg-amber-950/60 text-amber-200 border border-amber-400/40 rounded text-[9px] font-extrabold uppercase">
                Em Alta
              </span>
            </button>

            <button
              onClick={() => onSelectSport('football')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeSportFilter === 'football' 
                  ? 'bg-[#00e701] text-black shadow-sm' 
                  : 'text-slate-300 hover:text-white hover:bg-[#1a202c]'
              }`}
            >
              ⚽ Futebol
            </button>

            <button
              onClick={() => onSelectSport('basketball')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeSportFilter === 'basketball' 
                  ? 'bg-[#00e701] text-black shadow-sm' 
                  : 'text-slate-300 hover:text-white hover:bg-[#1a202c]'
              }`}
            >
              🏀 Basquete
            </button>

            <button
              onClick={() => onSelectSport('tennis')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeSportFilter === 'tennis' 
                  ? 'bg-[#00e701] text-black shadow-sm' 
                  : 'text-slate-300 hover:text-white hover:bg-[#1a202c]'
              }`}
            >
              🎾 Tênis
            </button>

            <button
              onClick={() => onSelectSport('esports')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeSportFilter === 'esports' 
                  ? 'bg-[#00e701] text-black shadow-sm' 
                  : 'text-slate-300 hover:text-white hover:bg-[#1a202c]'
              }`}
            >
              🎮 E-Sports
            </button>
          </nav>

          <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00e701]" />
              Licenciado e Seguro
            </span>
            <span>·</span>
            <span className="text-amber-400 font-semibold">18+ Jogue com Responsabilidade</span>
          </div>
        </div>
      </div>
    </header>
  );
};
