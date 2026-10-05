import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  Check, 
  Trash2, 
  UserCheck, 
  UserX, 
  PlusCircle, 
  DollarSign, 
  Settings, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight,
  Sliders,
  Users,
  RefreshCw
} from 'lucide-react';
import { UserAccount, DepositRequest, WithdrawRequest, HouseSettings } from '../types/auth';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserAccount[];
  depositRequests: DepositRequest[];
  withdrawRequests: WithdrawRequest[];
  houseSettings: HouseSettings;
  onApproveDeposit: (requestId: string) => void;
  onRejectDeposit: (requestId: string) => void;
  onApproveWithdraw: (requestId: string) => void;
  onRejectWithdraw: (requestId: string) => void;
  onToggleUserStatus: (userId: string) => void;
  onManualCreditUser: (userId: string, amount: number) => void;
  onSaveHouseSettings: (newSettings: HouseSettings) => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  users,
  depositRequests,
  withdrawRequests,
  houseSettings,
  onApproveDeposit,
  onRejectDeposit,
  onApproveWithdraw,
  onRejectWithdraw,
  onToggleUserStatus,
  onManualCreditUser,
  onSaveHouseSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'deposits' | 'withdrawals' | 'users' | 'settings'>('deposits');
  const [searchUser, setSearchUser] = useState<string>('');
  
  // Settings form state
  const [settingsForm, setSettingsForm] = useState<HouseSettings>(houseSettings);
  const [settingsSuccess, setSettingsSuccess] = useState<boolean>(false);

  // Manual Credit Modal state
  const [creditUserId, setCreditUserId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState<string>('100');

  if (!isOpen) return null;

  const pendingDeposits = depositRequests.filter((d) => d.status === 'PENDING');
  const pendingWithdrawals = withdrawRequests.filter((w) => w.status === 'PENDING');

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.email.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.cpf.includes(searchUser)
  );

  const handleSaveSettings = () => {
    onSaveHouseSettings(settingsForm);
    setSettingsSuccess(true);
    setTimeout(() => setSettingsSuccess(false), 2500);
  };

  const handleExecuteCredit = () => {
    if (!creditUserId) return;
    const val = parseFloat(creditAmount);
    if (!isNaN(val) && val > 0) {
      onManualCreditUser(creditUserId, val);
      setCreditUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-extrabold text-white">
                  Painel de Gestão & Administração
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black font-extrabold text-[10px] uppercase">
                  MASTER BACKOFFICE
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Aprovação de depósitos PIX, liquidação de saques e controle de contas
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global KPI Summary Bar */}
        <div className="bg-[#0e121a] px-4 py-3 border-b border-[#21262d] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#161b22] p-2.5 rounded-xl border border-[#252d3d]">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Depósitos Pendentes
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-lg font-extrabold text-amber-400">
                {pendingDeposits.length}
              </span>
              <span className="text-[10px] text-slate-500">
                Total: R$ {pendingDeposits.reduce((acc, d) => acc + d.amount, 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="bg-[#161b22] p-2.5 rounded-xl border border-[#252d3d]">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Saques a Liquidar
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-lg font-extrabold text-sky-400">
                {pendingWithdrawals.length}
              </span>
              <span className="text-[10px] text-slate-500">
                Total: R$ {pendingWithdrawals.reduce((acc, w) => acc + w.amount, 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="bg-[#161b22] p-2.5 rounded-xl border border-[#252d3d]">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Contas de Usuários
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-lg font-extrabold text-white">
                {users.length}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold">
                {users.filter((u) => u.status === 'active').length} Ativos
              </span>
            </div>
          </div>

          <div className="bg-[#161b22] p-2.5 rounded-xl border border-[#252d3d]">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Margem da Casa (GGR)
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-lg font-extrabold text-[#00e701]">
                {houseSettings.houseMarginPercent}%
              </span>
              <span className="text-[10px] text-slate-400">
                Margem Padrão
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-[#161b22] px-4 py-2 border-b border-[#21262d] flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('deposits')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'deposits'
                ? 'bg-[#00e701] text-black shadow'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Aprovar Depósitos PIX</span>
            {pendingDeposits.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-400 text-black font-extrabold rounded-full text-[10px] font-mono">
                {pendingDeposits.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'withdrawals'
                ? 'bg-[#00e701] text-black shadow'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Aprovar Saques PIX</span>
            {pendingWithdrawals.length > 0 && (
              <span className="px-1.5 py-0.2 bg-sky-400 text-black font-extrabold rounded-full text-[10px] font-mono">
                {pendingWithdrawals.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'bg-[#00e701] text-black shadow'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Gestão de Contas ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-[#00e701] text-black shadow'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Configurações da Casa</span>
          </button>
        </div>

        {/* Tab 1: DEPOSITS APPROVAL */}
        {activeTab === 'deposits' && (
          <div className="p-4 overflow-y-auto flex flex-col gap-3 flex-1 text-xs">
            <div className="flex items-center justify-between text-slate-400 pb-1">
              <span>Lista de solicitações de depósitos via PIX para análise financeira:</span>
              <span className="font-mono text-[11px]">{depositRequests.length} solicitações no histórico</span>
            </div>

            {depositRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                Nenhuma solicitação de depósito registrada.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {depositRequests.map((dep) => {
                  const isPending = dep.status === 'PENDING';
                  const isApproved = dep.status === 'APPROVED';

                  return (
                    <div
                      key={dep.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isPending
                          ? 'bg-[#161b22] border-amber-500/40 ring-1 ring-amber-500/20'
                          : 'bg-[#131720] border-[#252d3d] opacity-90'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isPending ? 'bg-amber-500/20 text-amber-400' :
                            isApproved ? 'bg-emerald-500/20 text-[#00e701]' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            <DollarSign className="w-5 h-5 font-bold" />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{dep.userName}</span>
                              <span className="text-[11px] text-slate-400">CPF: {dep.userCpf}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isPending ? 'bg-amber-500/20 text-amber-300' :
                                isApproved ? 'bg-emerald-500/20 text-[#00e701]' : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {dep.status === 'PENDING' ? 'Aguardando Aprovação' : dep.status === 'APPROVED' ? 'Aprovado / Creditado' : 'Rejeitado'}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-slate-400 text-[11px] mt-1 font-mono">
                              <span>TXID: {dep.txid}</span>
                              <span>·</span>
                              <span>Data: {dep.date}</span>
                              {dep.endToEndId && (
                                <>
                                  <span>·</span>
                                  <span>E2E: {dep.endToEndId}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Amount & Actions */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-[#21262d]">
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-400 block uppercase">Valor Depositado</span>
                            <span className="font-mono text-base font-extrabold text-[#00e701]">
                              R$ {dep.amount.toFixed(2)}
                            </span>
                            {dep.bonusAmount > 0 && (
                              <span className="text-[10px] text-amber-400 block font-mono">
                                + R$ {dep.bonusAmount.toFixed(2)} Bônus
                              </span>
                            )}
                          </div>

                          {isPending && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => onApproveDeposit(dep.id)}
                                className="px-3 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase flex items-center gap-1 transition-all shadow-md shadow-[#00e701]/20 cursor-pointer"
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                                <span>Aprovar</span>
                              </button>

                              <button
                                onClick={() => onRejectDeposit(dep.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 border border-rose-600/40 hover:bg-rose-900/60 text-rose-300 font-bold text-xs uppercase flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                                <span>Rejeitar</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: WITHDRAWALS APPROVAL */}
        {activeTab === 'withdrawals' && (
          <div className="p-4 overflow-y-auto flex flex-col gap-3 flex-1 text-xs">
            <div className="flex items-center justify-between text-slate-400 pb-1">
              <span>Solicitações de resgate e liquidação via PIX:</span>
              <span className="font-mono text-[11px]">{withdrawRequests.length} solicitações</span>
            </div>

            {withdrawRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                Nenhuma solicitação de saque pendente.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {withdrawRequests.map((wdr) => {
                  const isPending = wdr.status === 'PENDING';
                  const isApproved = wdr.status === 'APPROVED';

                  return (
                    <div
                      key={wdr.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isPending
                          ? 'bg-[#161b22] border-sky-500/40 ring-1 ring-sky-500/20'
                          : 'bg-[#131720] border-[#252d3d] opacity-90'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isPending ? 'bg-sky-500/20 text-sky-400' :
                            isApproved ? 'bg-emerald-500/20 text-[#00e701]' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            <ArrowUpRight className="w-5 h-5 font-bold" />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{wdr.userName}</span>
                              <span className="text-[11px] text-slate-400">CPF: {wdr.userCpf}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isPending ? 'bg-sky-500/20 text-sky-300' :
                                isApproved ? 'bg-emerald-500/20 text-[#00e701]' : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {wdr.status === 'PENDING' ? 'Aguardando Envio SPI' : wdr.status === 'APPROVED' ? 'Liquidado via BACEN' : 'Rejeitado'}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-slate-400 text-[11px] mt-1 font-mono">
                              <span>Chave PIX: {wdr.pixKeyType} ({wdr.pixKey})</span>
                              <span>·</span>
                              <span>Data: {wdr.date}</span>
                            </div>
                          </div>
                        </div>

                        {/* Amount & Actions */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-[#21262d]">
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-400 block uppercase">Valor a Transferir</span>
                            <span className="font-mono text-base font-extrabold text-white">
                              R$ {wdr.amount.toFixed(2)}
                            </span>
                          </div>

                          {isPending && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => onApproveWithdraw(wdr.id)}
                                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black font-extrabold text-xs uppercase flex items-center gap-1 transition-all shadow-md cursor-pointer"
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                                <span>Liberar PIX</span>
                              </button>

                              <button
                                onClick={() => onRejectWithdraw(wdr.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 border border-rose-600/40 hover:bg-rose-900/60 text-rose-300 font-bold text-xs uppercase flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                                <span>Rejeitar</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: USERS MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="p-4 overflow-y-auto flex flex-col gap-3 flex-1 text-xs">
            {/* Search & Actions Bar */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar usuário por nome, email ou CPF..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>

              <span className="text-slate-400 font-mono text-[11px]">
                {filteredUsers.length} usuários listados
              </span>
            </div>

            {/* Table */}
            <div className="bg-[#161b22] border border-[#252d3d] rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#10141d] border-b border-[#21262d] text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2.5 px-3">Usuário</th>
                    <th className="py-2.5 px-3">CPF / Celular</th>
                    <th className="py-2.5 px-3">Perfil</th>
                    <th className="py-2.5 px-3 font-mono">Saldo Real</th>
                    <th className="py-2.5 px-3 font-mono">Saldo Bônus</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Ações Rápidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-[#1a202c] transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-white">{u.name}</div>
                        <div className="text-[10px] text-slate-400">{u.email}</div>
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                        <div>{u.cpf}</div>
                        <div className="text-[10px] text-slate-500">{u.phone}</div>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          u.role === 'admin'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-700 text-slate-300'
                        }`}>
                          {u.role === 'admin' ? 'Administrador' : 'Apostador'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-mono font-bold text-[#00e701]">
                        R$ {u.wallet.realBalance.toFixed(2)}
                      </td>

                      <td className="py-2.5 px-3 font-mono font-semibold text-amber-400">
                        R$ {u.wallet.bonusBalance.toFixed(2)}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          u.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {u.status === 'active' ? 'Ativo' : 'Bloqueado'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setCreditUserId(u.id)}
                            className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#00e701] font-semibold text-[11px] flex items-center gap-1 transition-colors"
                            title="Creditar saldo manual"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>+ Saldo</span>
                          </button>

                          <button
                            onClick={() => onToggleUserStatus(u.id)}
                            className={`p-1 rounded transition-colors ${
                              u.status === 'active'
                                ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40'
                                : 'text-emerald-400 hover:bg-emerald-950/40'
                            }`}
                            title={u.status === 'active' ? 'Bloquear conta' : 'Desbloquear conta'}
                          >
                            {u.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: HOUSE SETTINGS */}
        {activeTab === 'settings' && (
          <div className="p-4 sm:p-6 overflow-y-auto flex flex-col gap-4 flex-1 text-xs">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#00e701]" />
                Parâmetros Gerais da Casa de Apostas
              </span>
              <span className="text-[11px] text-slate-400">
                Ajustes financeiros, bônus e regras de pagamento
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Depósito Mínimo Permitido (R$):
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={settingsForm.minDeposit}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, minDeposit: parseFloat(e.target.value) || 10 })
                  }
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Saque Mínimo Permitido (R$):
                </label>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={settingsForm.minWithdraw}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, minWithdraw: parseFloat(e.target.value) || 20 })
                  }
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Margem da Casa (House Edge / Overround %):
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  step="0.5"
                  value={settingsForm.houseMarginPercent}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      houseMarginPercent: parseFloat(e.target.value) || 4.5,
                    })
                  }
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Bônus de Primeiro Depósito (%):
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="10"
                  value={settingsForm.welcomeBonusPercent}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      welcomeBonusPercent: parseFloat(e.target.value) || 100,
                    })
                  }
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[#21262d] flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsForm.welcomeBonusEnabled}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, welcomeBonusEnabled: e.target.checked })
                  }
                  className="rounded text-[#00e701] focus:ring-0"
                />
                <span className="text-slate-300 font-medium">
                  Ativar Bônus de Boas-Vindas para novos cadastros
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsForm.autoApproveSmallDeposits}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      autoApproveSmallDeposits: e.target.checked,
                    })
                  }
                  className="rounded text-[#00e701] focus:ring-0"
                />
                <span className="text-slate-300 font-medium">
                  Aprovação Automática SPI para depósitos menores que R$ 100,00
                </span>
              </label>
            </div>

            {settingsSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#00e701]" />
                <span>Configurações da casa salvas com sucesso!</span>
              </div>
            )}

            <button
              onClick={handleSaveSettings}
              className="w-full sm:w-auto self-end px-5 py-2.5 rounded-xl bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase tracking-wider cursor-pointer"
            >
              Salvar Alterações
            </button>
          </div>
        )}

        {/* Manual Credit Submodal */}
        {creditUserId && (
          <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 w-full max-w-xs shadow-2xl flex flex-col gap-3">
              <span className="text-sm font-bold text-white">Creditar Saldo Manual</span>
              <span className="text-xs text-slate-400">
                Adicione fundos para o usuário selecionado:
              </span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-slate-400">
                  R$
                </span>
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg pl-8 pr-3 py-1.5 text-sm font-mono text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setCreditUserId(null)}
                  className="flex-1 py-1.5 rounded-lg bg-[#21262d] text-white text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleExecuteCredit}
                  className="flex-1 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-bold text-xs"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-[#161b22] border-t border-[#21262d] px-4 py-2.5 flex items-center justify-between text-xs text-slate-400">
          <span>Ambiente de Produção BetEsporte · Acesso Restrito aos Administradores</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-medium"
          >
            Fechar Painel
          </button>
        </div>
      </div>
    </div>
  );
};
