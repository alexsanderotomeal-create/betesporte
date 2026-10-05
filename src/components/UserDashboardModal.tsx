import React, { useState } from 'react';
import { 
  X, 
  User, 
  ShieldCheck, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  History, 
  Sliders, 
  LogOut, 
  CheckCircle2, 
  AlertCircle,
  Clock
} from 'lucide-react';
import { UserAccount } from '../types/auth';

interface UserDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  onUpdateLimit: (newLimit: number) => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenHistory: () => void;
  onLogout: () => void;
}

export const UserDashboardModal: React.FC<UserDashboardModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateLimit,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenHistory,
  onLogout,
}) => {
  const [dailyLimit, setDailyLimit] = useState<string>(
    user?.dailyDepositLimit?.toString() || '5000'
  );
  const [limitSavedMsg, setLimitSavedMsg] = useState<boolean>(false);

  if (!isOpen || !user) return null;

  const handleSaveLimit = () => {
    const val = parseFloat(dailyLimit);
    if (!isNaN(val) && val > 0) {
      onUpdateLimit(val);
      setLimitSavedMsg(true);
      setTimeout(() => setLimitSavedMsg(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#00e701]/20 border border-[#00e701]/40 flex items-center justify-center text-[#00e701] font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="text-sm font-bold text-white block leading-tight">
                Painel do Apostador
              </span>
              <span className="text-[10px] text-slate-400">
                Gerencie seus dados, saldos e limites de jogo
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
          {/* User Profile Card */}
          <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-white">{user.name}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Conta Verificada
                </span>
                {user.role === 'admin' && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
                    ADMINISTRADOR
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-slate-400 text-[11px] mt-1">
                <span>CPF: {user.cpf}</span>
                <span>·</span>
                <span>{user.email}</span>
                <span>·</span>
                <span>{user.phone}</span>
              </div>
            </div>

            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-950/40 border border-rose-600/40 hover:bg-rose-900/60 text-rose-300 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>

          {/* Balance Breakdown & Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Saldo Real Disponível
                </span>
                <span className="font-mono text-2xl font-extrabold text-[#00e701]">
                  R$ {user.wallet.realBalance.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  100% liberado para saques ou apostas
                </span>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#21262d]">
                <button
                  onClick={() => {
                    onClose();
                    onOpenDeposit();
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Depositar</span>
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onOpenWithdraw();
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Sacar</span>
                </button>
              </div>
            </div>

            <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Saldo de Bônus & Promoções
                </span>
                <span className="font-mono text-2xl font-extrabold text-amber-400">
                  R$ {user.wallet.bonusBalance.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Válido para apostas esportivas múltiplas
                </span>
              </div>

              <button
                onClick={() => {
                  onClose();
                  onOpenHistory();
                }}
                className="w-full mt-3 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-[#00e701]" />
                <span>Extrato Completo</span>
              </button>
            </div>
          </div>

          {/* Responsible Gaming & Limits */}
          <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#00e701]" />
                Jogo Responsável & Limite Diário de Depósito
              </span>
              <span className="text-[10px] text-slate-400">Proteção ao Jogador</span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-slate-400 block mb-1">
                  Definir Limite Máximo Diário de Depósito (R$):
                </label>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="w-full bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-3 py-1.5 font-mono text-white text-xs focus:outline-none"
                />
              </div>

              <button
                onClick={handleSaveLimit}
                className="w-full sm:w-auto px-4 py-2 mt-4 sm:mt-3 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-bold text-xs cursor-pointer"
              >
                Atualizar Limite
              </button>
            </div>

            {limitSavedMsg && (
              <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-[11px] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00e701]" />
                <span>Limite diário atualizado com sucesso!</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#161b22] border-t border-[#21262d] px-4 py-2.5 flex items-center justify-between text-xs text-slate-400">
          <span>Cadastrado em {user.createdAt}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
