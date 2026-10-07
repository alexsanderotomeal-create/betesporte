/**
 * Valida o BR Code (PIX copia e cola) gerado por `generatePixCode`.
 *
 * Checa o que um banco checa antes de aceitar: CRC16 do campo 63, tamanho
 * declarado de cada campo, campos obrigatorios e formato do txid. Um codigo
 * fora disso e recusado pelo app do banco ("QR invalido" / "nao reconhece").
 *
 *   npm run test:pix
 */
import { crc16, generatePixCode, sanitizePixTxid } from '../src/services/paymentService';

const failures: string[] = [];
const check = (ok: boolean, label: string) => {
  if (!ok) failures.push(label);
};

const code = generatePixCode(50, 'PIX-88838494', {
  merchantKey: '11111111-2222-4333-8444-555555555555',
  merchantName: 'EMPRESA DE TESTE LTDA',
  merchantCity: 'SAO PAULO',
});

// CRC: cobre tudo menos os 4 digitos finais.
check(code.endsWith(crc16(code.slice(0, -4))), 'CRC16 do campo 63 nao confere');

// Parse campo a campo: id(2) + tamanho(2) + valor.
const fields = new Map<string, string>();
let i = 0;
let parseOk = true;
while (i < code.length - 4) {
  const id = code.slice(i, i + 2);
  const rawLen = code.slice(i + 2, i + 4);
  const len = parseInt(rawLen, 10);
  if (id === '63') break;
  if (rawLen !== String(len).padStart(2, '0') || i + 4 + len > code.length - 4) {
    parseOk = false;
    failures.push(`campo ${id}: tamanho declarado ${rawLen} nao bate com o valor`);
    break;
  }
  fields.set(id, code.slice(i + 4, i + 4 + len));
  i += 4 + len;
}
check(parseOk, 'parse dos campos');
check(code.slice(i, i + 2) === '63' && code.slice(i + 2, i + 4) === '04', 'campo 63/04 ausente');

check(fields.get('00') === '01', 'campo 00 (payload format indicator) != 01');
check(fields.get('26')?.startsWith('0014br.gov.bcb.pix01') === true, 'campo 26 sem GUI br.gov.bcb.pix');
check(
  fields.get('26')?.endsWith('11111111-2222-4333-8444-555555555555') === true,
  'campo 26 nao contem a chave PIX'
);
check(fields.get('53') === '986', 'campo 53 (moeda) != 986');
check(fields.get('54') === '50.00', 'campo 54 (valor) != 50.00');
check(fields.get('58') === 'BR', 'campo 58 (pais) != BR');
check((fields.get('59') ?? '').length <= 25, 'campo 59 (nome) acima de 25 chars');
check((fields.get('60') ?? '').length <= 15, 'campo 60 (cidade) acima de 15 chars');

const txid = fields.get('62')?.slice(4) ?? '';
check(txid.length >= 6 && txid.length <= 25, 'txid fora de 6..25 caracteres');
check(/^[A-Z0-9]+$/.test(txid), `txid com caractere invalido: ${txid}`);
check(sanitizePixTxid('PIX-88838494') === 'PIX88838494', 'sanitizePixTxid quebrou o txid');

// Codigos default (sem config do admin) nao podem ser usados: a chave
// financeiro@primasbet.bet.br nao existe em banco nenhum.
const fallback = generatePixCode(50, 'PIX-12345678');
check(fallback.includes('financeiro@primasbet.bet.br'), 'fallback historic ausente');

if (failures.length > 0) {
  console.error('FALHOU:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log(`ok: ${fields.size} campos, CRC ${code.slice(-4)} valido, txid ${txid}`);
