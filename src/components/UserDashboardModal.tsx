import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Sliders,
  LogOut,
  CheckCircle2,
  Clock,
  Pencil,
  KeyRound,
  Landmark,
  Plus,
  Trash2,
  Star,
  FileCheck2,
  Upload,
  Bell,
  Gift,
  ShieldAlert,
} from 'lucide-react';
import type { UserAccount, UserBankAccount, UserKyc, NotificationItem, PixKeyType } from '../types/auth';
import {
  fetchBankAccounts,
  createBankAccount,
  deleteBankAccount,
  setDefaultBankAccount,
  fetchPreferences,
  savePreferences,
  fetchKyc,
  submitKyc,
  uploadKycDocument,
  fetchNotifications,
  markAllNotificationsRead,
  fetchReferralInfo,
  updateUserProfile,
  type BankAccountInput,
} from '../services/dataService';
import { changePassword } from '../services/auth';

interface UserDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  onUpdateLimit: (newLimit: number) => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenHistory: () => void;
  onLogout: () => void;
  /** Recarrega a conta do dominio apos editar o perfil. */
  onRefreshAccount?: () => Promise<void>;
}

type ProfileTab = 'painel' | 'perfil' | 'seguranca' | 'bancos' | 'kyc' | 'avisos';

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'painel', label: 'Painel' },
  { key: 'perfil', label: 'Meus dados' },
  { key: 'seguranca', label: 'Segurança' },
  { key: 'bancos', label: 'Dados bancários' },
  { key: 'kyc', label: 'Verificação' },
  { key: 'avisos', label: 'Avisos' },
];

const inputCls =
  'w-full bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none';

const emptyBankDraft = (): BankAccountInput & { pixKeyType: PixKeyType } => ({
  label: '',
  method: 'pix',
  pixKeyType: 'cpf',
  pixKey: '',
  holderName: '',
  holderDocument: '',
  bankName: '',
  bankAgency: '',
  bankAccount: '',
  accountType: 'corrente',
  isDefault: false,
});

