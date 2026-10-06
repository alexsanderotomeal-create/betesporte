/**
 * Autenticacao via Supabase Auth.
 *
 * Antes, o "login" aceitava so o identificador e devolvia o usuario inteiro,
 * sem senha nenhuma. Aqui a senha e real, o hash e responsabilidade do GoTrue
 * (bcrypt) e o token fica num cookie httpOnly gerenciado pela lib.
 *
 * O que mudou de verdade: nao existe mais localStorage guardando quem e o
 * usuario. A sessao vive no Supabase e a RLS valida cada query.
 */

import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { describeSupabaseError, supabase } from '../lib/supabase';
import type { UserAccount } from '../types/auth';
import { fetchAccount } from './dataService';

export interface AuthResult {
  user: User | null;
  session: Session | null;
}

export type AuthErrorKind = 'invalid_credentials' | 'email_exists' | 'blocked' | 'unknown';

export class AuthError extends Error {
  readonly kind: AuthErrorKind;

  constructor(kind: AuthErrorKind, message: string) {
    super(message);
    this.name = 'AuthError';
    this.kind = kind;
  }
}

/** So digitos, 11 caracteres. CPF formatado em mascara nao passa no banco. */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function isValidCpf(cpf: string): boolean {
  const clean = normalizeCpf(cpf);
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  const digit = (slice: string): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i += 1) {
      sum += Number(slice[i]) * (slice.length + 1 - i);
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return digit(clean.slice(0, 9)) === Number(clean[9]) && digit(clean.slice(0, 10)) === Number(clean[10]);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Cadastro. A senha vai crua para o GoTrue, que e quem aplica o hash — nunca
 * guardamos senha em codigo nem no banco de aplicacao.
 */
export async function signUp(input: {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
  password: string;
}): Promise<AuthResult> {
  if (!input.name.trim()) throw new AuthError('unknown', 'Informe o nome.');
  if (!isValidEmail(input.email)) throw new AuthError('unknown', 'E-mail invalido.');
  if (!isValidCpf(input.cpf)) throw new AuthError('unknown', 'CPF invalido.');
  if (input.password.length < 8) {
    throw new AuthError('unknown', 'A senha precisa ter ao menos 8 caracteres.');
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      // O trigger real handle_new_user le `full_name` da metadata (cpf/phone
      // nao entram nele; ficam de fora ate o usuario editar o perfil).
      data: {
        full_name: input.name.trim(),
        name: input.name.trim(),
        cpf: normalizeCpf(input.cpf),
        phone: input.phone?.trim() ?? '',
      },
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('already registered') || message.includes('already exists')) {
      throw new AuthError('email_exists', 'Este e-mail ja esta cadastrado.');
    }
    throw new AuthError('unknown', describeSupabaseError(error));
  }

  return { user: data.user, session: data.session };
}

/**
 * Login por e-mail e senha. Identificador por CPF nao e aceito: o GoThrow
 * busca por e-mail, e um segundo caminho exigiria ler a tabela de perfis,
 * o que expoe a lista de CPFs de quem tem conta.
 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!email.trim() || !password) {
    throw new AuthError('invalid_credentials', 'Informe e-mail e senha.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    // "Invalid login credentials" cobre e-mail inexistente e senha errada com a
    // mesma mensagem de proposito: distinguir os dois confirmaria quais e-mails
    // tem conta.
    throw new AuthError('invalid_credentials', 'E-mail ou senha incorretos.');
  }

  if (!data.user) throw new AuthError('invalid_credentials', 'E-mail ou senha incorretos.');

  const account = await fetchAccount(data.user.id);
  if (account?.status === 'blocked') {
    await supabase.auth.signOut();
    throw new AuthError('blocked', 'Conta suspensa. Contate o suporte.');
  }

  return { user: data.user, session: data.session };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(describeSupabaseError(error));
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(describeSupabaseError(error));
  return data.session;
}

/**
 * Recuperacao de senha. O link do e-mail volta ao app no `redirectTo`; sem ele,
 * o GoTrue usa o site_url do projeto (que e do produto real, imperiumclub.asia).
 */
export async function requestPasswordReset(
  email: string,
  redirectTo?: string
): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: redirectTo ?? window.location.origin,
  });
  if (error) throw new Error(describeSupabaseError(error));
}

/** Sessao de recuperacao ativa? O GoTrue emite PASSWORD_RECOVERY ao validar o link. */
export function isRecoveryEvent(event: AuthChangeEvent): boolean {
  return event === 'PASSWORD_RECOVERY';
}

/**
 * Grava a nova senha dentro da sessao de recuperacao. So faz sentido chamar
 * depois do link de PASSWORD_RECOVERY ser validado; em sessao comum, o GoTrue
 * exige reautenticacao e devolve "Auth session missing".
 */
export async function resetPassword(newPassword: string): Promise<void> {
  if (newPassword.length < 8) {
    throw new AuthError('unknown', 'A senha precisa ter ao menos 8 caracteres.');
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(describeSupabaseError(error));
}

/**
 * Sessao -> conta do dominio.
 * Retorna null quando ha sessao mas o perfil nao existe (trigger nao rodou).
 */
export async function currentAccount(): Promise<UserAccount | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(describeSupabaseError(error));
  if (!data.user) return null;
  return fetchAccount(data.user.id);
}

/**
 * Assina mudancas de sessao. Repassa o evento (INITIAL_SESSION, SIGNED_IN,
 * PASSWORD_RECOVERY, ...) e a sessao. Devolve a funcao para cancelar.
 * O App usa isso para detectar links de recuperacao e sair do modo visitante.
 */
export function onAuthStateChange(
  handler: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    handler(event, session);
  });
  return () => data.subscription.unsubscribe();
}