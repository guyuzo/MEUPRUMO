import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

// Placeholders permitem o app abrir e mostrar o aviso de configuração em vez de quebrar.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/**
 * Confere uma senha sem mexer na sessão atual: um cliente descartável, sem persistência,
 * para não disparar SIGNED_IN (que limpa o cache) no cliente principal.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const probe = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'ff-verify' },
  })
  const { error } = await probe.auth.signInWithPassword({ email, password })
  if (!error) await probe.auth.signOut({ scope: 'local' })
  return !error
}