export const UserDashboardModal: React.FC<UserDashboardModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateLimit,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenHistory,
  onLogout,
  onRefreshAccount,
}) => {
  const [tab, setTab] = useState<ProfileTab>('painel');

  // Painel / limite
  const [dailyLimit, setDailyLimit] = useState<string>(user?.dailyDepositLimit?.toString() || '5000');
  const [limitSavedMsg, setLimitSavedMsg] = useState(false);
  const [selfExclusion, setSelfExclusion] = useState('');

  // Meus dados
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [error, setError] = useState('');

  // Seguranca
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  // Bancos
  const [accounts, setAccounts] = useState<UserBankAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankDraft, setBankDraft] = useState(emptyBankDraft());
  const [bankMsg, setBankMsg] = useState('');

  // KYC
  const [kyc, setKyc] = useState<UserKyc | null>(null);
  const [kycType, setKycType] = useState('cpf');
  const [kycNumber, setKycNumber] = useState('');
  const [kycFile, setKycFile] = useState<File | null>(null);
  const [kycMsg, setKycMsg] = useState('');
  const [kycSubmitting, setKycSubmitting] = useState(false);

  // Avisos + indicacao
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referredCount, setReferredCount] = useState(0);

  const userId = user?.id;

  const loadAll = useCallback(async () => {
    if (!userId) return;
    setError('');
    try {
      const [prefs, banks, kycRow, notifs, ref] = await Promise.all([
        fetchPreferences(userId).catch(() => null),
        fetchBankAccounts(userId).catch(() => []),
        fetchKyc(userId).catch(() => null),
        fetchNotifications(userId).catch(() => []),
        fetchReferralInfo().catch(() => ({ referralCode: '', referredCount: 0, referredNames: [] })),
      ]);
      if (prefs) {
        if (prefs.dailyDepositLimit != null) setDailyLimit(String(prefs.dailyDepositLimit));
        setSelfExclusion(prefs.selfExclusionUntil ? prefs.selfExclusionUntil.slice(0, 10) : '');
      }
      setAccounts(banks);
      setKyc(kycRow);
      setNotifications(notifs);
      setReferralCode(ref.referralCode);
      setReferredCount(ref.referredCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar seus dados.');
    }
  }, [userId]);

  useEffect(() => {
    if (!isOpen) return;
    setTab('painel');
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
    setDailyLimit(user?.dailyDepositLimit?.toString() || '5000');
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const loadAccounts = async () => {
    if (!userId) return;
    setAccountsLoading(true);
    try {
      setAccounts(await fetchBankAccounts(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar contas.');
    } finally {
      setAccountsLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  const handleSaveLimit = async () => {
    const val = parseFloat(dailyLimit);
    if (isNaN(val) || val <= 0) return;
    onUpdateLimit(val);
    try {
      await savePreferences(user.id, {
        dailyDepositLimit: val,
        selfExclusionUntil: selfExclusion ? new Date(`${selfExclusion}T23:59:59`).toISOString() : null,
      });
      setLimitSavedMsg(true);
      setTimeout(() => setLimitSavedMsg(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar o limite.');
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg('');
    setError('');
    try {
      await updateUserProfile(user.id, { name, phone });
      setProfileMsg('Dados atualizados.');
      await onRefreshAccount?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar os dados.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPassMsg('');
    setError('');
    if (newPass !== confirmPass) {
      setError('As senhas novas não conferem.');
      return;
    }
    setSavingPass(true);
    try {
      await changePassword(user.email, curPass, newPass);
      setPassMsg('Senha alterada com sucesso.');
      setCurPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar a senha.');
    } finally {
      setSavingPass(false);
    }
  };

  const handleCreateBank = async () => {
    setBankMsg('');
    setError('');
    try {
      await createBankAccount(user.id, bankDraft);
      setBankDraft(emptyBankDraft());
      setShowBankForm(false);
      setBankMsg('Conta salva.');
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a conta.');
    }
  };

  const handleDeleteBank = async (id: string) => {
    try {
      await deleteBankAccount(id);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a conta.');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultBankAccount(id);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao definir conta padrão.');
    }
  };

  const handleSubmitKyc = async () => {
    setError('');
    setKycMsg('');
    if (!kycNumber.trim()) {
      setError('Informe o número do documento.');
      return;
    }
    setKycSubmitting(true);
    try {
      let documentUrl: string | undefined;
      if (kycFile) documentUrl = await uploadKycDocument(user.id, kycFile);
      await submitKyc(user.id, {
        documentType: kycType,
        documentNumber: kycNumber,
        documentUrl,
      });
      setKyc(await fetchKyc(user.id));
      setKycMsg('Documentos enviados para análise.');
      setKycFile(null);
      await onRefreshAccount?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar os documentos.');
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleReadAll = async () => {
    try {
      await markAllNotificationsRead(user.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao marcar avisos.');
    }
  };

  const unread = notifications.filter((n) => !n.readAt).length;

  const kycBadge = () => {
    const status = kyc?.status ?? user.kycStatus;
    if (status === 'approved') return { text: 'KYC aprovado', cls: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' };
    if (status === 'pending') return { text: 'KYC em análise', cls: 'bg-amber-500/20 border-amber-500/40 text-amber-300' };
    if (status === 'rejected') return { text: 'KYC rejeitado', cls: 'bg-rose-500/20 border-rose-500/40 text-rose-300' };
    return { text: 'KYC não enviado', cls: 'bg-slate-700 border-slate-600 text-slate-300' };
  };
  const badge = kycBadge();

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl text-slate-200 flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#00e701]/20 border border-[#00e701]/40 flex items-center justify-center text-[#00e701] font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="text-sm font-bold text-white block leading-tight">Painel do Apostador</span>
              <span className="text-[10px] text-slate-400">Gerencie seus dados, saldos e limites de jogo</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-3 pt-2 pb-1 flex items-center gap-1 overflow-x-auto bg-[#0f1319] border-b border-[#21262d] shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                tab === t.key ? 'bg-[#00e701] text-black' : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              {t.label}
              {t.key === 'avisos' && unread > 0 && (
                <span className="px-1 rounded-full bg-rose-500 text-white text-[9px]">{unread}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-600/40 text-rose-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ============ PAINEL ============ */}
          {tab === 'painel' && (
            <>
              <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-extrabold text-white">{user.name}</span>
                    <span className={`px-2 py-0.5 rounded border font-bold text-[10px] flex items-center gap-1 ${badge.cls}`}>
                      <ShieldCheck className="w-3 h-3" />
                      {badge.text}
                    </span>
                    {user.role === 'admin' && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
                        ADMINISTRADOR
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-[11px] mt-1 flex-wrap">
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
                  className="px-3 py-1.5 rounded-lg bg-rose-950/40 border border-rose-600/40 hover:bg-rose-900/60 text-rose-300 font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              </div>

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
                      className="flex-1 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>Depositar</span>
                    </button>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenWithdraw();
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 font-bold text-xs flex items-center justify-center gap-1"
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
                    className="w-full mt-3 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5"
                  >
                    <History className="w-3.5 h-3.5 text-[#00e701]" />
                    <span>Extrato Completo</span>
                  </button>
                </div>
              </div>

              <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-[#00e701]" />
                    Jogo Responsável & Limite Diário
                  </span>
                  <span className="text-[10px] text-slate-400">Proteção ao Jogador</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Limite máximo diário de depósito (R$):
                    </label>
                    <input type="number" min="50" step="50" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Autoexclusão até (opcional):
                    </label>
                    <input type="date" value={selfExclusion} onChange={(e) => setSelfExclusion(e.target.value)} className={inputCls} />
                  </div>
                </div>

                <button
                  onClick={handleSaveLimit}
                  className="self-start px-4 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-bold text-xs"
                >
                  Atualizar Limite
                </button>

                {limitSavedMsg && (
                  <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-[11px] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00e701]" />
                    <span>Limite diário atualizado com sucesso!</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ============ MEUS DADOS ============ */}
          {tab === 'perfil' && (
            <div className="flex flex-col gap-3 max-w-md">
              <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-3">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Pencil className="w-4 h-4 text-[#00e701]" /> Editar dados pessoais
                </span>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">Nome completo</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">Telefone</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">E-mail</span>
                  <input value={user.email} disabled className={`${inputCls} opacity-60`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">CPF</span>
                  <input value={user.cpf} disabled className={`${inputCls} opacity-60 font-mono`} />
                </label>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="self-start px-4 py-2 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase disabled:opacity-50"
                >
                  {savingProfile ? 'Salvando…' : 'Salvar'}
                </button>
                {profileMsg && <span className="text-emerald-400 text-[11px]">{profileMsg}</span>}
              </div>
            </div>
          )}

          {/* ============ SEGURANCA ============ */}
          {tab === 'seguranca' && (
            <div className="flex flex-col gap-3 max-w-md">
              <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-3">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#00e701]" /> Alterar senha
                </span>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">Senha atual</span>
                  <input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">Nova senha</span>
                  <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">Confirmar nova senha</span>
                  <input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} className={inputCls} />
                </label>
                <button
                  onClick={handleChangePassword}
                  disabled={savingPass || !curPass || !newPass}
                  className="self-start px-4 py-2 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase disabled:opacity-50"
                >
                  {savingPass ? 'Alterando…' : 'Alterar senha'}
                </button>
                {passMsg && <span className="text-emerald-400 text-[11px]">{passMsg}</span>}
                <span className="text-[10px] text-slate-500">Mínimo de 8 caracteres. Você será desconectado das outras sessões.</span>
              </div>
            </div>
          )}

          {/* ============ BANCOS ============ */}
          {tab === 'bancos' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-[#00e701]" /> Contas para saque
                </span>
                <button
                  onClick={() => setShowBankForm((v) => !v)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-bold text-[11px] flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova conta
                </button>
              </div>

              {bankMsg && <span className="text-emerald-400 text-[11px]">{bankMsg}</span>}

              {showBankForm && (
                <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-2.5 max-w-lg">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-300 font-semibold">Tipo</span>
                      <select
                        value={bankDraft.method}
                        onChange={(e) => setBankDraft({ ...bankDraft, method: e.target.value as 'pix' | 'bank_transfer' })}
                        className={inputCls}
                      >
                        <option value="pix">PIX</option>
                        <option value="bank_transfer">Conta bancária</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-300 font-semibold">Apelido</span>
                      <input value={bankDraft.label} onChange={(e) => setBankDraft({ ...bankDraft, label: e.target.value })} placeholder="Ex: Nubank" className={inputCls} />
                    </label>
                  </div>

                  {bankDraft.method === 'pix' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-300 font-semibold">Tipo de chave</span>
                        <select
                          value={bankDraft.pixKeyType}
                          onChange={(e) => setBankDraft({ ...bankDraft, pixKeyType: e.target.value as PixKeyType })}
                          className={inputCls}
                        >
                          <option value="cpf">CPF</option>
                          <option value="email">E-mail</option>
                          <option value="phone">Telefone</option>
                          <option value="random">Aleatória</option>
                          <option value="cnpj">CNPJ</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-300 font-semibold">Chave PIX</span>
                        <input value={bankDraft.pixKey} onChange={(e) => setBankDraft({ ...bankDraft, pixKey: e.target.value })} className={`${inputCls} font-mono`} />
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-300 font-semibold">Banco</span>
                        <input value={bankDraft.bankName} onChange={(e) => setBankDraft({ ...bankDraft, bankName: e.target.value })} className={inputCls} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-300 font-semibold">Agência</span>
                        <input value={bankDraft.bankAgency} onChange={(e) => setBankDraft({ ...bankDraft, bankAgency: e.target.value })} className={`${inputCls} font-mono`} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-300 font-semibold">Conta</span>
                        <input value={bankDraft.bankAccount} onChange={(e) => setBankDraft({ ...bankDraft, bankAccount: e.target.value })} className={`${inputCls} font-mono`} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-300 font-semibold">Tipo de conta</span>
                        <select value={bankDraft.accountType} onChange={(e) => setBankDraft({ ...bankDraft, accountType: e.target.value })} className={inputCls}>
                          <option value="corrente">Corrente</option>
                          <option value="poupanca">Poupança</option>
                        </select>
                      </label>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-300 font-semibold">Titular</span>
                      <input value={bankDraft.holderName} onChange={(e) => setBankDraft({ ...bankDraft, holderName: e.target.value })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-300 font-semibold">CPF/CNPJ do titular</span>
                      <input value={bankDraft.holderDocument} onChange={(e) => setBankDraft({ ...bankDraft, holderDocument: e.target.value })} className={`${inputCls} font-mono`} />
                    </label>
                  </div>

                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(bankDraft.isDefault)} onChange={(e) => setBankDraft({ ...bankDraft, isDefault: e.target.checked })} className="rounded" />
                    <span className="text-slate-300">Usar como conta padrão</span>
                  </label>

                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => setShowBankForm(false)} className="flex-1 py-2 rounded-lg bg-[#21262d] text-white font-semibold text-xs">Cancelar</button>
                    <button onClick={handleCreateBank} className="flex-1 py-2 rounded-lg bg-[#00e701] text-black font-extrabold text-xs">Salvar conta</button>
                  </div>
                </div>
              )}

              {accountsLoading ? (
                <div className="py-6 text-center text-slate-500">Carregando…</div>
              ) : accounts.length === 0 ? (
                <div className="py-6 text-center text-slate-500">Nenhuma conta salva ainda.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {accounts.map((acc) => (
                    <div key={acc.id} className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{acc.label || (acc.method === 'pix' ? 'PIX' : 'Conta bancária')}</span>
                          {acc.isDefault && (
                            <span className="px-1.5 py-0.5 rounded bg-[#00e701]/20 border border-[#00e701]/40 text-[#00e701] text-[9px] font-bold flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5" /> PADRÃO
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {acc.method === 'pix'
                            ? `${acc.pixKeyType?.toUpperCase()} · ${acc.pixKey}`
                            : `${acc.bankName} · Ag ${acc.bankAgency} · Cc ${acc.bankAccount}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!acc.isDefault && (
                          <button onClick={() => handleSetDefault(acc.id)} className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#00e701] text-[10px] font-bold" title="Definir como padrão">
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDeleteBank(acc.id)} className="px-2 py-1 rounded bg-rose-950/50 border border-rose-600/30 text-rose-300 text-[10px] font-bold" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============ KYC ============ */}
          {tab === 'kyc' && (
            <div className="flex flex-col gap-3 max-w-lg">
              <div className={`p-3 rounded-xl border flex items-center gap-2 ${badge.cls}`}>
                <FileCheck2 className="w-4 h-4" />
                <span className="font-bold">{badge.text}</span>
              </div>

              {kyc?.status === 'rejected' && kyc.notes && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-600/40 text-rose-300 text-[11px]">
                  Motivo da rejeição: {kyc.notes}
                </div>
              )}

              <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-4 flex flex-col gap-3">
                <span className="font-bold text-white">Enviar documentos</span>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">Tipo de documento</span>
                  <select value={kycType} onChange={(e) => setKycType(e.target.value)} className={inputCls}>
                    <option value="cpf">CPF</option>
                    <option value="rg">RG</option>
                    <option value="cnh">CNH</option>
                    <option value="passport">Passaporte</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">Número do documento</span>
                  <input value={kycNumber} onChange={(e) => setKycNumber(e.target.value)} className={`${inputCls} font-mono`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-300 font-semibold">Foto do documento</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setKycFile(e.target.files?.[0] ?? null)}
                    className="text-[11px] text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#21262d] file:text-white file:text-[11px] file:font-bold"
                  />
                </label>
                <button
                  onClick={handleSubmitKyc}
                  disabled={kycSubmitting || kyc?.status === 'approved'}
                  className="self-start px-4 py-2 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {kycSubmitting ? 'Enviando…' : 'Enviar para análise'}
                </button>
                {kycMsg && <span className="text-emerald-400 text-[11px]">{kycMsg}</span>}
              </div>
            </div>
          )}

          {/* ============ AVISOS ============ */}
          {tab === 'avisos' && (
            <div className="flex flex-col gap-3">
              <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3 flex items-center justify-between gap-3">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-amber-400" /> Indique e ganhe
                </span>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-[#00e701]">{referralCode || '—'}</span>
                  <span className="text-[10px] text-slate-400 block">{referredCount} indicado(s)</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-sky-400" /> Notificações
                </span>
                {unread > 0 && (
                  <button onClick={handleReadAll} className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold">
                    Marcar todas como lidas
                  </button>
                )}
              </div>

              {notifLoading ? (
                <div className="py-6 text-center text-slate-500">Carregando…</div>
              ) : notifications.length === 0 ? (
                <div className="py-6 text-center text-slate-500">Nenhuma notificação.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-xl p-3 border ${n.readAt ? 'bg-[#131720] border-[#252d3d] opacity-80' : 'bg-[#161b22] border-sky-500/40'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white">{n.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{n.createdAt}</span>
                      </div>
                      {n.message && <span className="text-[11px] text-slate-300 block mt-0.5">{n.message}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#161b22] border-t border-[#21262d] px-4 py-2.5 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>Cadastrado em {user.createdAt}</span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-medium">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserDashboardModal;
