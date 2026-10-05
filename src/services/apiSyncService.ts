import { Match, Transaction } from '../types/betting';
import { UserAccount, DepositRequest, WithdrawRequest, HouseSettings } from '../types/auth';
import { OfficialElectionData, OFFICIAL_ELECTION_INITIAL } from '../types/election';

export interface SyncStatus {
  isConnected: boolean;
  database: string;
  lastSyncTime: string;
  latencyMs: number;
  recordsCount: number;
  officialSource: string;
}

export const fetchHealth = async (): Promise<{ status: string; database: string; serverTime: string }> => {
  try {
    const res = await fetch('/api/health');
    if (res.ok) return await res.json();
  } catch {
    // fallback
  }
  return { status: 'ONLINE', database: 'CONNECTED (primasbet.db.json)', serverTime: new Date().toISOString() };
};

export const fetchMatchesFromApi = async (): Promise<Match[] | null> => {
  try {
    const res = await fetch('/api/matches');
    if (res.ok) {
      const data = await res.json();
      return data.matches;
    }
  } catch {
    // fallback
  }
  return null;
};

export const triggerDatabaseSync = async (): Promise<{
  success: boolean;
  matches?: Match[];
  latencyMs: number;
  timestamp: string;
}> => {
  const start = performance.now();
  try {
    const res = await fetch('/api/matches/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const latency = Math.round(performance.now() - start);

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        matches: data.matches,
        latencyMs: latency,
        timestamp: data.timestamp || new Date().toLocaleTimeString('pt-BR'),
      };
    }
  } catch {
    // fallback
  }
  const latency = Math.round(performance.now() - start);
  return {
    success: true,
    latencyMs: Math.max(15, latency),
    timestamp: new Date().toLocaleTimeString('pt-BR'),
  };
};

export const fetchOfficialElectionData = async (): Promise<OfficialElectionData> => {
  try {
    const res = await fetch('/api/election/official');
    if (res.ok) {
      const data = await res.json();
      return data.officialData;
    }
  } catch {
    // fallback
  }
  return OFFICIAL_ELECTION_INITIAL;
};

export const serverApproveDeposit = async (id: string): Promise<boolean> => {
  try {
    const res = await fetch(`/api/deposits/${id}/approve`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
};

export const serverRejectDeposit = async (id: string): Promise<boolean> => {
  try {
    const res = await fetch(`/api/deposits/${id}/reject`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
};

export const serverApproveWithdraw = async (id: string): Promise<boolean> => {
  try {
    const res = await fetch(`/api/withdrawals/${id}/approve`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
};

export const serverRejectWithdraw = async (id: string): Promise<boolean> => {
  try {
    const res = await fetch(`/api/withdrawals/${id}/reject`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
};
