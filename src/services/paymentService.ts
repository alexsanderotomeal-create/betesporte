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
 * CRC16-CCITT (polinomio 0x1021, valor inicial 0xFFFF) do campo 63 do BRCode.
 *
 * O BRCode exige checksum correto: qualquer banco que le o codigo valida o CRC
 * antes de aceitar a cobranca. Um valor fixo so eh valido para UM payload; era
 * exatamente isso que fazia todo QR gerado aqui ser recusado como "invalido".
 */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * txid do BRCode (campo 62/05): so [A-Z0-9], de 6 a 25 caracteres. O padrão
 * rejeita simbolos como "-"; valores fora do formato fazem o banco recusar o
 * QR no mesmo check de validade do CRC.
 */
export function sanitizePixTxid(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length >= 6) return clean.slice(0, 25);
  return `PRIMAS${clean}`.slice(0, 25);
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
  const safeTxid = sanitizePixTxid(txid);

  // Embrulhos EMV: 0X + tamanho (2 digitos) + valor
  const wrap = (id: string, value: string): string =>
    `${id}${value.length.toString().padStart(2, '0')}${value}`;

  // Merchant Account Information (26) contem o br.gov.bcb.pix + a chave.
  const pixAccount = wrap('00', 'br.gov.bcb.pix') + wrap('01', merchantKey);

  // Amount e o campo 54; padrao pede decimal separado por "." (como veio toFixed).
  const body =
    '000201' +
    wrap('26', pixAccount) +
    wrap('52', '0000') +
    wrap('53', '986') +
    wrap('54', formattedAmount) +
    wrap('58', 'BR') +
    wrap('59', merchantName.slice(0, 25)) +
    wrap('60', merchantCity.slice(0, 15)) +
    wrap('62', wrap('05', safeTxid));

  // O CRC cobre tudo, inclusive a tag "63" e o "04" de tamanho.
  return `${body}6304${crc16(`${body}6304`)}`;
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
