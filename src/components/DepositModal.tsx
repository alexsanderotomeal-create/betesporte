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
import { generatePixCode, generatePixQrCodeDataUrl } from '../services/paymentService';
import { Transaction } from '../types/betting';
import { UserAccount, DepositRequest } from '../types/auth';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserAccount | null;
  onDepositSuccess: (amount: number, bonusAmount: number, tx: Transaction) => void;
  onRequestDepositApproval?: (req: DepositRequest) => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onDepositSuccess,
  onRequestDepositApproval,
}) => {
  const [amount, setAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState<string>('50');
  const [includeBonus, setIncludeBonus] = useState<boolean>(true);
  const [step, setStep] = useState<'amount' | 'pix_code' | 'success'>('amount');
  
  const [pixPayload, setPixPayload] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(900); // 15 minutes
  const [isProcessingSimulated, setIsProcessingSimulated] = useState<boolean>(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('amount');
      setCopied(false);
      setTimeLeft(900);
    }
  }, [isOpen]);

  // Countdown timer when on pix_code step
  useEffect(() => {
    if (step !== 'pix_code') return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  if (!isOpen) return null;

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
    if (amount < 10) return;
    const txid = `PIX-${Date.now().toString().slice(-8)}`;
    const code = generatePixCode(amount, txid);
    const qrData = await generatePixQrCodeDataUrl(code);

    setPixPayload(code);
    setQrCodeUrl(qrData);
    setStep('pix_code');
  };

  const handleCopyPix = () => {
    if (!pixPayload) return;
    navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSimulatePaymentApproval = () => {
    setIsProcessingSimulated(true);
    setTimeout(() => {
      const bonusToAdd = includeBonus ? amount : 0;
      const tx: Transaction = {
        id: `tx-dep-${Date.now()}`,
        type: 'DEPOSIT_PIX',
        amount: amount,
        status: 'COMPLETED',
        date: 'Agora',
        description: 'Depósito PIX Instantâneo',
        endToEndId: `E0003816620261005${Date.now().toString().slice(-12)}`,
        txid: `PIX-DEP-${Math.floor(10000000 + Math.random() * 90000000)}`,
      };

      onDepositSuccess(amount, bonusToAdd, tx);
      setLastTx(tx);
      setIsProcessingSimulated(false);
      setStep('success');

      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00e701', '#22c55e', '#eab308'],
      });
    }, 1200);
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
                Depósito Instantâneo via PIX
              </span>
              <span className="text-[10px] text-slate-400">
                Crédito imediato em sua conta · Sem taxas
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
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Escolha um valor de depósito (Mínimo R$ 10,00)
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
              {amount < 10 && (
                <span className="text-[11px] text-rose-400 mt-1 block">
                  O valor mínimo de depósito é R$ 10,00.
                </span>
              )}
            </div>

            {/* First Deposit Bonus Checkbox */}
            <div 
              onClick={() => setIncludeBonus(!includeBonus)}
              className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-transparent border border-amber-500/40 rounded-xl p-3 flex items-start gap-2.5 cursor-pointer hover:border-amber-400 transition-colors"
            >
              <input
                type="checkbox"
                checked={includeBonus}
                onChange={() => {}}
                className="mt-0.5 rounded text-[#00e701] focus:ring-0"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  Ativar Bônus de 100% no Primeiro Depósito
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Deposite R$ {amount.toFixed(2)} e jogue com{' '}
                  <strong className="text-amber-200">R$ {(amount * 2).toFixed(2)}</strong>!
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              disabled={amount < 10}
              onClick={handleGeneratePix}
              className={`w-full py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                amount >= 10
                  ? 'bg-[#00e701] hover:bg-[#00c901] active:scale-[0.99] text-black shadow-lg shadow-[#00e701]/25'
                  : 'bg-[#21262d] text-slate-500 cursor-not-allowed'
              }`}
            >
              <span>Gerar QR Code PIX</span>
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
              {includeBonus && (
                <span className="text-[11px] text-amber-400 block font-medium">
                  (+ R$ {amount.toFixed(2)} Bônus Ativo)
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

            {/* Action Buttons: Instant Approval OR Send to Admin Review */}
            <div className="w-full pt-2 border-t border-[#21262d] flex flex-col gap-2">
              <button
                disabled={isProcessingSimulated}
                onClick={handleSimulatePaymentApproval}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
              >
                {isProcessingSimulated ? (
                  <span className="animate-pulse">Validando transação com o BACEN...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>Simular Pagamento Aprovado (PIX SPI)</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  const req: DepositRequest = {
                    id: `dep-req-${Date.now()}`,
                    userId: currentUser?.id || 'guest',
                    userName: currentUser?.name || 'Apostador Convidado',
                    userCpf: currentUser?.cpf || '123.456.789-00',
                    amount: amount,
                    bonusAmount: includeBonus ? amount : 0,
                    txid: `PIX-DEP-${Math.floor(10000000 + Math.random() * 90000000)}`,
                    pixCode: pixPayload,
                    date: 'Agora',
                    status: 'PENDING',
                    endToEndId: `E0003816620261005${Date.now().toString().slice(-12)}`,
                    notes: 'Aguardando validação e aprovação manual da administração',
                  };
                  onRequestDepositApproval?.(req);
                  alert('Comprovante enviado com sucesso! O Administrador já pode aprovar no Painel Admin.');
                  onClose();
                }}
                className="w-full py-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-amber-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors border border-amber-500/30"
              >
                <span>Enviar para Aprovação Manual do Admin</span>
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
              <h3 className="text-lg font-bold text-white">Depósito Confirmado!</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Os fundos foram creditados instantaneamente no seu saldo PrimasBet.
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

              {includeBonus && (
                <div className="flex items-center justify-between border-b border-[#21262d] pb-2 text-amber-400">
                  <span>Bônus Concedido</span>
                  <span className="font-mono font-bold">+ R$ {amount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Status</span>
                <span className="text-emerald-400 font-semibold">Liquidado via SPI</span>
              </div>

              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>ID E2E</span>
                <span className="font-mono text-slate-300 truncate max-w-[200px]">
                  {lastTx.endToEndId}
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
