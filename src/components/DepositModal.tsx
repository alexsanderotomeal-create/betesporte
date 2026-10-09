import React, { useState, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  QrCode, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  ArrowRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generatePixCode, generatePixQrCodeDataUrl, PixMerchantConfig } from '../services/paymentService';
import { Transaction } from '../types/betting';
import { UserAccount, DepositRequest } from '../types/auth';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserAccount | null;
  /** Dados do recebedor para o QR PIX; vem da configuracao da casa (painel admin). */
  pixConfig?: Partial<PixMerchantConfig>;
  onDepositSuccess: (amount: number, bonusAmount: number, tx: Transaction) => void;
  /**
   * Registra o pedido no servidor (RPC request_deposit) e devolve quando
   * responder. O saldo NAO e creditado aqui: creditado na aprovacao do admin.
   */
  onRequestDepositApproval?: (req: DepositRequest) => void | Promise<void>;
  /** Mínimo aceito para depósito; vem das configurações da casa. */
  minDeposit?: number;
  /** Se o bônus de boas-vindas está ativo nas configurações da casa. */
  welcomeBonusEnabled?: boolean;
  /** Percentual do bônus de boas-vindas (ex.: 100 = +100% no primeiro depósito). */
  welcomeBonusPercent?: number;
  /** Se o depósito por USDT (TRC-20) está habilitado nas configurações da casa. */
  usdtEnabled?: boolean;
  /** Endereço TRC-20 da casa para onde o cliente envia o USDT. */
  usdtWalletAddress?: string;
  /** Cotação interna: R$ por 1 USDT (ex.: 5.20). Usada para converter o valor. */
  usdtRate?: number;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  pixConfig,
  onDepositSuccess,
  onRequestDepositApproval,
  minDeposit = 10,
  welcomeBonusEnabled = true,
  welcomeBonusPercent = 100,
  usdtEnabled = false,
  usdtWalletAddress = '',
  usdtRate = 5.2,
}) => {
  const [amount, setAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState<string>('50');
  const [includeBonus, setIncludeBonus] = useState<boolean>(welcomeBonusEnabled);
  const [step, setStep] = useState<'amount' | 'pix_code' | 'usdt' | 'success'>('amount');
  const [method, setMethod] = useState<'pix' | 'usdt'>('pix');
  
  const [pixPayload, setPixPayload] = useState<string>('');
  const [txid, setTxid] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
  const [usdtTxid, setUsdtTxid] = useState<string>('');
  const [sourceWallet, setSourceWallet] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(900); // 15 minutes
  const [isProcessingSimulated, setIsProcessingSimulated] = useState<boolean>(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('amount');
      setCopied(false);
      setCopiedAddress(false);
      setTimeLeft(900);
      setIncludeBonus(welcomeBonusEnabled);
      setMethod('pix');
      setUsdtTxid('');
      setSourceWallet('');
    }
  }, [isOpen, welcomeBonusEnabled]);

  // Countdown timer when on the payment steps
  useEffect(() => {
    if (step !== 'pix_code' && step !== 'usdt') return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  if (!isOpen) return null;

  const bonusPct = welcomeBonusPercent ?? 100;
  const bonusAllowed = welcomeBonusEnabled !== false;
  const bonusAmount = (amount * bonusPct) / 100;
  const effectiveIncludeBonus = bonusAllowed && includeBonus;
  const usdtRateEffective = usdtRate > 0 ? usdtRate : 1;
  const usdtAmount = amount / usdtRateEffective;
  const usdtAvailable = usdtEnabled && usdtWalletAddress.trim().length > 0;

  const handleSelectAmount = (val: number) => {
    setAmount(val);
    setCustomAmount(val.toString());
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomAmount(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  };

  const handleGeneratePix = async () => {
    if (amount < minDeposit) return;
    const generatedTxid = `PIX-${Date.now().toString().slice(-8)}`;
    const code = generatePixCode(amount, generatedTxid, pixConfig);
    const qrData = await generatePixQrCodeDataUrl(code);

    setPixPayload(code);
    setTxid(generatedTxid);
    setQrCodeUrl(qrData);
    setStep('pix_code');
  };

  const handleCopyPix = () => {
    if (!pixPayload) return;
    navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyAddress = () => {
    if (!usdtWalletAddress) return;
    navigator.clipboard.writeText(usdtWalletAddress.trim());
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2500);
  };

  const handleGenerateUsdt = () => {
    if (amount < minDeposit) return;
    if (!usdtAvailable) return;
    setStep('usdt');
  };

  /**
   * Pedido local que vai ao servidor. O id/nome sao preenchidos de novo la
   * dentro a partir da sessao, entao aqui so o valor importam — criar o objeto
   * aqui e so para os dois botoes partilharem a mesma forma.
   */
  const buildDepositRequest = (): DepositRequest => ({
    id: `dep-req-${Date.now()}`,
    userId: currentUser?.id || 'guest',
    userName: currentUser?.name || 'Apostador Convidado',
    userCpf: currentUser?.cpf || '',
    amount: amount,
    bonusAmount: 0,
    txid: method === 'usdt' ? usdtTxid.trim() : txid,
    paymentMethod: method === 'usdt' ? 'USDT' : 'PIX',
    date: 'Agora',
    status: 'pending',
    walletAddress: method === 'usdt' ? sourceWallet.trim() || undefined : undefined,
  });

  /**
   * Envia o pedido para `request_deposit`, que trava o valor em locked_balance
   * e ja calcula bonus/minimo no banco.
   *
   * O credito de saldo NAO acontece aqui: acontece quando o admin aprova. Esta
   * funcao so registra que o usuario pagou.
   */
  const submitDepositRequest = async (): Promise<boolean> => {
    try {
      if (method === 'usdt' && usdtTxid.trim().length < 10) {
        alert('Cole o TXID (hash) da transação USDT antes de enviar.');
        return false;
      }
      await onRequestDepositApproval?.(buildDepositRequest());
      return true;
    } catch {
      return false;
    }
  };

  const handleSimulatePaymentApproval = async () => {
    if (isProcessingSimulated) return;
    setIsProcessingSimulated(true);

    const submitted = await submitDepositRequest();

    setIsProcessingSimulated(false);

    if (!submitted) {
      alert('Não foi possível registrar o depósito. Tente novamente.');
      return;
    }

    const bonusToAdd = effectiveIncludeBonus ? bonusAmount : 0;
    const tx: Transaction = {
      id: `tx-dep-${Date.now()}`,
      type: 'DEPOSIT_PIX',
      amount: amount,
      // Pendente, nao concluido: o saldo so entra na aprovacao do admin.
      status: 'PENDING',
      date: 'Agora',
      description:
        method === 'usdt'
          ? 'Pedido de depósito USDT aguardando aprovação'
          : 'Pedido de depósito PIX aguardando aprovação',
      txid: method === 'usdt' ? usdtTxid.trim() : txid,
    };

    onDepositSuccess(amount, bonusToAdd, tx);
    setLastTx(tx);
    setStep('success');

    confetti({
      particleCount: 70,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00e701', '#22c55e', '#eab308'],
    });
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00e701]/20 border border-[#00e701]/40 flex items-center justify-center">
              <QrCode className="w-4 h-4 text-[#00e701]" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block leading-tight">
                {method === 'usdt'
                  ? 'Depósito por carteira USDT (TRC-20)'
                  : 'Depósito Instantâneo via PIX'}
              </span>
              <span className="text-[10px] text-slate-400">
                {method === 'usdt'
                  ? 'Envie USDT e aprove a aprovação manual'
                  : 'Crédito imediato em sua conta · Sem taxas'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: Select Amount & Bonus */}
        {step === 'amount' && (
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            {/* Método de pagamento (PIX ou USDT) */}
            {usdtAvailable && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMethod('pix')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                    method === 'pix'
                      ? 'bg-[#00e701] border-[#00e701] text-black shadow-md shadow-[#00e701]/20'
                      : 'bg-[#161b22] border-[#252d3d] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  PIX
                </button>
                <button
                  onClick={() => setMethod('usdt')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                    method === 'usdt'
                      ? 'bg-[#26a17b] border-[#26a17b] text-black shadow-md shadow-[#26a17b]/20'
                      : 'bg-[#161b22] border-[#252d3d] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  ₮ USDT (TRC-20)
                </button>
              </div>
            )}

            {/* Valor em USDT (referência) */}
            {method === 'usdt' && (
              <div className="bg-[#161b22] border border-[#252d3d] rounded-xl px-3 py-2.5 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Você receberá crédito de{' '}
                  <strong className="font-mono text-white">R$ {amount.toFixed(2)}</strong> por
                </span>
                <span className="font-mono font-bold text-[#26a17b]">
                  ≈ USDT {usdtAmount.toFixed(2)}
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Escolha um valor de depósito (Mínimo R$ {minDeposit.toFixed(2)})
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[20, 50, 100, 250, 500, 1000].map((val) => (
                  <button
                    key={val}
                    onClick={() => handleSelectAmount(val)}
                    className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all ${
                      amount === val
                        ? 'bg-[#00e701] border-[#00e701] text-black shadow-md shadow-[#00e701]/20'
                        : 'bg-[#161b22] border-[#252d3d] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    R$ {val}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Ou digite outro valor desejado:
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-slate-400">
                  R$
                </span>
                <input
                  type="number"
                  min="10"
                  step="5"
                  value={customAmount}
                  onChange={handleCustomChange}
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-10 pr-4 py-2.5 text-base font-mono font-bold text-white focus:outline-none"
                  placeholder="0,00"
                />
              </div>
              {amount < minDeposit && (
                <span className="text-[11px] text-rose-400 mt-1 block">
                  O valor mínimo de depósito é R$ {minDeposit.toFixed(2)}.
                </span>
              )}
            </div>

            {/* First Deposit Bonus Checkbox */}
            {bonusAllowed && (
              <div 
                onClick={() => setIncludeBonus(!effectiveIncludeBonus)}
                className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-transparent border border-amber-500/40 rounded-xl p-3 flex items-start gap-2.5 cursor-pointer hover:border-amber-400 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={effectiveIncludeBonus}
                  onChange={() => {}}
                  className="mt-0.5 rounded text-[#00e701] focus:ring-0"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Sparkles className="w-3.5 h-3.5" />
                    Ativar Bônus de {bonusPct}% no Primeiro Depósito
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Deposite R$ {amount.toFixed(2)} e jogue com{' '}
                    <strong className="text-amber-200">R$ {(amount + bonusAmount).toFixed(2)}</strong>!
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              disabled={amount < minDeposit || (method === 'usdt' && !usdtAvailable)}
              onClick={method === 'usdt' ? handleGenerateUsdt : handleGeneratePix}
              className={`w-full py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                amount >= minDeposit && !(method === 'usdt' && !usdtAvailable)
                  ? method === 'usdt'
                    ? 'bg-[#26a17b] hover:bg-[#218a68] active:scale-[0.99] text-black shadow-lg shadow-[#26a17b]/25'
                    : 'bg-[#00e701] hover:bg-[#00c901] active:scale-[0.99] text-black shadow-lg shadow-[#00e701]/25'
                  : 'bg-[#21262d] text-slate-500 cursor-not-allowed'
              }`}
            >
              {method === 'usdt' ? <span>Gerar Dados para pagamento USDT</span> : <span>Gerar QR Code PIX</span>}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: PIX QR Code & Copia e Cola */}
        {step === 'pix_code' && (
          <div className="p-4 sm:p-6 flex flex-col items-center gap-4 text-center">
            {/* Countdown notice */}
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-500/30 px-3 py-1.5 rounded-lg w-full justify-center">
              <Clock className="w-3.5 h-3.5 animate-pulse" />
              <span>
                Pague em até{' '}
                <strong className="font-mono">
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </strong>
              </span>
            </div>

            {/* QR Code Canvas/Image */}
            <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-[#00e701]/30">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="QR Code PIX" className="w-52 h-52 mx-auto" />
              ) : (
                <div className="w-52 h-52 bg-slate-200 animate-pulse rounded-lg"></div>
              )}
            </div>

            {/* Value display */}
            <div>
              <span className="text-[11px] text-slate-400 block uppercase tracking-wider">
                Valor a Pagar
              </span>
              <span className="font-mono text-2xl font-extrabold text-[#00e701]">
                R$ {amount.toFixed(2)}
              </span>
              {effectiveIncludeBonus && (
                <span className="text-[11px] text-amber-400 block font-medium">
                  (+ R$ {bonusAmount.toFixed(2)} Bônus Ativo)
                </span>
              )}
            </div>

            {/* Copia e Cola Code Box */}
            <div className="w-full flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Código PIX Copia e Cola:</span>
                {copied && <span className="text-[#00e701] font-bold">Copiado!</span>}
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={pixPayload}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-xl pl-3 pr-24 py-2 text-xs font-mono text-slate-300 focus:outline-none truncate"
                />
                <button
                  onClick={handleCopyPix}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#00e701]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Instructions */}
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Abra o app do seu banco, escolha <strong>Pagar com PIX</strong>, aponte a câmera para o QR Code ou cole o código acima.
            </p>

            {/* Action Button: registers the request server-side */}
            <div className="w-full pt-2 border-t border-[#21262d] flex flex-col gap-2">
              <button
                disabled={isProcessingSimulated}
                onClick={handleSimulatePaymentApproval}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
              >
                {isProcessingSimulated ? (
                  <span className="animate-pulse">Registrando pedido no servidor...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>Enviar para aprovação manual do admin</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setStep('amount')}
                className="text-xs text-slate-400 hover:text-white"
              >
                Voltar e alterar valor
              </button>
            </div>
          </div>
        )}

        {/* STEP 2b: USDT TRC-20 Address & TXID */}
        {step === 'usdt' && (
          <div className="p-4 sm:p-6 flex flex-col items-center gap-4 text-center">
            {/* Countdown notice */}
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-500/30 px-3 py-1.5 rounded-lg w-full justify-center">
              <Clock className="w-3.5 h-3.5 animate-pulse" />
              <span>
                Envie em até{' '}
                <strong className="font-mono">
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </strong>
              </span>
            </div>

            {/* Value display */}
            <div>
              <span className="text-[11px] text-slate-400 block uppercase tracking-wider">
                Valor a Enviar
              </span>
              <span className="font-mono text-2xl font-extrabold text-[#26a17b]">
                USDT {usdtAmount.toFixed(2)}
              </span>
              <span className="text-[11px] text-slate-400 block font-medium">
                (rede TRC-20 · crédito de R$ {amount.toFixed(2)})
              </span>
              {effectiveIncludeBonus && (
                <span className="text-[11px] text-amber-400 block font-medium">
                  (+ R$ {bonusAmount.toFixed(2)} Bônus Ativo)
                </span>
              )}
            </div>

            {/* House TRC-20 Wallet Address */}
            <div className="w-full flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Endereço da casa (rede TRC-20):</span>
                {copiedAddress && <span className="text-[#26a17b] font-bold">Copiado!</span>}
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={usdtWalletAddress}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-xl pl-3 pr-24 py-2 text-xs font-mono text-slate-300 focus:outline-none truncate"
                />
                <button
                  onClick={handleCopyAddress}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  {copiedAddress ? <Check className="w-3.5 h-3.5 text-[#26a17b]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAddress ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* TXID Input */}
            <div className="w-full flex flex-col gap-1.5">
              <label className="text-[11px] text-slate-400 text-left">
                TXID (hash) da transação enviada:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={usdtTxid}
                  onChange={(e) => setUsdtTxid(e.target.value)}
                  placeholder="Cole aqui o TXID..."
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#26a17b] rounded-xl pl-3 pr-3 py-2 text-xs font-mono text-slate-200 focus:outline-none placeholder-slate-500"
                />
              </div>
              {usdtTxid && usdtTxid.trim().length < 10 && (
                <span className="text-[11px] text-rose-400 text-left">
                  O TXID parece muito curto. Confira o hash completo da transferência.
                </span>
              )}
            </div>

            {/* Source Wallet (optional) */}
            <div className="w-full flex flex-col gap-1.5">
              <label className="text-[11px] text-slate-400 text-left">
                Carteira de origem (opcional, facilita a conferência):
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={sourceWallet}
                  onChange={(e) => setSourceWallet(e.target.value)}
                  placeholder="Endereço da sua carteira..."
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#26a17b] rounded-xl pl-3 pr-3 py-2 text-xs font-mono text-slate-200 focus:outline-none placeholder-slate-500"
                />
              </div>
            </div>

            {/* Instructions */}
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Envie o valor acima de qualquer carteira ou exchange usando a rede{' '}
              <strong>TRC-20 (Tron)</strong>. Envios por outras redes (BEP-20, ERC-20)
              podem ser perdidos. Após o envio, cole o TXID para análise.
            </p>

            {/* Action Button: registers the request server-side */}
            <div className="w-full pt-2 border-t border-[#21262d] flex flex-col gap-2">
              <button
                disabled={isProcessingSimulated}
                onClick={handleSimulatePaymentApproval}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
              >
                {isProcessingSimulated ? (
                  <span className="animate-pulse">Registrando pedido no servidor...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>Enviar para aprovação manual do admin</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setStep('amount')}
                className="text-xs text-slate-400 hover:text-white"
              >
                Voltar e alterar valor
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Payment Success / Receipt */}
        {step === 'success' && lastTx && (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[#00e701]/20 border-2 border-[#00e701] flex items-center justify-center text-[#00e701]">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Pedido registrado!</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                O depósito foi enviado e está aguardando aprovação da administração.
                O saldo só entra no acesso depois da aprovação.
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="w-full bg-[#161b22] border border-[#252d3d] rounded-xl p-3.5 flex flex-col gap-2 text-xs text-left">
              <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
                <span className="text-slate-400">Valor Depositado</span>
                <span className="font-mono font-bold text-[#00e701] text-sm">
                  R$ {amount.toFixed(2)}
                </span>
              </div>

              {effectiveIncludeBonus && (
                <div className="flex items-center justify-between border-b border-[#21262d] pb-2 text-amber-400">
                  <span>Bônus previsto</span>
                  <span className="font-mono font-bold">+ R$ {bonusAmount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Status</span>
                <span className="text-amber-400 font-semibold">Aguardando aprovação</span>
              </div>

              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>TXID</span>
                <span className="font-mono text-slate-300 truncate max-w-[200px]">
                  {lastTx.txid || '—'}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase tracking-wider cursor-pointer"
            >
              Começar a Apostar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
