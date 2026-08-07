import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(
  url &&
    anon &&
    !url.includes('YOUR_PROJECT') &&
    anon !== 'your_anon_key',
)

export const supabase = isSupabaseConfigured
  ? createClient(url, anon)
  : null

export function adminUnlockUrl() {
  if (!isSupabaseConfigured) return null
  return `${url.replace(/\/$/, '')}/functions/v1/admin-unlock`
}
