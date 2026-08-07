// Supabase Edge Function: admin-unlock
// Deploy: supabase functions deploy admin-unlock --no-verify-jwt
// Secret:  supabase secrets set ADMIN_PASSWORD=your-master-password

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const adminPassword = Deno.env.get('ADMIN_PASSWORD')
    if (!adminPassword) {
      return json({ error: 'ADMIN_PASSWORD not configured' }, 500)
    }

    const body = await req.json()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // List with existing session token
    if (body.action === 'list' && body.token) {
      const ok = await validSession(supabase, body.token)
      if (!ok) return json({ error: 'Session expired' }, 401)
      const sponsorships = await listSponsorships(supabase)
      return json({ sponsorships })
    }

    // Unlock with master password
    if (!body.password || body.password !== adminPassword) {
      return json({ error: 'Incorrect password' }, 401)
    }

    const token = crypto.randomUUID()
    const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    await supabase.from('admin_sessions').insert({ token, expires_at: expires })

    const sponsorships = await listSponsorships(supabase)
    return json({ token, sponsorships, expires_at: expires })
  } catch (e) {
    return json({ error: e?.message || 'Server error' }, 500)
  }
})

async function validSession(supabase, token) {
  const { data } = await supabase
    .from('admin_sessions')
    .select('token, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!data) return false
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from('admin_sessions').delete().eq('token', token)
    return false
  }
  return true
}

async function listSponsorships(supabase) {
  const { data, error } = await supabase
    .from('sponsorships')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
