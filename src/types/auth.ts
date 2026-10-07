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
}
