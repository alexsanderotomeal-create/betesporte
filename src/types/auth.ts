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
  /** Status do KYC no banco (null quando nunca enviado). */
  kycStatus?: string | null;
}

export type PixKeyType = 'cpf' | 'email' | 'phone' | 'random' | 'cnpj';

export interface UserBankAccount {
  id: string;
  userId: string;
  label: string;
  method: 'pix' | 'bank_transfer';
  pixKeyType: PixKeyType | null;
  pixKey: string;
  holderName: string;
  holderDocument: string;
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  accountType: string;
  isDefault: boolean;
  createdAt: string;
}

export type KycStatus = 'pending' | 'approved' | 'rejected';

export interface UserKyc {
  userId: string;
  documentType: string;
  documentNumber: string;
  documentUrl: string;
  selfieUrl: string;
  status: KycStatus;
  notes: string;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface UserPreferences {
  dailyDepositLimit: number | null;
  selfExclusionUntil: string | null;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface ActivityLogItem {
  id: string;
  userId: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
}

export interface ReferralInfo {
  referralCode: string;
  referredCount: number;
  referredNames: string[];
}

/** Detalhe completo montado pela Edge Function get_user_detail. */
export interface AdminUserDetail {
  profile: {
    id: string;
    user_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    document_number: string | null;
    role: 'user' | 'admin' | 'super_admin';
    status: string;
    is_verified: boolean;
    kyc_status: string | null;
    referral_code: string | null;
    referred_by: string | null;
    created_at: string;
  } | null;
  wallet: {
    wallet_balance: number;
    bonus_balance: number;
    yield_balance: number;
    locked_balance: number;
  } | null;
  deposits: {
    id: string;
    amount: number;
    status: string;
    method: string;
    created_at: string;
  }[];
  withdrawals: {
    id: string;
    amount: number;
    status: string;
    method: string;
    destination_address: string;
    created_at: string;
  }[];
  bets: {
    id: string;
    type: string;
    status: string;
    stake: number;
    potential_return: number;
    actual_return: number | null;
    placed_at: string;
  }[];
  transactions: {
    id: string;
    type: string;
    amount: number;
    description: string | null;
    created_at: string;
  }[];
  kyc: UserKyc | null;
  bankAccounts: UserBankAccount[];
}

/**
 * Status de pedido. Minusculo porque e assim que o banco guarda: deposits.status
 * e withdrawals.status sao TEXT com default 'pending' e 13 pedidos historicos
 * ja gravados como 'approved'/'rejected'. Um union maiusculo aqui obrigaria a
 * traduzir em cada ponto e a UI pararia de achar os pedidos antigos.
 */
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface DepositRequest {
  id: string;
  userId: string;
  userName: string;
  userCpf: string;
  amount: number;
  bonusAmount: number;
  /** transaction_id do PIX. Vazio quando o usuario ainda nao informou. */
  txid: string;
  /** payment_method como veio do banco ("PIX", "Mercado Pago (PIX)", ...). */
  paymentMethod: string;
  date: string;
  status: RequestStatus;
  notes?: string;
  /** Endereco da carteira de origem informado pelo cliente (depositos USDT). */
  walletAddress?: string;
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
  status: RequestStatus;
  notes?: string;
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
  /** Se o deposito via PIX esta habilitado para os clientes (painel da casa). */
  pixEnabled: boolean;
  /** Tipo da chave PIX no QR de deposito: auto/random/phone/email/cpf/cnpj. */
  pixKeyType: string;
  /** Chave PIX que os clientes veem no QR de deposito. Vem de system_settings. */
  pixKey: string;
  /** Nome do recebedor exibido no PIX (limitado a 25 chars pelo EMV). */
  pixMerchantName: string;
  /** Cidade do recebedor no payload PIX (limitado a 15 chars). */
  pixMerchantCity: string;
  /** Dados da conta bancaria para transferencias manuais. */
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  /** Se o deposito por carteira USDT (BEP-20 / BNB Smart Chain) esta habilitado. */
  usdtEnabled: boolean;
  /** Endereco da carteira BEP-20 (BNB Smart Chain) da casa onde o cliente envia USDT. */
  usdtWalletAddress: string;
  /** Cotacao interna: reais necessarios por 1 USDT (ex.: 5.20 = R$5,20 por USDT). */
  usdtRate: number;
}
