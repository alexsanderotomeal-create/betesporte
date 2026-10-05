import React, { useState } from 'react';
import { 
  X, 
  History, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Trophy, 
  DollarSign, 
  Search
} from 'lucide-react';
import { Transaction } from '../types/betting';

interface TransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
}

export const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = ({
  isOpen,
  onClose,
  transactions,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  if (!isOpen) return null;

  const filtered = transactions.filter((tx) => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#21262d] flex items-center justify-center">
              <History className="w-4 h-4 text-[#00e701]" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block leading-tight">
                Extrato Financeiro & Histórico
              </span>
              <span className="text-[10px] text-slate-400">
                Todas as movimentações de saldo e liquidações
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

        {/* Filters */}
        <div className="p-3 bg-[#161b22]/50 border-b border-[#21262d] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'Tudo' },
              { id: 'DEPOSIT_PIX', label: 'Depósitos PIX' },
              { id: 'WITHDRAW_PIX', label: 'Saques' },
              { id: 'BET_WON', label: 'Prêmios' },
              { id: 'CASH_OUT', label: 'Cash Out' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  filterType === f.id
                    ? 'bg-[#00e701] text-black font-bold'
                    : 'bg-[#1c2331] text-slate-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por texto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-44 bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-lg pl-8 pr-2.5 py-1 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Transactions List */}
        <div className="p-4 overflow-y-auto flex flex-col gap-2 flex-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Nenhuma transação encontrada no período.
            </div>
          ) : (
            filtered.map((tx) => {
              const isPositive = tx.type === 'DEPOSIT_PIX' || tx.type === 'BET_WON' || tx.type === 'CASH_OUT';

              return (
                <div
                  key={tx.id}
                  className="bg-[#161b22] border border-[#252d3d] rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      tx.type === 'DEPOSIT_PIX' ? 'bg-emerald-500/20 text-emerald-400' :
                      tx.type === 'WITHDRAW_PIX' ? 'bg-sky-500/20 text-sky-400' :
                      tx.type === 'BET_WON' ? 'bg-amber-500/20 text-amber-400' : 'bg-[#00e701]/20 text-[#00e701]'
                    }`}>
                      {tx.type === 'DEPOSIT_PIX' && <ArrowDownLeft className="w-4 h-4" />}
                      {tx.type === 'WITHDRAW_PIX' && <ArrowUpRight className="w-4 h-4" />}
                      {tx.type === 'BET_WON' && <Trophy className="w-4 h-4" />}
                      {tx.type === 'CASH_OUT' && <DollarSign className="w-4 h-4" />}
                    </div>

                    <div className="flex flex-col">
                      <span className="font-semibold text-white truncate">{tx.description}</span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span>{tx.date}</span>
                        {tx.endToEndId && (
                          <>
                            <span>·</span>
                            <span className="font-mono truncate max-w-[120px]">E2E: {tx.endToEndId}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`font-mono text-sm font-bold ${
                      isPositive ? 'text-[#00e701]' : 'text-slate-300'
                    }`}>
                      {isPositive ? '+' : '-'} R$ {tx.amount.toFixed(2)}
                    </div>
                    <span className="text-[10px] text-emerald-400 font-medium">
                      Concluído
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#161b22] border-t border-[#21262d] px-4 py-2.5 flex items-center justify-between text-xs text-slate-400">
          <span>Total de {filtered.length} movimentações registradas</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
