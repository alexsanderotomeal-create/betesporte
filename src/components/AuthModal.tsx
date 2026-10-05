import React, { useState } from 'react';
import { 
  X, 
  User, 
  Lock, 
  Mail, 
  Phone, 
  CreditCard, 
  ShieldCheck, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Zap,
  ArrowRight
} from 'lucide-react';
import { UserAccount } from '../types/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserAccount[];
  onLogin: (user: UserAccount) => void;
  onRegister: (newUser: UserAccount) => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  users,
  onLogin,
  onRegister,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');

  // Register form state
  const [regName, setRegName] = useState<string>('');
  const [regEmail, setRegEmail] = useState<string>('');
  const [regCpf, setRegCpf] = useState<string>('');
  const [regPhone, setRegPhone] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regAgeAgreed, setRegAgeAgreed] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!loginIdentifier || !loginPassword) {
      setErrorMessage('Por favor, preencha todos os campos.');
      return;
    }

    const cleanId = loginIdentifier.trim().toLowerCase();
    const user = users.find(
      (u) =>
        u.email.toLowerCase() === cleanId ||
        u.cpf.replace(/\D/g, '') === cleanId.replace(/\D/g, '')
    );

    if (!user) {
      setErrorMessage('Usuário ou CPF não cadastrado.');
      return;
    }

    if (user.status === 'blocked') {
      setErrorMessage('Esta conta está temporariamente bloqueada. Contate o suporte.');
      return;
    }

    // Success login
    onLogin(user);
    onClose();
  };

  const handleQuickLogin = (role: 'admin' | 'user') => {
    const target = users.find((u) => u.role === role);
    if (target) {
      onLogin(target);
      onClose();
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!regName.trim() || !regEmail.trim() || !regCpf.trim() || !regPassword.trim()) {
      setErrorMessage('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!regAgeAgreed) {
      setErrorMessage('Você deve declarar ter 18 anos ou mais para se cadastrar.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    // Check duplicate
    const cleanEmail = regEmail.trim().toLowerCase();
    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      setErrorMessage('Este e-mail já está cadastrado.');
      return;
    }

    const newUser: UserAccount = {
      id: `user-${Date.now()}`,
      name: regName.trim(),
      email: cleanEmail,
      cpf: regCpf.trim(),
      phone: regPhone.trim() || '(11) 99999-9999',
      role: 'user',
      isVerified: true,
      status: 'active',
      wallet: {
        realBalance: 50.00, // Welcome free gift
        bonusBalance: 100.00, // Welcome signup bonus
        currency: 'BRL',
      },
      dailyDepositLimit: 5000,
      createdAt: 'Hoje',
    };

    onRegister(newUser);
    setSuccessMessage('Cadastro realizado com sucesso! Bônus de R$ 100 concedido.');
    setTimeout(() => {
      onLogin(newUser);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        {/* Header Tabs */}
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-1 bg-[#10141d] p-1 rounded-xl border border-[#252d3d]">
            <button
              onClick={() => {
                setMode('login');
                setErrorMessage('');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                mode === 'login'
                  ? 'bg-[#00e701] text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => {
                setMode('register');
                setErrorMessage('');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                mode === 'register'
                  ? 'bg-[#00e701] text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Criar Conta
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex flex-col gap-4">
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-600/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00e701]" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  E-mail ou CPF
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="seu.email@exemplo.com ou CPF"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Sua senha secreta"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 mt-1 rounded-xl bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#00e701]/25 cursor-pointer"
              >
                Acessar Minha Conta
              </button>

              {/* Quick Login Test Sandbox Buttons */}
              <div className="pt-3 border-t border-[#21262d] flex flex-col gap-2">
                <span className="text-[11px] text-slate-400 text-center font-medium">
                  ⚡ Acesso Rápido para Demonstração:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('admin')}
                    className="py-1.5 px-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors text-center"
                  >
                    🛡️ Login Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('user')}
                    className="py-1.5 px-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#00e701]/40 text-[#00e701] text-xs font-bold transition-colors text-center"
                  >
                    👤 Login Apostador
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* REGISTER FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo Silva"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    CPF
                  </label>
                  <input
                    type="text"
                    value={regCpf}
                    onChange={(e) => setRegCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Celular
                  </label>
                  <input
                    type="text"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Senha (mínimo 6 dígitos)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Crie uma senha forte"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Bonus alert */}
              <div className="bg-gradient-to-r from-amber-950/40 to-transparent border border-amber-500/40 rounded-xl p-2.5 flex items-center gap-2 text-amber-300 text-xs">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Bônus especial de boas-vindas: R$ 50 Saldo Real + R$ 100 Bônus ao cadastrar!</span>
              </div>

              {/* 18+ declaration */}
              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={regAgeAgreed}
                  onChange={(e) => setRegAgeAgreed(e.target.checked)}
                  className="mt-0.5 rounded text-[#00e701] focus:ring-0"
                />
                <span className="text-[11px] text-slate-400 leading-tight">
                  Declaro ter 18 anos ou mais e aceito os Termos de Serviço e Política de Jogo Responsável.
                </span>
              </label>

              <button
                type="submit"
                className="w-full py-2.5 mt-1 rounded-xl bg-[#00e701] hover:bg-[#00c901] text-black font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#00e701]/25 cursor-pointer"
              >
                Cadastrar e Começar a Apostar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
