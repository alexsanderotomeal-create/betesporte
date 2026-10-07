import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Check,
  UserCheck,
  UserX,
  PlusCircle,
  DollarSign,
  Settings,
  CheckCircle2,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Sliders,
  Users,
  RefreshCw,
  Activity,
  Shield,
  Vote,
  Home,
  Trash2,
  Plus,
  Save
} from 'lucide-react';
import { UserAccount, DepositRequest, WithdrawRequest, HouseSettings } from '../types/auth';
import { BetTicket } from '../types/betting';
import { ElectionContest } from '../types/election';

export interface ElectionContestDraftInput {
  id?: string;
  title: string;
  scope?: 'PRESIDENT' | 'GOVERNOR';
  stateCode?: string | null;
  status?: 'OPEN' | 'SUSPENDED' | 'CLOSED';
}

export interface ElectionCandidateDraftInput {
  id?: string;
  contestId: string;
  name: string;
  party?: string | null;
  odds?: number;
  voteIntention?: number | null;
  pollSource?: string | null;
  pollDate?: string | null;
  sortOrder?: number;
}

interface AdminPanelPageProps {
  currentAdminId?: string;
  users: UserAccount[];
  /** Apostas de todos os usuarios, mais recentes primeiro (fila de liquidacao). */
  bets: BetTicket[];
  depositRequests: DepositRequest[];
  withdrawRequests: WithdrawRequest[];
  houseSettings: HouseSettings;
  electionContests: ElectionContest[];
  onApproveDeposit: (requestId: string) => void;
  onRejectDeposit: (requestId: string) => void;
  onApproveWithdraw: (requestId: string) => void;
  onRejectWithdraw: (requestId: string) => void;
  onToggleUserStatus: (userId: string) => void;
  onManualCreditUser: (userId: string, amount: number) => void;
  onSetUserRole: (userId: string, role: 'user' | 'admin') => void;
  onSaveHouseSettings: (newSettings: HouseSettings) => void;
  onSaveElectionOdd: (candidateId: string, odds: number) => Promise<void>;
  onSaveElectionContest?: (contest: ElectionContestDraftInput) => Promise<void>;
  onSaveElectionCandidate?: (candidate: ElectionCandidateDraftInput) => Promise<void>;
  onDeleteElectionCandidate?: (candidateId: string) => Promise<void>;
  onDeleteElectionContest?: (contestId: string) => Promise<void>;
  onSettleBet: (betId: string, result: 'WON' | 'LOST' | 'VOID') => void;
  onBack: () => void;
  isSyncing?: boolean;
  onTriggerSync?: () => void;
  onOpenApiSimulator?: () => void;
}

