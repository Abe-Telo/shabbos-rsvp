-- Shabbos RSVP schema
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

create extension if not exists "pgcrypto";

-- Permanent people directory (never resets on Sunday)
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  phone_digits text,
  times_attended integer not null default 0,
  food_prefs text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists people_phone_digits_idx on public.people (phone_digits);
create index if not exists people_name_idx on public.people (lower(name));

-- Public weekly RSVPs (scoped by week_start = Sunday date)
create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people (id) on delete set null,
  week_start date not null,
  full_name text not null,
  phone text,
  coming text not null,
  potluck text,
  bringing jsonb not null default '[]'::jsonb,
  bringing_other text,
  dietary_notes text,
  guest_names text,
  guest_count integer,
  guest_overnight text,
  newcomer_notes text,
  feedback text,
  feedback_notes text,
  created_at timestamptz not null default now()
);

create index if not exists rsvps_week_idx on public.rsvps (week_start desc);
create index if not exists rsvps_person_week_idx on public.rsvps (person_id, week_start);

-- Private sponsorship / money answers (anon can INSERT, cannot SELECT)
create table if not exists public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  rsvp_id uuid references public.rsvps (id) on delete cascade,
  person_id uuid references public.people (id) on delete set null,
  week_start date not null,
  full_name text not null,
  phone text,
  contributions jsonb not null default '[]'::jsonb,
  notes text,
  potluck_contribution text,
  created_at timestamptz not null default now()
);

create index if not exists sponsorships_week_idx on public.sponsorships (week_start desc);

-- Admin session tokens issued by the Edge Function
create table if not exists public.admin_sessions (
  token text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table public.people enable row level security;
alter table public.rsvps enable row level security;
alter table public.sponsorships enable row level security;
alter table public.admin_sessions enable row level security;

-- People: public read + insert/update (form upserts)
drop policy if exists "people_select_public" on public.people;
create policy "people_select_public" on public.people
  for select to anon, authenticated using (true);

drop policy if exists "people_insert_public" on public.people;
create policy "people_insert_public" on public.people
  for insert to anon, authenticated with check (true);

drop policy if exists "people_update_public" on public.people;
create policy "people_update_public" on public.people
  for update to anon, authenticated using (true) with check (true);

-- RSVPs: public read/write (no money fields here)
drop policy if exists "rsvps_select_public" on public.rsvps;
create policy "rsvps_select_public" on public.rsvps
  for select to anon, authenticated using (true);

drop policy if exists "rsvps_insert_public" on public.rsvps;
create policy "rsvps_insert_public" on public.rsvps
  for insert to anon, authenticated with check (true);

drop policy if exists "rsvps_delete_public" on public.rsvps;
create policy "rsvps_delete_public" on public.rsvps
  for delete to anon, authenticated using (true);

-- Sponsorships: INSERT only for anon — NO SELECT for anon
drop policy if exists "sponsorships_insert_public" on public.sponsorships;
create policy "sponsorships_insert_public" on public.sponsorships
  for insert to anon, authenticated with check (true);

drop policy if exists "sponsorships_delete_own_week" on public.sponsorships;
create policy "sponsorships_delete_own_week" on public.sponsorships
  for delete to anon, authenticated using (true);

-- admin_sessions: no direct client access (Edge Function uses service role)
drop policy if exists "admin_sessions_deny" on public.admin_sessions;
create policy "admin_sessions_deny" on public.admin_sessions
  for all to anon, authenticated using (false) with check (false);

-- Note: Edge Function reads sponsorships with the service role key, which bypasses RLS.
