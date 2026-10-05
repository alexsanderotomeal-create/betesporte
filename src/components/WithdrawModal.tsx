import React, { useState } from 'react';
import { 
  X, 
  ArrowUpRight, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Lock
} from 'lucide-react';
import { UserWallet, Transaction } from '../types/betting';
import { UserAccount, WithdrawRequest } from '../types/auth';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  currentUser?: UserAccount | null;
  onWithdrawSuccess: (amount: number, tx: Transaction) => void;
  onRequestWithdrawApproval?: (req: WithdrawRequest) => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  wallet,
  currentUser,
  onWithdrawSuccess,
  onRequestWithdrawApproval,
}) => {
  const [pixKeyType, setPixKeyType] = useState<'cpf' | 'phone' | 'email' | 'random'>('cpf');
  const [pixKey, setPixKey] = useState<string>('123.456.789-00');
  const [amount, setAmount] = useState<string>('50');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successReceipt, setSuccessReceipt] = useState<Transaction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const maxAvailable = wallet.realBalance;

  const handleMax = () => {
    setAmount(maxAvailable.toString());
  };

  const handleExecuteWithdraw = () => {
    setErrorMessage('');
    if (numAmount < 20) {
      setErrorMessage('O valor mínimo de saque é R$ 20,00.');
      return;
    }
    if (numAmount > maxAvailable) {
      setErrorMessage('Saldo real insuficiente para este saque.');
      return;
    }
    if (!pixKey.trim()) {
      setErrorMessage('Por favor, informe uma chave PIX válida.');
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      const tx: Transaction = {
        id: `tx-wdr-${Date.now()}`,
        type: 'WITHDRAW_PIX',
        amount: numAmount,
        status: 'COMPLETED',
        date: 'Agora',
        description: `Saque PIX para chave ${pixKeyType.toUpperCase()} (${pixKey})`,
        pixKey: `${pixKeyType}: ${pixKey}`,
        endToEndId: `E0003816620261005${Date.now().toString().slice(-12)}`,
        txid: `PIX-SAQ-${Math.floor(10000000 + Math.random() * 90000000)}`,
      };

      onWithdrawSuccess(numAmount, tx);

      onRequestWithdrawApproval?.({
        id: `wdr-req-${Date.now()}`,
        userId: currentUser?.id || 'guest',
        userName: currentUser?.name || 'Apostador Convidado',
        userCpf: currentUser?.cpf || '123.456.789-00',
        amount: numAmount,
        pixKeyType: pixKeyType.toUpperCase(),
        pixKey,
        date: 'Agora',
        status: 'PENDING',
        notes: `Saque solicitado para chave ${pixKeyType.toUpperCase()}`,
      });

      setSuccessReceipt(tx);
      setIsProcessing(false);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block leading-tight">
                Saque Instantâneo via PIX
              </span>
              <span className="text-[10px] text-slate-400">
                Transferência bancária imediata 24/7
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

        {!successReceipt ? (
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            {/* Balance Card */}
            <div className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Saldo Disponível para Saque
                </span>
                <span className="font-mono text-xl font-extrabold text-[#00e701]">
                  R$ {maxAvailable.toFixed(2)}
                </span>
              </div>
              {wallet.bonusBalance > 0 && (
                <div className="text-right">
                  <span className="text-[10px] text-amber-400 font-semibold block flex items-center justify-end gap-1">
                    <Lock className="w-3 h-3" /> Saldo Bônus
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    R$ {wallet.bonusBalance.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Pix Key Type Selector */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Tipo de Chave PIX do Titular
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'cpf', label: 'CPF' },
                  { id: 'phone', label: 'Celular' },
                  { id: 'email', label: 'E-mail' },
                  { id: 'random', label: 'Aleatória' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setPixKeyType(item.id as typeof pixKeyType);
                      if (item.id === 'cpf') setPixKey('123.456.789-00');
                      else if (item.id === 'email') setPixKey('apostador@gmail.com');
                      else if (item.id === 'phone') setPixKey('(11) 98765-4321');
                      else setPixKey('9f3b20c1-842a-4a7b-a212-3849102c912f');
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      pixKeyType === item.id
                        ? 'bg-[#00e701] border-[#00e701] text-black'
                        : 'bg-[#161b22] border-[#252d3d] text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pix Key Input */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Chave PIX Cadastrada:
              </label>
              <input
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                placeholder="Insira sua chave PIX"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                A chave PIX deve pertencer ao mesmo CPF cadastrado na conta.
              </span>
            </div>

            {/* Amount Input */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300 font-semibold">Valor do Saque (R$)</span>
                <button
                  onClick={handleMax}
                  className="text-[10px] text-[#00e701] hover:underline font-bold"
                >
                  Sacar Valor Total
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-slate-400">
                  R$
                </span>
                <input
                  type="number"
                  min="20"
                  max={maxAvailable}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-10 pr-4 py-2.5 text-base font-mono font-bold text-white focus:outline-none"
                  placeholder="0,00"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                <span>Mínimo: R$ 20,00</span>
                <span>Taxa: R$ 0,00 (Grátis)</span>
              </div>
            </div>

            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-600/40 text-rose-300 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              disabled={isProcessing || numAmount <= 0}
              onClick={handleExecuteWithdraw}
              className={`w-full py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                numAmount >= 20 && numAmount <= maxAvailable
                  ? 'bg-[#00e701] hover:bg-[#00c901] active:scale-[0.99] text-black shadow-lg shadow-[#00e701]/25'
                  : 'bg-[#21262d] text-slate-500 cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <span className="animate-pulse">Enviando ordem ao Banco Central (SPI)...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirmar Saque PIX</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Saque Concluído com Sucesso!</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                O valor foi transferido instantaneamente para sua conta bancária via PIX SPI.
              </p>
            </div>

            {/* Receipt Summary */}
            <div className="w-full bg-[#161b22] border border-[#252d3d] rounded-xl p-3.5 flex flex-col gap-2 text-xs text-left">
              <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
                <span className="text-slate-400">Valor Sacado</span>
                <span className="font-mono font-bold text-white text-sm">
                  R$ {successReceipt.amount.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-[#21262d] pb-2 text-slate-400 text-[11px]">
                <span>Chave de Destino</span>
                <span className="text-slate-200 font-mono">{successReceipt.pixKey}</span>
              </div>

              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Autenticação SPI</span>
                <span className="font-mono text-emerald-400 font-semibold truncate max-w-[200px]">
                  {successReceipt.endToEndId}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setSuccessReceipt(null);
                onClose();
              }}
              className="w-full py-3 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