export const AdminPanelPage: React.FC<AdminPanelPageProps> = ({
  currentAdminId,
  users,
  bets,
  depositRequests,
  withdrawRequests,
  houseSettings,
  electionContests,
  onApproveDeposit,
  onRejectDeposit,
  onApproveWithdraw,
  onRejectWithdraw,
  onToggleUserStatus,
  onManualCreditUser,
  onSetUserRole,
  onSaveHouseSettings,
  onSaveElectionOdd,
  onSaveElectionContest,
  onSaveElectionCandidate,
  onDeleteElectionCandidate,
  onDeleteElectionContest,
  onSettleBet,
  onBack,
  isSyncing = false,
  onTriggerSync,
  onOpenApiSimulator,
}) => {
  const [activeTab, setActiveTab] = useState<
    'deposits' | 'withdrawals' | 'bets' | 'users' | 'settings' | 'elections'
  >('deposits');
  const [searchUser, setSearchUser] = useState<string>('');

  // Confirmacao em dois cliques para liquidar: dinheiro nao se clica por engano.
  const [settleConfirm, setSettleConfirm] = useState<string | null>(null);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<HouseSettings>(houseSettings);
  const [settingsSuccess, setSettingsSuccess] = useState<boolean>(false);

  // Editor de mercados eleitorais (nome, partido, intencao, poll, odd)
  interface CandidateDraft {
    name: string;
    party: string;
    voteIntention: string;
    pollSource: string;
    pollDate: string;
    odds: string;
  }
  const [candDrafts, setCandDrafts] = useState<Record<string, CandidateDraft>>({});
  const [newCandidates, setNewCandidates] = useState<Record<string, CandidateDraft[]>>({});
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [candSaving, setCandSaving] = useState<string | null>(null);
  const [candErrors, setCandErrors] = useState<Record<string, string>>({});
  const [delConfirm, setDelConfirm] = useState<string | null>(null);

  // Manual Credit Modal state
  const [creditUserId, setCreditUserId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState<string>('100');

  const pendingDeposits = depositRequests.filter((d) => d.status === 'pending');
  const pendingWithdrawals = withdrawRequests.filter((w) => w.status === 'pending');
  const openBets = bets.filter((b) => b.status === 'OPEN');
  // Em aberto no topo; dentro de cada grupo mantem a ordem (mais recente antes).
  const sortedBets = [...bets].sort(
    (a, b) => Number(b.status === 'OPEN') - Number(a.status === 'OPEN')
  );

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

  // --- Editor completo de mercados eleitorais ---

  const emptyCandidateDraft = (): CandidateDraft => ({
    name: '',
    party: '',
    voteIntention: '',
    pollSource: '',
    pollDate: '',
    odds: '2.00',
  });

  const draftForCandidate = (
    candidate: ElectionContest['candidates'][number]
  ): CandidateDraft =>
    candDrafts[candidate.id] ?? {
      name: candidate.name,
      party: candidate.party ?? '',
      voteIntention: candidate.voteIntention == null ? '' : String(candidate.voteIntention),
      pollSource: candidate.pollSource ?? '',
      pollDate: candidate.pollDate ?? '',
      odds: candidate.odds.toFixed(2),
    };

  const setCandidateDraftField = (
    candidateId: string,
    field: keyof CandidateDraft,
    value: string,
    fallback: CandidateDraft
  ) => {
    setCandDrafts(prev => ({
      ...prev,
      [candidateId]: { ...(prev[candidateId] ?? fallback), [field]: value },
    }));
  };

  const handleSaveCandidate = async (contest: ElectionContest, candidateId: string) => {
    const candidate = contest.candidates.find(c => c.id === candidateId);
    if (!candidate) return;
    const draft = candDrafts[candidateId] ?? draftForCandidate(candidate);

    const name = draft.name.trim();
    if (!name) {
      setCandErrors(prev => ({ ...prev, [candidateId]: 'Nome obrigatorio.' }));
      return;
    }

    const oddsRaw = draft.odds.trim();
    const odds = oddsRaw === '' ? candidate.odds : Number(oddsRaw);
    if (oddsRaw !== '' && (Number.isNaN(odds) || odds <= 1 || odds > 1000)) {
      setCandErrors(prev => ({ ...prev, [candidateId]: 'Odd entre 1.01 e 1000.' }));
      return;
    }

    const intentionRaw = draft.voteIntention.trim();
    const voteIntention = intentionRaw === '' ? null : Number(intentionRaw);
    if (
      intentionRaw !== '' &&
      (voteIntention == null || Number.isNaN(voteIntention) || voteIntention < 0 || voteIntention > 100)
    ) {
      setCandErrors(prev => ({ ...prev, [candidateId]: 'Intencao entre 0 e 100%.' }));
      return;
    }

    if (!onSaveElectionCandidate) {
      setCandErrors(prev => ({ ...prev, [candidateId]: 'Editor indisponivel.' }));
      return;
    }

    setCandErrors(prev => ({ ...prev, [candidateId]: '' }));
    setCandSaving(candidateId);
    try {
      await onSaveElectionCandidate({
        id: candidate.id,
        contestId: contest.id,
        name,
        party: draft.party.trim() || null,
        odds: oddsRaw === '' ? undefined : odds,
        voteIntention,
        pollSource: draft.pollSource.trim() || null,
        pollDate: draft.pollDate.trim() || null,
      });
      setCandDrafts(prev => {
        const next = { ...prev };
        delete next[candidateId];
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar o candidato.';
      setCandErrors(prev => ({ ...prev, [candidateId]: message }));
    } finally {
      setCandSaving(null);
    }
  };

  const setNewCandidateField = (
    contestId: string,
    index: number,
    field: keyof CandidateDraft,
    value: string
  ) => {
    setNewCandidates(prev => {
      const rows = [...(prev[contestId] ?? [emptyCandidateDraft()])];
      rows[index] = { ...(rows[index] ?? emptyCandidateDraft()), [field]: value };
      return { ...prev, [contestId]: rows };
    });
  };

  const handleCreateCandidate = async (contest: ElectionContest, index: number) => {
    const draft = (newCandidates[contest.id] ?? [])[index];
    if (!draft) return;
    if (!onSaveElectionCandidate) return;

    const name = draft.name.trim();
    if (!name) {
      setCandErrors(prev => ({ ...prev, [`new-${contest.id}-${index}`]: 'Nome obrigatorio.' }));
      return;
    }

    const odds = Number(draft.odds);
    if (Number.isNaN(odds) || odds <= 1 || odds > 1000) {
      setCandErrors(prev => ({ ...prev, [`new-${contest.id}-${index}`]: 'Odd entre 1.01 e 1000.' }));
      return;
    }

    const intentionRaw = draft.voteIntention.trim();
    const voteIntention = intentionRaw === '' ? null : Number(intentionRaw);
    if (intentionRaw !== '' && (Number.isNaN(voteIntention) || (voteIntention as number) < 0 || (voteIntention as number) > 100)) {
      setCandErrors(prev => ({ ...prev, [`new-${contest.id}-${index}`]: 'Intencao entre 0 e 100%.' }));
      return;
    }

    setCandErrors(prev => ({ ...prev, [`new-${contest.id}-${index}`]: '' }));
    setCandSaving(`new-${contest.id}-${index}`);
    try {
      await onSaveElectionCandidate({
        contestId: contest.id,
        name,
        party: draft.party.trim() || null,
        odds,
        voteIntention,
        pollSource: draft.pollSource.trim() || null,
        pollDate: draft.pollDate.trim() || null,
        sortOrder: contest.candidates.length + index + 1,
      });
      // A lista e recarregada pelo pai: remove a linha local para nao duplicar.
      setNewCandidates(prev => ({
        ...prev,
        [contest.id]: (prev[contest.id] ?? []).filter((_, i) => i !== index),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao criar candidato.';
      setCandErrors(prev => ({ ...prev, [`new-${contest.id}-${index}`]: message }));
    } finally {
      setCandSaving(null);
    }
  };

  const handleDeleteCandidate = async (candidateId: string) => {
    if (!onDeleteElectionCandidate) return;
    setCandSaving(candidateId);
    try {
      await onDeleteElectionCandidate(candidateId);
      setCandDrafts(prev => {
        const next = { ...prev };
        delete next[candidateId];
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao excluir candidato.';
      setCandErrors(prev => ({ ...prev, [candidateId]: message }));
    } finally {
      setCandSaving(null);
      setDelConfirm(null);
    }
  };

  const handleSaveTitle = async (contest: ElectionContest) => {
    if (!onSaveElectionContest) return;
    const title = (titleDrafts[contest.id] ?? contest.title).trim();
    if (!title) return;
    setCandSaving(`title-${contest.id}`);
    try {
      await onSaveElectionContest({ id: contest.id, title });
      setTitleDrafts(prev => {
        const next = { ...prev };
        delete next[contest.id];
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar o titulo.';
      setCandErrors(prev => ({ ...prev, [`title-${contest.id}`]: message }));
    } finally {
      setCandSaving(null);
    }
  };

  const handleDeleteContest = async (contestId: string) => {
    if (!onDeleteElectionContest) return;
    setCandSaving(`contest-${contestId}`);
    try {
      await onDeleteElectionContest(contestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao excluir o contesto.';
      setCandErrors(prev => ({ ...prev, [`contest-${contestId}`]: message }));
    } finally {
      setCandSaving(null);
      setDelConfirm(null);
    }
  };

  const handleExecuteCredit = () => {
    if (!creditUserId) return;
    const val = parseFloat(creditAmount);
    if (!isNaN(val) && val > 0) {
      onManualCreditUser(creditUserId, val);
      setCreditUserId(null);
    }
  };

  const handleToggleRole = (u: UserAccount) => {
    onSetUserRole(u.id, u.role === 'admin' ? 'user' : 'admin');
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col">
      {/* Page Header */}
      <div className="sticky top-0 z-40 bg-[#0d1117] border-b border-[#21262d] shadow-lg">
        <div className="max-w-[1720px] mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
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
                Página exclusiva de operação · Aprovação PIX, contas, PIX da casa e odds
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onTriggerSync && (
              <button
                onClick={onTriggerSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#00e701]/60 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                title="Sincronizar dados em tempo real com o banco de dados"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#00e701] ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSyncing ? 'Sincronizando...' : 'Sync API'}</span>
              </button>
            )}

            {onOpenApiSimulator && (
              <button
                onClick={onOpenApiSimulator}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#00e701]/50 text-slate-300 hover:text-white text-xs transition-colors"
                title="Hub de API de Terceiros & Simulador em Tempo Real"
              >
                <Activity className="w-3.5 h-3.5 text-[#00e701]" />
                <span className="hidden xl:inline font-medium">API Feed</span>
              </button>
            )}

            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black text-xs font-extrabold uppercase tracking-wide transition-colors cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Voltar ao Site</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-[1720px] mx-auto px-3 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto">
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
            onClick={() => setActiveTab('bets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'bets'
                ? 'bg-[#00e701] text-black shadow'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Liquidar Apostas</span>
            {openBets.length > 0 && (
              <span className="px-1.5 py-0.2 bg-[#00e701] text-black font-extrabold rounded-full text-[10px] font-mono">
                {openBets.length}
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

          <button
            onClick={() => setActiveTab('elections')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'elections'
                ? 'bg-[#00e701] text-black shadow'
                : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <Vote className="w-3.5 h-3.5" />
            <span>Mercados Eleitorais</span>
          </button>
        </div>
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

      <main className="flex-1 w-full px-4 py-4">
        {/* Tab 1: DEPOSITS APPROVAL */}
        {activeTab === 'deposits' && (
          <div className="flex flex-col gap-3 text-xs">
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
                  const isPending = dep.status === 'pending';
                  const isApproved = dep.status === 'approved';

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
                                {dep.status === 'pending' ? 'Aguardando Aprovação' : dep.status === 'approved' ? 'Aprovado / Creditado' : 'Rejeitado'}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-slate-400 text-[11px] mt-1 font-mono">
                              <span>TXID: {dep.txid || '—'}</span>
                              <span>·</span>
                              <span>Data: {dep.date}</span>
                              <span>·</span>
                              <span>Método: {dep.paymentMethod}</span>
                            </div>
                          </div>
                        </div>

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
          <div className="flex flex-col gap-3 text-xs">
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
                  const isPending = wdr.status === 'pending';
                  const isApproved = wdr.status === 'approved';

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
                                {wdr.status === 'pending' ? 'Aguardando Envio SPI' : wdr.status === 'approved' ? 'Liquidado via BACEN' : 'Rejeitado'}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-slate-400 text-[11px] mt-1 font-mono">
                              <span>Chave PIX: {wdr.pixKeyType} ({wdr.pixKey})</span>
                              <span>·</span>
                              <span>Data: {wdr.date}</span>
                            </div>
                          </div>
                        </div>

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

        {/* Tab 3: BET SETTLEMENT */}
        {activeTab === 'bets' && (
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex items-center justify-between text-slate-400 pb-1">
              <span>
                Apostas de todos os usuarios. Confirmar o resultado faz o servidor
                pagar (ou anular) e gravar no extrato do apostador.
              </span>
              <span className="font-mono text-[11px]">
                {openBets.length} em aberto · {bets.length} no histórico
              </span>
            </div>

            {bets.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                Nenhuma aposta registrada.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {sortedBets.map((bet) => {
                  const isOpen = bet.status === 'OPEN';
                  const owner = users.find((u) => u.id === bet.userId);
                  const first = bet.selections[0];
                  const summary = first
                    ? first.kind === 'election'
                      ? first.matchTitle
                      : `${first.homeTeam} x ${first.awayTeam}`
                    : '—';
                  const confirmKey =
                    settleConfirm?.split('|')[0] === bet.id ? settleConfirm : null;

                  return (
                    <div
                      key={bet.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isOpen
                          ? 'bg-[#161b22] border-[#00e701]/40 ring-1 ring-[#00e701]/10'
                          : 'bg-[#131720] border-[#252d3d] opacity-90'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isOpen ? 'bg-[#00e701]/15 text-[#00e701]' :
                            bet.status === 'WON' ? 'bg-emerald-500/20 text-emerald-400' :
                            bet.status === 'LOST' ? 'bg-rose-500/20 text-rose-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            <CheckCircle2 className="w-5 h-5 font-bold" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white text-sm">
                                {owner?.name ?? 'Usuario'}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isOpen ? 'bg-amber-500/20 text-amber-300' :
                                bet.status === 'WON' ? 'bg-emerald-500/20 text-emerald-400' :
                                bet.status === 'VOID' ? 'bg-slate-500/20 text-slate-300' :
                                bet.status === 'CASHED_OUT' ? 'bg-sky-500/20 text-sky-300' :
                                'bg-rose-500/20 text-rose-400'
                              }`}>
                                {bet.status === 'OPEN' ? 'Em aberto' :
                                 bet.status === 'WON' ? 'Ganha' :
                                 bet.status === 'VOID' ? 'Anulada' :
                                 bet.status === 'CASHED_OUT' ? 'Cash Out' : 'Perdida'}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {bet.date}
                              </span>
                            </div>

                            <div className="text-slate-400 text-[11px] mt-1">
                              {bet.selections.length}× {summary}
                              {bet.selections.length > 1 && (
                                <span className="font-mono"> · Odd {bet.totalOdd.toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-[#21262d]">
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-400 block uppercase">
                              {isOpen ? 'Pagar se ganhar' : 'Retorno'}
                            </span>
                            <span className="font-mono text-base font-extrabold text-[#00e701]">
                              R$ {bet.potentialReturn.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono">
                              Apostado R$ {bet.stake.toFixed(2)}
                            </span>
                          </div>

                          {isOpen && (
                            <div className="flex items-center gap-1.5">
                              {confirmKey ? (
                                <>
                                  <button
                                    onClick={() => {
                                      const result = confirmKey.split('|')[1] as
                                        | 'WON'
                                        | 'LOST'
                                        | 'VOID';
                                      setSettleConfirm(null);
                                      onSettleBet(bet.id, result);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase flex items-center gap-1 transition-all shadow-md shadow-[#00e701]/20 cursor-pointer"
                                  >
                                    <Check className="w-4 h-4 stroke-[3]" />
                                    <span>Confirmar</span>
                                  </button>
                                  <button
                                    onClick={() => setSettleConfirm(null)}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] hover:text-white text-slate-400 font-bold text-xs uppercase transition-colors cursor-pointer"
                                  >
                                    <span>Cancelar</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setSettleConfirm(`${bet.id}|WON`)}
                                    className="px-3 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase flex items-center gap-1 transition-all shadow-md shadow-[#00e701]/20 cursor-pointer"
                                  >
                                    <Check className="w-4 h-4 stroke-[3]" />
                                    <span>Ganhou</span>
                                  </button>
                                  <button
                                    onClick={() => setSettleConfirm(`${bet.id}|LOST`)}
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 border border-rose-600/40 hover:bg-rose-900/60 text-rose-300 font-bold text-xs uppercase flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <X className="w-4 h-4" />
                                    <span>Perdeu</span>
                                  </button>
                                  <button
                                    onClick={() => setSettleConfirm(`${bet.id}|VOID`)}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] hover:text-white text-slate-400 font-bold text-xs uppercase transition-colors cursor-pointer"
                                  >
                                    <span>Anular</span>
                                  </button>
                                </>
                              )}
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

        {/* Tab 4: USERS MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="flex flex-col gap-3 text-xs">
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
                            onClick={() => handleToggleRole(u)}
                            disabled={u.id === currentAdminId}
                            className={`px-2 py-1 rounded font-semibold text-[11px] flex items-center gap-1 transition-colors ${
                              u.role === 'admin'
                                ? 'bg-rose-950/60 text-rose-300 hover:bg-rose-900/60 border border-rose-600/40'
                                : 'bg-amber-950/60 text-amber-300 hover:bg-amber-900/60 border border-amber-500/40'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                            title={u.id === currentAdminId ? 'Você não pode rebaixar o próprio perfil' : (u.role === 'admin' ? 'Rebaixar para Apostador' : 'Promover a Administrador')}
                          >
                            <Shield className="w-3.5 h-3.5" />
                            <span>{u.role === 'admin' ? 'Rebaixar' : 'Promover'}</span>
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

        {/* Tab 5: HOUSE SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#00e701]" />
                Parâmetros Gerais da Casa de Apostas
              </span>
              <span className="text-[11px] text-slate-400">
                Ajustes financeiros, PIX da casa, bônus e regras de pagamento
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

            {/* Conta bancaria / PIX de deposito dos clientes */}
            <div className="pt-3 border-t border-[#21262d] flex flex-col gap-3">
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-[#00e701]" />
                <span className="font-bold text-white text-sm">
                  Conta Bancária & PIX para Depósitos dos Clientes
                </span>
              </div>
              <span className="text-[11px] text-slate-400 leading-relaxed">
                Os dados abaixo alimentam o QR Code 'copia e cola' exibido aos clientes no
                depósito. Altere a chave PIX, o nome e a cidade do recebedor conforme a conta
                bancária da casa.
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Chave PIX do recebedor:
                  </label>
                  <input
                    type="text"
                    value={settingsForm.pixKey}
                    onChange={(e) => setSettingsForm({ ...settingsForm, pixKey: e.target.value })}
                    placeholder="email@banco.com.br"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Nome do recebedor (max 25 chars):
                  </label>
                  <input
                    type="text"
                    maxLength={25}
                    value={settingsForm.pixMerchantName}
                    onChange={(e) => setSettingsForm({ ...settingsForm, pixMerchantName: e.target.value })}
                    placeholder="NOME DA EMPRESA PIX"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Cidade do recebedor (max 15 chars):
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={settingsForm.pixMerchantCity}
                    onChange={(e) => setSettingsForm({ ...settingsForm, pixMerchantCity: e.target.value })}
                    placeholder="SAO PAULO"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Banco:
                  </label>
                  <input
                    type="text"
                    value={settingsForm.bankName}
                    onChange={(e) => setSettingsForm({ ...settingsForm, bankName: e.target.value })}
                    placeholder="Nubank"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Agência:
                  </label>
                  <input
                    type="text"
                    value={settingsForm.bankAgency}
                    onChange={(e) => setSettingsForm({ ...settingsForm, bankAgency: e.target.value })}
                    placeholder="0001"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Conta:
                  </label>
                  <input
                    type="text"
                    value={settingsForm.bankAccount}
                    onChange={(e) => setSettingsForm({ ...settingsForm, bankAccount: e.target.value })}
                    placeholder="000000-0"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>
              </div>
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

        {/* Tab 6: MERCADOS ELEITORAIS */}
        {activeTab === 'elections' && (
          <div className="max-w-4xl flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                <Vote className="w-4 h-4 text-amber-400" />
                Mercados Eleitorais - edição completa
              </span>
              <span className="text-[11px] text-slate-400">
                Nome, partido, intenção de voto, fonte e cotação
              </span>
            </div>

            <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 text-[11px] text-slate-300 leading-relaxed">
              A cotação é <span className="text-white font-bold">preço da casa</span> e muda aqui, com
              registro em <span className="font-mono">election_odds_history</span>. A{' '}
              <span className="text-white font-bold">intenção de voto (%)</span> é dado informativo
              (apuração oficial ou pesquisa com fonte e data) — mostrado ao apostador, sem virar
              sugestão de aposta. Escopo: presidente e governador.
            </div>

            {electionContests.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                Nenhum mercado eleitoral aberto. Verifique as migrations ou o seed 0006.
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {electionContests.map(contest => {
                  const titleDraft = titleDrafts[contest.id] ?? contest.title;
                  const newRows = newCandidates[contest.id] ?? [];

                  return (
                    <div
                      key={contest.id}
                      className="bg-[#0d1117] border border-[#252d3d] rounded-xl p-3 flex flex-col gap-3"
                    >
                      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1 w-full">
                          <input
                            value={titleDraft}
                            onChange={e =>
                              setTitleDrafts(prev => ({ ...prev, [contest.id]: e.target.value }))
                            }
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveTitle(contest);
                            }}
                            className="flex-1 min-w-0 bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-2 py-1.5 text-white text-[12px] font-bold focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveTitle(contest)}
                            disabled={candSaving === `title-${contest.id}` || !titleDraft.trim()}
                            className="px-2.5 py-1.5 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-bold text-[11px] shrink-0 disabled:opacity-40"
                            title="Salvar título"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                              contest.status === 'OPEN'
                                ? 'text-emerald-300 border-emerald-500/40 bg-emerald-950/40'
                                : 'text-slate-400 border-slate-600 bg-slate-900'
                            }`}
                          >
                            {contest.status}
                          </span>
                          {contest.electionDate && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {contest.electionDate}
                            </span>
                          )}
                          {onDeleteElectionContest && (
                            <>
                              {delConfirm === contest.id ? (
                                <span className="flex items-center gap-1 text-[10px] text-rose-300">
                                  Excluir contesto?
                                  <button
                                    onClick={() => handleDeleteContest(contest.id)}
                                    className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-bold text-[10px]"
                                    disabled={candSaving === `contest-${contest.id}`}
                                  >
                                    Sim
                                  </button>
                                  <button
                                    onClick={() => setDelConfirm(null)}
                                    className="px-1.5 py-0.5 rounded bg-slate-700 text-white font-bold text-[10px]"
                                  >
                                    Não
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setDelConfirm(contest.id)}
                                  className="px-2 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30"
                                  title="Excluir contesto"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        {candErrors[`title-${contest.id}`] && (
                          <span className="text-[11px] text-rose-400">
                            {candErrors[`title-${contest.id}`]}
                          </span>
                        )}
                      </div>

                      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
                        <div className="hidden lg:grid grid-cols-[1fr_150px_60px_100px_100px_110px_40px_90px] gap-2 px-3 py-1.5 border-b border-[#21262d] text-[9px] uppercase tracking-wide text-slate-500 font-bold">
                          <span>Candidato</span>
                          <span>Partido</span>
                          <span>Intenção %</span>
                          <span>Fonte</span>
                          <span>Data</span>
                          <span>Odd atual</span>
                          <span></span>
                          <span>Ações</span>
                        </div>

                        {contest.candidates.map(candidate => {
                          const draft = draftForCandidate(candidate);
                          const key = candidate.id;
                          const error = candErrors[key];
                          const saving = candSaving === key;

                          return (
                            <div
                              key={key}
                              className="border-b border-[#1a2128] last:border-b-0"
                            >
                              <div className="flex flex-col lg:grid lg:grid-cols-[1fr_150px_60px_100px_100px_110px_40px_90px] gap-2 px-3 py-2">
                                <input
                                  value={draft.name}
                                  onChange={e =>
                                    setCandidateDraftField(key, 'name', e.target.value, draft)
                                  }
                                  className="bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-2 py-1 text-white text-[12px] focus:outline-none min-w-0"
                                  placeholder="Nome do candidato"
                                />
                                <input
                                  value={draft.party}
                                  onChange={e =>
                                    setCandidateDraftField(key, 'party', e.target.value, draft)
                                  }
                                  className="bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-2 py-1 text-white text-[12px] focus:outline-none min-w-0"
                                  placeholder="Partido"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={draft.voteIntention}
                                  onChange={e =>
                                    setCandidateDraftField(key, 'voteIntention', e.target.value, draft)
                                  }
                                  className="bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-2 py-1 text-white font-mono text-[12px] focus:outline-none min-w-0"
                                  placeholder="0-100"
                                />
                                <input
                                  value={draft.pollSource}
                                  onChange={e =>
                                    setCandidateDraftField(key, 'pollSource', e.target.value, draft)
                                  }
                                  className="bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-2 py-1 text-white text-[12px] focus:outline-none min-w-0"
                                  placeholder="TSE / Instituto"
                                />
                                <input
                                  type="date"
                                  value={draft.pollDate}
                                  onChange={e =>
                                    setCandidateDraftField(key, 'pollDate', e.target.value, draft)
                                  }
                                  className="bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-2 py-1 text-white text-[12px] focus:outline-none min-w-0"
                                />
                                <div className="flex items-center gap-1.5 justify-end lg:justify-start">
                                  <input
                                    type="number"
                                    min="1.01"
                                    max="1000"
                                    step="0.01"
                                    value={draft.odds}
                                    onChange={e =>
                                      setCandidateDraftField(key, 'odds', e.target.value, draft)
                                    }
                                    className="w-full bg-[#10141d] border border-[#30363d] focus:border-[#00e701] rounded-lg px-2 py-1 text-white font-mono text-[12px] focus:outline-none min-w-0"
                                  />
                                </div>
                                <div className="flex items-center gap-1 justify-end shrink-0">
                                  <button
                                    onClick={() => handleSaveCandidate(contest, key)}
                                    disabled={saving}
                                    className="px-2 py-1 rounded-lg bg-[#00e701] hover:bg-[#00c901] text-black font-bold text-[10px] shrink-0 disabled:opacity-40"
                                    title="Salvar candidato"
                                  >
                                    {saving ? '...' : <Save className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                                <div className="flex items-center gap-1 justify-end shrink-0">
                                  {onDeleteElectionCandidate && (
                                    <button
                                      onClick={() => setDelConfirm(`cand-${key}`)}
                                      className="px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 shrink-0"
                                      title="Excluir candidato"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                {error && (
                                  <span className="col-span-full text-[11px] text-rose-400">
                                    {error}
                                  </span>
                                )}
                              </div>
                              {delConfirm === `cand-${key}` && (
                                <div className="px-3 pb-2 flex items-center gap-2 text-[10px] text-rose-300">
                                  Excluir "{candidate.name}"?
                                  <button
                                    onClick={() => handleDeleteCandidate(key)}
                                    disabled={saving}
                                    className="px-2 py-0.5 rounded bg-rose-500 text-white font-bold text-[10px]"
                                  >
                                    {saving ? '...' : 'Excluir'}
                                  </button>
                                  <button
                                    onClick={() => setDelConfirm(null)}
                                    className="px-2 py-0.5 rounded bg-slate-700 text-white font-bold text-[10px]"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {newRows.length === 0 && (
                          <button
                            onClick={() =>
                              setNewCandidates(prev => ({
                                ...prev,
                                [contest.id]: [...(prev[contest.id] ?? []), emptyCandidateDraft()],
                              }))
                            }
                            className="w-full px-3 py-2 text-left text-[11px] text-[#00e701] font-semibold flex items-center gap-1.5 hover:bg-[#11161f]"
                          >
                            <PlusCircle className="w-3.5 h-3.5" /> Adicionar candidato
                          </button>
                        )}

                        {newRows.map((row, index) => (
                          <div
                            key={`new-${contest.id}-${index}`}
                            className="border-t border-[#1a2128]"
                          >
                            <div className="flex flex-col lg:grid lg:grid-cols-[1fr_150px_60px_100px_100px_110px_40px_90px] gap-2 px-3 py-2">
                              <input
                                value={row.name}
                                onChange={e =>
                                  setNewCandidateField(contest.id, index, 'name', e.target.value)
                                }
                                className="bg-[#10141d] border border-emerald-600/40 focus:border-[#00e701] rounded-lg px-2 py-1 text-white text-[12px] focus:outline-none min-w-0"
                                placeholder="Novo candidato"
                              />
                              <input
                                value={row.party}
                                onChange={e =>
                                  setNewCandidateField(contest.id, index, 'party', e.target.value)
                                }
                                className="bg-[#10141d] border border-emerald-600/40 focus:border-[#00e701] rounded-lg px-2 py-1 text-white text-[12px] focus:outline-none min-w-0"
                                placeholder="Partido"
                              />
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={row.voteIntention}
                                onChange={e =>
                                  setNewCandidateField(
                                    contest.id,
                                    index,
                                    'voteIntention',
                                    e.target.value
                                  )
                                }
                                className="bg-[#10141d] border border-emerald-600/40 focus:border-[#00e701] rounded-lg px-2 py-1 text-white font-mono text-[12px] focus:outline-none min-w-0"
                                placeholder="0-100"
                              />
                              <input
                                value={row.pollSource}
                                onChange={e =>
                                  setNewCandidateField(contest.id, index, 'pollSource', e.target.value)
                                }
                                className="bg-[#10141d] border border-emerald-600/40 focus:border-[#00e701] rounded-lg px-2 py-1 text-white text-[12px] focus:outline-none min-w-0"
                                placeholder="TSE / Instituto"
                              />
                              <input
                                type="date"
                                value={row.pollDate}
                                onChange={e =>
                                  setNewCandidateField(contest.id, index, 'pollDate', e.target.value)
                                }
                                className="bg-[#10141d] border border-emerald-600/40 focus:border-[#00e701] rounded-lg px-2 py-1 text-white text-[12px] focus:outline-none min-w-0"
                              />
                              <input
                                type="number"
                                min="1.01"
                                max="1000"
                                step="0.01"
                                value={row.odds}
                                onChange={e =>
                                  setNewCandidateField(contest.id, index, 'odds', e.target.value)
                                }
                                className="bg-[#10141d] border border-emerald-600/40 focus:border-[#00e701] rounded-lg px-2 py-1 text-white font-mono text-[12px] focus:outline-none min-w-0"
                              />
                              <div className="flex items-center gap-1 justify-end shrink-0">
                                <button
                                  onClick={() => handleCreateCandidate(contest, index)}
                                  disabled={candSaving === `new-${contest.id}-${index}`}
                                  className="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[10px] shrink-0 disabled:opacity-40"
                                  title="Criar candidato"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="flex items-center justify-end shrink-0">
                                <button
                                  onClick={() =>
                                    setNewCandidates(prev => ({
                                      ...prev,
                                      [contest.id]: (prev[contest.id] ?? []).filter(
                                        (_, i) => i !== index
                                      ),
                                    }))
                                  }
                                  className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white shrink-0"
                                  title="Descartar linha"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {candErrors[`new-${contest.id}-${index}`] && (
                                <span className="col-span-full text-[11px] text-rose-400">
                                  {candErrors[`new-${contest.id}-${index}`]}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

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
    </div>
  );
};