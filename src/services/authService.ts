import { UserAccount, DepositRequest, WithdrawRequest, HouseSettings } from '../types/auth';

const USERS_STORAGE_KEY = 'betesporte_users_v1';
const CURRENT_USER_KEY = 'betesporte_current_user_v1';
const DEPOSIT_REQUESTS_KEY = 'betesporte_deposits_v1';
const WITHDRAW_REQUESTS_KEY = 'betesporte_withdrawals_v1';
const SETTINGS_KEY = 'betesporte_house_settings_v1';

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'user-admin-1',
    name: 'Gestão Administrativa PrimasBet',
    email: 'admin@primasbet.br',
    cpf: '000.000.000-00',
    phone: '(11) 99999-0000',
    role: 'admin',
    isVerified: true,
    status: 'active',
    wallet: {
      realBalance: 50000.00,
      bonusBalance: 0,
      currency: 'BRL',
    },
    dailyDepositLimit: 100000,
    createdAt: '01/01/2026',
  },
  {
    id: 'user-alex-2',
    name: 'Alexsander Otomeal',
    email: 'alexsander@primasbet.br',
    cpf: '123.456.789-00',
    phone: '(11) 98765-4321',
    role: 'user',
    isVerified: true,
    status: 'active',
    wallet: {
      realBalance: 250.00,
      bonusBalance: 50.00,
      currency: 'BRL',
    },
    dailyDepositLimit: 5000,
    createdAt: '15/02/2026',
  },
  {
    id: 'user-marcos-3',
    name: 'Marcos Vinicius',
    email: 'marcos.apostador@gmail.com',
    cpf: '234.567.890-11',
    phone: '(21) 97654-3210',
    role: 'user',
    isVerified: true,
    status: 'active',
    wallet: {
      realBalance: 120.00,
      bonusBalance: 30.00,
      currency: 'BRL',
    },
    dailyDepositLimit: 2000,
    createdAt: '20/03/2026',
  },
];

export const INITIAL_DEPOSIT_REQUESTS: DepositRequest[] = [
  {
    id: 'dep-req-101',
    userId: 'user-marcos-3',
    userName: 'Marcos Vinicius',
    userCpf: '234.567.890-11',
    amount: 150.00,
    bonusAmount: 150.00,
    txid: 'PIX-DEP-84920412',
    pixCode: '00020126580014br.gov.bcb.pix...',
    date: 'Hoje, 15:30',
    status: 'PENDING',
    endToEndId: 'E00038166202610051530a991823bc',
    notes: 'Aguardando validação de comprovante bancário',
  },
  {
    id: 'dep-req-102',
    userId: 'user-alex-2',
    userName: 'Alexsander Otomeal',
    userCpf: '123.456.789-00',
    amount: 250.00,
    bonusAmount: 50.00,
    txid: 'PIX-DEP-99128301',
    pixCode: '00020126580014br.gov.bcb.pix...',
    date: 'Hoje, 14:22',
    status: 'APPROVED',
    endToEndId: 'E00038166202610051422a8934dfb1',
    reviewedAt: 'Hoje, 14:23',
    reviewedBy: 'Admin PrimasBet',
  },
];

export const INITIAL_WITHDRAW_REQUESTS: WithdrawRequest[] = [
  {
    id: 'wdr-req-201',
    userId: 'user-marcos-3',
    userName: 'Marcos Vinicius',
    userCpf: '234.567.890-11',
    amount: 80.00,
    pixKeyType: 'CPF',
    pixKey: '234.567.890-11',
    date: 'Hoje, 15:40',
    status: 'PENDING',
    notes: 'Solicitação de saque via PIX direto',
  },
];

export const INITIAL_HOUSE_SETTINGS: HouseSettings = {
  minDeposit: 10.00,
  minWithdraw: 20.00,
  welcomeBonusEnabled: true,
  welcomeBonusPercent: 100,
  autoApproveSmallDeposits: false,
  autoApproveThreshold: 100.00,
  houseMarginPercent: 4.5,
  maintenanceMode: false,
};

export const loadUsers = (): UserAccount[] => {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_USERS;
};

export const saveUsers = (users: UserAccount[]): void => {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
};

export const loadCurrentUser = (): UserAccount | null => {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  // Default is null (logged out) so guest can register or login
  return null;
};

export const saveCurrentUser = (user: UserAccount | null): void => {
  try {
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  } catch {
    // ignore
  }
};

export const loadDepositRequests = (): DepositRequest[] => {
  try {
    const raw = localStorage.getItem(DEPOSIT_REQUESTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_DEPOSIT_REQUESTS;
};

export const saveDepositRequests = (reqs: DepositRequest[]): void => {
  try {
    localStorage.setItem(DEPOSIT_REQUESTS_KEY, JSON.stringify(reqs));
  } catch {
    // ignore
  }
};

export const loadWithdrawRequests = (): WithdrawRequest[] => {
  try {
    const raw = localStorage.getItem(WITHDRAW_REQUESTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_WITHDRAW_REQUESTS;
};

export const saveWithdrawRequests = (reqs: WithdrawRequest[]): void => {
  try {
    localStorage.setItem(WITHDRAW_REQUESTS_KEY, JSON.stringify(reqs));
  } catch {
    // ignore
  }
};

export const loadHouseSettings = (): HouseSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_HOUSE_SETTINGS;
};

export const saveHouseSettings = (settings: HouseSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
};
