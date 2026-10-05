import { UserWallet } from './betting';

export type UserRole = 'user' | 'admin';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  role: UserRole;
  isVerified: boolean;
  status: 'active' | 'blocked';
  wallet: UserWallet;
  dailyDepositLimit: number;
  createdAt: string;
}

export interface DepositRequest {
  id: string;
  userId: string;
  userName: string;
  userCpf: string;
  amount: number;
  bonusAmount: number;
  txid: string;
  pixCode: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  endToEndId: string;
  notes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface WithdrawRequest {
  id: string;
  userId: string;
  userName: string;
  userCpf: string;
  amount: number;
  pixKeyType: string;
  pixKey: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  endToEndId?: string;
  notes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface HouseSettings {
  minDeposit: number;
  minWithdraw: number;
  welcomeBonusEnabled: boolean;
  welcomeBonusPercent: number;
  autoApproveSmallDeposits: boolean;
  autoApproveThreshold: number;
  houseMarginPercent: number;
  maintenanceMode: boolean;
}
