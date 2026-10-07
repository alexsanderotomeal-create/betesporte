import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { UserAccount } from '../types/auth';
import {
  AuthError,
  isValidCpf,
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
} from '../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: UserAccount) => void;
  initialMode?: 'login' | 'register' | 'forgot' | 'new-password';
  /** Se o bônus de boas-vindas está ativo nas configurações da casa. */
  welcomeBonusEnabled?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  initialMode = 'login',
  welcomeBonusEnabled = true,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'new-password'>(initialMode);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string>('');

  useEffect(() => {
    setMode(initialMode);
    setErrorMessage('');
    setInfoMessage('');
  }, [initialMode, isOpen]);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCpf, setRegCpf] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAgeAgreed, setRegAgeAgreed] = useState(true);

  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  if (!isOpen) return null;

  /**
   * Depois do sign-in o Supabase ja tem sessao. Reentramos com a conta lida do
   * banco em vez de usar o objeto do formulario: o que entra no estado da
   * interface tem que ser o que o servidor devolveu.
   */
  async function resolveAndLogin(): Promise<void> {
    const { currentAccount } = await import('../services/auth');
    const account = await currentAccount();
    if (account) {
      onLogin(account);
      onClose();
    }
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!loginEmail.trim() || !loginPassword) {
      setErrorMessage('Preencha e-mail e senha.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn(loginEmail, loginPassword);
      if (!result.session) {
        setErrorMessage('Sessao nao estabelecida. Verifique o e-mail.');
        return;
      }
      await resolveAndLogin();
    } catch (err) {
      setErrorMessage(err instanceof AuthError ? err.message : 'Falha no login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!regName.trim() || !regEmail.trim() || !regCpf.trim() || !regPassword) {
      setErrorMessage('Preencha todos os campos obrigatorios.');
      return;
    }
    if (!regAgeAgreed) {
      setErrorMessage('Voce precisa declarar ter 18 anos ou mais.');
      return;
    }
    if (!isValidCpf(regCpf)) {
      setErrorMessage('CPF invalido. Confira os digitos.');
      return;
    }
    if (regPassword.length < 8) {
      setErrorMessage('A senha precisa ter ao menos 8 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp({
        name: regName,
        email: regEmail,
        cpf: regCpf,
        phone: regPhone,
        password: regPassword,
      });

      // Sem sessao = projeto exige confirmacao por e-mail. Entrar direto aqui
      // mostraria um estado de "logado" que nao existe.
      if (!result.session) {
        setErrorMessage('Cadastro criado. Confirme o e-mail para ativar a conta.');
        setMode('login');
        setLoginEmail(regEmail.trim().toLowerCase());
        return;
      }
      await resolveAndLogin();
    } catch (err) {
      setErrorMessage(err instanceof AuthError ? err.message : 'Falha no cadastro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setInfoMessage('');

    if (!forgotEmail.trim()) {
      setErrorMessage('Informe o e-mail da conta.');
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset(forgotEmail);
      setInfoMessage(
        'Se este e-mail estiver cadastrado, enviaremos um link de recuperação. Verifique sua caixa de entrada.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao enviar o link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setInfoMessage('');

    if (!newPassword) {
      setErrorMessage('Informe a nova senha.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage('A senha precisa ter ao menos 8 caracteres.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setErrorMessage('As senhas nao conferem.');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(newPassword);
      setInfoMessage('Senha atualizada com sucesso.');
      // Sessao de recuperacao convertida em sessao normal: carrega o perfil.
      await resolveAndLogin();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao atualizar a senha.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-[#21262d] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-slate-200 flex flex-col">
        <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          {mode === 'new-password' ? (
            <div className="flex items-center text-xs font-bold text-slate-300">
              <Lock className="w-4 h-4 mr-2 text-[#00e701]" />
              Recuperar Senha
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-[#10141d] p-1 rounded-xl border border-[#252d3d]">
            <button
              onClick={() => { setMode('login'); setErrorMessage(''); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                mode === 'login' ? 'bg-[#00e701] text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => { setMode('register'); setErrorMessage(''); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                mode === 'register' ? 'bg-[#00e701] text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Criar Conta
            </button>
          </div>
          )}

          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 flex flex-col gap-4">
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-600/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {infoMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{infoMessage}</span>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    autoComplete="email"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setErrorMessage('');
                    setInfoMessage('');
                  }}
                  className="text-[11px] text-slate-400 hover:text-[#00e701] transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 mt-1 rounded-xl bg-[#00e701] hover:bg-[#00c901] disabled:bg-[#00e701]/40 text-black font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#00e701]/25 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? 'Verificando...' : 'Acessar Minha Conta'}
              </button>

              <div className="pt-3 border-t border-[#21262d] flex items-start gap-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>
                  Senha nunca e guardada nem comparada no navegador: a
                  autenticacao acontece no Supabase. A sessao fica no
                  armazenamento do navegador e o acesso aos dados passa pela RLS,
                  nao por um cookie httpOnly.
                </span>
              </div>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nome Completo</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo Silva"
                    autoComplete="name"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">CPF</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={regCpf}
                    onChange={(e) => setRegCpf(e.target.value)}
                    placeholder="00000000000"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Celular</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      autoComplete="tel"
                      className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    autoComplete="email"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Senha (minimo 8 caracteres)</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Crie uma senha forte"
                    autoComplete="new-password"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              {welcomeBonusEnabled && (
                <div className="bg-gradient-to-r from-amber-950/40 to-transparent border border-amber-500/40 rounded-xl p-2.5 flex items-center gap-2 text-amber-300 text-xs">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Bonus de boas-vindas liberado para o primeiro deposito.</span>
                </div>
              )}

              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={regAgeAgreed}
                  onChange={(e) => setRegAgeAgreed(e.target.checked)}
                  className="mt-0.5 rounded text-[#00e701] focus:ring-0"
                />
                <span className="text-[11px] text-slate-400 leading-tight">
                  Declaro ter 18 anos ou mais e aceito os Termos de Servico e a Politica de Jogo Responsavel.
                </span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 mt-1 rounded-xl bg-[#00e701] hover:bg-[#00c901] disabled:bg-[#00e701]/40 text-black font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#00e701]/25 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? 'Criando conta...' : 'Cadastrar e Comecar a Apostar'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3.5">
              <p className="text-xs text-slate-400 leading-relaxed">
                Informe o e-mail cadastrado e enviaremos um link para definir uma
                nova senha.
              </p>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    autoComplete="email"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 mt-1 rounded-xl bg-[#00e701] hover:bg-[#00c901] disabled:bg-[#00e701]/40 text-black font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#00e701]/25 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? 'Enviando...' : 'Enviar Link de Recuperacao'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage('');
                  setInfoMessage('');
                }}
                className="text-[11px] text-slate-400 hover:text-white transition-colors"
              >
                Voltar para o login
              </button>
            </form>
          )}

          {mode === 'new-password' && (
            <form onSubmit={handleNewPasswordSubmit} className="flex flex-col gap-3.5">
              <p className="text-xs text-slate-400 leading-relaxed">
                Autenticacao confirmada. Defina sua nova senha para concluir a
                recuperacao.
              </p>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nova senha (minimo 8 caracteres)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Crie uma senha forte"
                    autoComplete="new-password"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Confirmar senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#00e701] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 mt-1 rounded-xl bg-[#00e701] hover:bg-[#00c901] disabled:bg-[#00e701]/40 text-black font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#00e701]/25 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? 'Salvando...' : 'Definir Nova Senha'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage('');
                  setInfoMessage('');
                }}
                className="text-[11px] text-slate-400 hover:text-white transition-colors"
              >
                Voltar para o login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};