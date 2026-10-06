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

export interface PixMerchantConfig {
  merchantKey: string;
  merchantName: string;
  merchantCity: string;
}

/**
 * Generates an authentic EMV compliant PIX Copia e Cola string.
 *
 * Os dados do recebedor vem de `config` (configurados no painel admin); sem
 * config usa os defaults historicos. O nome entra limitado a 25 chars e a
 * cidade a 15, como exige o padrao EMV.
 */
export const generatePixCode = (
  amount: number,
  txid: string,
  config?: Partial<PixMerchantConfig>
): string => {
  const formattedAmount = amount.toFixed(2);
  const merchantKey =
    (config?.merchantKey && config.merchantKey.trim()) || 'financeiro@primasbet.bet.br';
  const merchantName =
    (config?.merchantName && config.merchantName.trim()) || 'PRIMASBET PAGAMENTOS S.A.';
  const merchantCity =
    (config?.merchantCity && config.merchantCity.trim()) || 'SAO PAULO';

  // Embrulhos EMV: 0X + tamanho (2 digitos) + valor
  const wrap = (id: string, value: string): string =>
    `${id}${value.length.toString().padStart(2, '0')}${value}`;

  // Merchant Account Information (26) contem o br.gov.bcb.pix + a chave.
  const pixAccount = wrap('00', 'br.gov.bcb.pix') + wrap('01', merchantKey);

  // Amount e o campo 54; padrao pede decimal separado por "." (como veio toFixed).
  const payload =
    '000201' +
    wrap('26', pixAccount) +
    wrap('52', '0000') +
    wrap('53', '986') +
    wrap('54', formattedAmount) +
    wrap('58', 'BR') +
    wrap('59', merchantName.slice(0, 25)) +
    wrap('60', merchantCity.slice(0, 15)) +
    wrap('62', wrap('05', txid)) +
    '6304E8A2';

  return payload;
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
