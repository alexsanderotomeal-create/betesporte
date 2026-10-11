import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  User,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Save,
  PlusCircle,
  MinusCircle,
  Bell,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import { adminActions } from '../services/adminService';
import { getKycDocumentUrl } from '../services/dataService';
import type { AdminUserDetail } from '../types/auth';

interface AdminUserDetailModalProps {
  isOpen: boolean;
  userId: string | null;
  currentAdminId?: string;
  onClose: () => void;
  /** Avisa o painel para recarregar a lista de usuarios apos editar. */
  onChanged?: () => void;
}

type DetailTab =
  | 'overview'
  | 'edit'
  | 'wallet'
  | 'deposits'
  | 'withdrawals'
  | 'bets'
  | 'ledger'
  | 'kyc';

const TAB_LABELS: Record<DetailTab, string> = {
  overview: 'Visão geral',
  edit: 'Editar',
  wallet: 'Carteira',
  deposits: 'Depósitos',
  withdrawals: 'Saques',
  bets: 'Apostas',
  ledger: 'Extrato',
  kyc: 'KYC',
};

function money(value: unknown): string {
  return Number(value ?? 0).toFixed(2);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const AdminUserDetailModal: React.FC<AdminUserDetailModalProps> = ({
  isOpen,
  userId,
  currentAdminId,
  onClose,
  onChanged,
}) => {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DetailTab>('overview');
  const [busy, setBusy] = useState(false);

  // Formulario de edicao
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDoc, setEditDoc] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [editVerified, setEditVerified] = useState(false);
  const [editMsg, setEditMsg] = useState('');

  // Carteira
  const [amount, setAmount] = useState('100');
  const [reason, setReason] = useState('');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyMsg, setNotifyMsg] = useState('');

  // KYC
  const [kycNotes, setKycNotes] = useState('');
  const [kycDocUrl, setKycDocUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const data = await adminActions.getUserDetail(userId);
      setDetail(data);
      const p = data.profile;
      setEditName(p?.full_name ?? '');
      setEditPhone(p?.phone ?? '');
      setEditDoc(p?.document_number ?? '');
      setEditStatus(p?.status ?? 'active');
      setEditRole(p?.role === 'admin' || p?.role === 'super_admin' ? 'admin' : 'user');
      setEditVerified(Boolean(p?.is_verified));
      setKycNotes(data.kyc?.notes ?? '');
      setKycDocUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar o usuario.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isOpen && userId) {
      setTab('overview');
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  if (!isOpen || !userId) return null;

  const run = async (fn: () => Promise<unknown>, successMsg?: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (successMsg) setEditMsg(successMsg);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operação não concluída.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = () =>
    run(
      () =>
        adminActions.updateUser(userId, {
          full_name: editName.trim(),
          phone: editPhone.trim(),
          document_number: editDoc.trim(),
          status: editStatus,
          role: editRole,
          is_verified: editVerified,
        }),
      'Dados salvos.'
    );

  const p = detail?.profile;
  const w = detail?.wallet;

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col text-slate-200">
        {/* Header */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold shrink-0">
              {(p?.full_name ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-white block leading-tight truncate">
                {p?.full_name ?? 'Usuário'}
              </span>
              <span className="text-[10px] text-slate-400 truncate block">
                {p?.email ?? ''} · <span className="font-mono">{userId}</span>
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

        {/* Tabs */}
        <div className="px-3 pt-2 pb-1 flex items-center gap-1 overflow-x-auto bg-[#0f1319] border-b border-[#21262d] shrink-0">
          {(Object.keys(TAB_LABELS) as DetailTab[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                tab === key
                  ? 'bg-[#00e701] text-black'
                  : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto flex-1 text-xs">
          {loading && <div className="py-10 text-center text-slate-500">Carregando…</div>}
          {error && (
            <div className="mb-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-600/40 text-rose-300 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && detail && (
            <>
              {tab === 'overview' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Info label="Nome" value={p?.full_name ?? '—'} />
                  <Info label="E-mail" value={p?.email ?? '—'} />
                  <Info label="CPF" value={p?.document_number ?? '—'} mono />
                  <Info label="Telefone" value={p?.phone ?? '—'} mono />
                  <Info label="Perfil" value={p?.role ?? '—'} />
                  <Info label="Status" value={p?.status ?? '—'} />
                  <Info label="KYC" value={p?.kyc_status ?? 'não enviado'} />
                  <Info label="Verificado" value={p?.is_verified ? 'Sim' : 'Não'} />
                  <Info label="Código de indicação" value={p?.referral_code ?? '—'} mono />
                  <Info label="Indicado por" value={p?.referred_by ?? '—'} mono />
                  <Info label="Cadastro" value={formatDate(p?.created_at)} />
                </div>
              )}

              {tab === 'edit' && (
                <div className="flex flex-col gap-3 max-w-lg">
                  <Field label="Nome completo">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Telefone">
                    <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="CPF (documento)">
                    <input value={editDoc} onChange={(e) => setEditDoc(e.target.value)} className={`${inputCls} font-mono`} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Status da conta">
                      <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className={inputCls}>
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                        <option value="suspended">Suspenso</option>
                        <option value="banned">Banido</option>
                      </select>
                    </Field>
                    <Field label="Perfil">
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as 'user' | 'admin')}
                        className={inputCls}
                        disabled={userId === currentAdminId}
                      >
                        <option value="user">Apostador</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </Field>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editVerified}
                      onChange={(e) => setEditVerified(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-slate-300">Conta verificada (KYC aprovado)</span>
                  </label>
                  <button
                    onClick={handleSaveEdit}
                    disabled={busy}
                    className="self-start px-4 py-2 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Salvar alterações
                  </button>
                  {editMsg && <span className="text-emerald-400 text-[11px]">{editMsg}</span>}
                </div>
              )}

              {tab === 'wallet' && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Info label="Saldo real" value={`R$ ${money(w?.wallet_balance)}`} mono />
                    <Info label="Bônus" value={`R$ ${money(w?.bonus_balance)}`} mono />
                    <Info label="Bloqueado" value={`R$ ${money(w?.locked_balance)}`} mono />
                    <Info label="Rendimento" value={`R$ ${money(w?.yield_balance)}`} mono />
                  </div>

                  <div className="border-t border-[#21262d] pt-3 flex flex-col gap-2 max-w-md">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-[#00e701]" /> Ajuste manual de saldo
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className={`${inputCls} font-mono`}
                      />
                      <span className="text-slate-400">R$</span>
                    </div>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Motivo (opcional)"
                      className={inputCls}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          run(
                            () => adminActions.creditUser(userId, Number(amount)),
                            'Saldo creditado.'
                          )
                        }
                        disabled={busy || Number(amount) <= 0}
                        className="flex-1 py-2 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Creditar
                      </button>
                      <button
                        onClick={() =>
                          run(
                            () => adminActions.debitUser(userId, Number(amount), reason),
                            'Saldo debitado.'
                          )
                        }
                        disabled={busy || Number(amount) <= 0}
                        className="flex-1 py-2 rounded-lg bg-rose-950/60 border border-rose-600/40 hover:bg-rose-900/60 text-rose-300 font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <MinusCircle className="w-3.5 h-3.5" /> Debitar
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-[#21262d] pt-3 flex flex-col gap-2 max-w-md">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-sky-400" /> Enviar aviso ao usuário
                    </span>
                    <input
                      value={notifyTitle}
                      onChange={(e) => setNotifyTitle(e.target.value)}
                      placeholder="Título"
                      className={inputCls}
                    />
                    <input
                      value={notifyMsg}
                      onChange={(e) => setNotifyMsg(e.target.value)}
                      placeholder="Mensagem"
                      className={inputCls}
                    />
                    <button
                      onClick={() =>
                        run(
                          () => adminActions.sendNotification(userId, notifyTitle, notifyMsg),
                          'Aviso enviado.'
                        )
                      }
                      disabled={busy || !notifyTitle.trim()}
                      className="self-start px-3 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Bell className="w-3.5 h-3.5" /> Enviar
                    </button>
                  </div>
                </div>
              )}

              {tab === 'deposits' && (
                <Table
                  headers={['Data', 'Valor', 'Método', 'Status']}
                  rows={detail.deposits.map((d) => [
                    formatDate(d.created_at),
                    `R$ ${money(d.amount)}`,
                    d.method,
                    d.status,
                  ])}
                />
              )}

              {tab === 'withdrawals' && (
                <Table
                  headers={['Data', 'Valor', 'Destino', 'Status']}
                  rows={detail.withdrawals.map((d) => [
                    formatDate(d.created_at),
                    `R$ ${money(d.amount)}`,
                    d.destination_address,
                    d.status,
                  ])}
                />
              )}

              {tab === 'bets' && (
                <Table
                  headers={['Data', 'Tipo', 'Stake', 'Retorno', 'Status']}
                  rows={detail.bets.map((b) => [
                    formatDate(b.placed_at),
                    b.type,
                    `R$ ${money(b.stake)}`,
                    `R$ ${money(b.actual_return ?? b.potential_return)}`,
                    b.status,
                  ])}
                />
              )}

              {tab === 'ledger' && (
                <Table
                  headers={['Data', 'Tipo', 'Valor', 'Descrição']}
                  rows={detail.transactions.map((t) => [
                    formatDate(t.created_at),
                    t.type,
                    `R$ ${money(t.amount)}`,
                    t.description ?? '',
                  ])}
                />
              )}

              {tab === 'kyc' && (
                <div className="flex flex-col gap-3 max-w-lg">
                  {!detail.kyc && (
                    <div className="p-3 rounded-lg bg-[#161b22] border border-[#252d3d] text-slate-400">
                      <ShieldAlert className="w-4 h-4 inline mr-1" />
                      Este usuário ainda não enviou documentos de KYC.
                    </div>
                  )}
                  {detail.kyc && (
                    <>
                      <Info label="Status" value={detail.kyc.status} />
                      <Info label="Documento" value={`${detail.kyc.documentType} ${detail.kyc.documentNumber}`} mono />
                      <Info label="Enviado em" value={formatDate(detail.kyc.submittedAt)} />
                      {detail.kyc.reviewedAt && <Info label="Revisado em" value={formatDate(detail.kyc.reviewedAt)} />}
                      {detail.kyc.documentUrl && (
                        <button
                          onClick={async () => {
                            const url = await getKycDocumentUrl(detail.kyc!.documentUrl);
                            if (url) setKycDocUrl(url);
                            else setError('Não foi possível gerar o link do documento.');
                          }}
                          className="self-start px-3 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-bold flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" /> Ver documento
                        </button>
                      )}
                      {kycDocUrl && (
                        <a
                          href={kycDocUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 underline text-[11px] break-all"
                        >
                          {kycDocUrl}
                        </a>
                      )}
                    </>
                  )}

                  <input
                    value={kycNotes}
                    onChange={(e) => setKycNotes(e.target.value)}
                    placeholder="Observação da revisão (opcional)"
                    className={inputCls}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => run(() => adminActions.reviewKyc(userId, 'approved', kycNotes), 'KYC aprovado.')}
                      disabled={busy}
                      className="flex-1 py-2 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Aprovar
                    </button>
                    <button
                      onClick={() => run(() => adminActions.reviewKyc(userId, 'rejected', kycNotes), 'KYC rejeitado.')}
                      disabled={busy}
                      className="flex-1 py-2 rounded-lg bg-rose-950/60 border border-rose-600/40 hover:bg-rose-900/60 text-rose-300 font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Rejeitar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const inputCls =
  'w-full bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none';

const Info: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="bg-[#161b22] border border-[#252d3d] rounded-lg px-3 py-2">
    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">{label}</span>
    <span className={`text-slate-100 ${mono ? 'font-mono' : ''} break-all`}>{value}</span>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex flex-col gap-1">
    <span className="text-slate-300 font-semibold">{label}</span>
    {children}
  </label>
);

const Table: React.FC<{ headers: string[]; rows: (string | number)[][] }> = ({ headers, rows }) => (
  <div className="bg-[#161b22] border border-[#252d3d] rounded-xl overflow-hidden">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-[#10141d] border-b border-[#21262d] text-slate-400 text-[10px] uppercase font-bold tracking-wider">
          {headers.map((h) => (
            <th key={h} className="py-2 px-3">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[#21262d]">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="py-6 text-center text-slate-500">
              Nada por aqui.
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i} className="hover:bg-[#1a202c]">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3 font-mono text-[11px] text-slate-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export default AdminUserDetailModal;
