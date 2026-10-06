import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Aceita os dois formatos de chave publica.
 *
 * O Supabase trocou o JWT `eyJ...` (role `anon`) por `sb_publishable_...`. Os
 * dois funcionam em supabase-js v2; o que muda e o que o painel chama de
 * "anon key" hoje. Aceitar os dois evita ter que descobrir o formato do painel
 * antes de rodar.
 */
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

if (!isSupabaseConfigured) {
  console.warn(
    '[SUPABASE] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes. ' +
      'A interface abre, mas nao ha dados nem sessao ate as variaveis serem definidas.'
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL ?? 'https://placeholder.supabase.co',
  SUPABASE_PUBLISHABLE_KEY ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Erro do Supabase em formato legivel. Mensagens cruas do PostgREST sao crípticas
 * ("duplicate key value violates unique constraint") e nao diz o que fazer.
 */
export function describeSupabaseError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Erro inesperado.';
  const e = err as { message?: string; code?: string; hint?: string };

  switch (e.code) {
    case '23505':
      return 'Ja existe um registro com esse valor (unicidade violada).';
    case '23503':
      return 'Referencia invalida: o registro relacionado nao existe.';
    case '42501':
      return 'Sem permissao para esta operacao. Verifique as politicas RLS.';
    case 'PGRST301':
      return 'Consulta muito complexa ou excedeu o limite do plano.';
    default:
      return e.hint ? `${e.message} — ${e.hint}` : e.message ?? 'Erro inesperado.';
  }
}