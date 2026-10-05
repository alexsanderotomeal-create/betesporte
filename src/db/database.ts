import fs from 'fs';
import path from 'path';
import { Match, BetTicket, Transaction } from '../types/betting';
import { UserAccount, DepositRequest, WithdrawRequest, HouseSettings } from '../types/auth';
import { INITIAL_MATCHES } from '../data/mockMatches';
import { INITIAL_USERS, INITIAL_DEPOSIT_REQUESTS, INITIAL_WITHDRAW_REQUESTS, INITIAL_HOUSE_SETTINGS } from '../services/authService';

import { OfficialElectionData, OFFICIAL_ELECTION_INITIAL } from '../types/election';

export type { OfficialElectionData };
export { OFFICIAL_ELECTION_INITIAL };

export interface DatabaseSchema {
  version: number;
  users: UserAccount[];
  matches: Match[];
  tickets: BetTicket[];
  depositRequests: DepositRequest[];
  withdrawRequests: WithdrawRequest[];
  transactions: Transaction[];
  houseSettings: HouseSettings;
  electionOfficial: OfficialElectionData;
  syncHistory: {
    timestamp: string;
    provider: string;
    status: string;
    recordsUpdated: number;
    latencyMs: number;
  }[];
}

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'primasbet.db.json');

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDirectory();
    this.data = this.load();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[DB] Erro ao carregar primasbet.db.json, gerando base inicial:', err);
    }

    const initialData: DatabaseSchema = {
      version: 1,
      users: INITIAL_USERS,
      matches: INITIAL_MATCHES,
      tickets: [],
      depositRequests: INITIAL_DEPOSIT_REQUESTS,
      withdrawRequests: INITIAL_WITHDRAW_REQUESTS,
      transactions: [],
      houseSettings: INITIAL_HOUSE_SETTINGS,
      electionOfficial: OFFICIAL_ELECTION_INITIAL,
      syncHistory: [
        {
          timestamp: new Date().toISOString(),
          provider: 'TSE / Football Data Bridge',
          status: 'SUCCESS',
          recordsUpdated: INITIAL_MATCHES.length,
          latencyMs: 18,
        },
      ],
    };

    this.save(initialData);
    return initialData;
  }

  private save(data: DatabaseSchema) {
    try {
      this.ensureDirectory();
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[DB] Erro ao salvar banco de dados:', err);
    }
  }

  public getData(): DatabaseSchema {
    return this.data;
  }

  public updateData(mutator: (data: DatabaseSchema) => void): DatabaseSchema {
    mutator(this.data);
    this.save(this.data);
    return this.data;
  }
}

export const db = new Database();
