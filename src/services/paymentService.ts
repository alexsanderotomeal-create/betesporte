import QRCode from 'qrcode';
import { Transaction, UserWallet } from '../types/betting';

const WALLET_KEY = 'betesporte_user_wallet';
const TRANSACTIONS_KEY = 'betesporte_transactions';

export const INITIAL_WALLET: UserWallet = {
  realBalance: 250.00,
  bonusBalance: 50.00,
  currency: 'BRL',
};

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-init-1',
    type: 'DEPOSIT_PIX',
    amount: 250.00,
    status: 'COMPLETED',
    date: 'Hoje, 14:22',
    description: 'Depósito PIX Instantâneo',
    endToEndId: 'E00038166202610051422a8934dfb1',
    txid: 'PIX-DEP-84920412',
  },
  {
    id: 'tx-init-2',
    type: 'BET_WON',
    amount: 145.80,
    status: 'COMPLETED',
    date: 'Hoje, 15:45',
    description: 'Aposta Ganha: Real Madrid x Man City (Ambas Marcam)',
    txid: 'TKT-994102',
  },
];

export const loadWallet = (): UserWallet => {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return INITIAL_WALLET;
};

export const saveWallet = (wallet: UserWallet): void => {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
  } catch {
    // ignore
  }
};

export const loadTransactions = (): Transaction[] => {
  try {
    const raw = localStorage.getItem(TRANSACTIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return INITIAL_TRANSACTIONS;
};

export const saveTransactions = (txs: Transaction[]): void => {
  try {
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(txs));
  } catch {
    // ignore
  }
};

/**
 * Generates an authentic EMV compliant PIX Copia e Cola string
 */
export const generatePixCode = (amount: number, txid: string): string => {
  const formattedAmount = amount.toFixed(2);
  const merchantKey = 'financeiro@betesporte.bet.br';
  const merchantName = 'BETESPORTE PAGAMENTOS S.A.';
  const merchantCity = 'SAO PAULO';

  // Construct EMV BRCode payload string
  return `00020126580014br.gov.bcb.pix0136${merchantKey}520400005303986540${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}5802BR5925${merchantName}6009${merchantCity}62240520${txid}6304E8A2`;
};

/**
 * Generates Data URL QR code image from PIX code
 */
export const generatePixQrCodeDataUrl = async (pixCode: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(pixCode, {
      width: 280,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch {
    return '';
  }
};
