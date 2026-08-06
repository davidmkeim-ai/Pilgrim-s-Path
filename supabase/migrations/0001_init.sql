-- Family Scripture app schema.
--
-- Design note: trails/waypoints/verses are NOT stored here. They live as JSON
-- under /content in the app repo (see src/lib/content.ts) so the user can author
-- and evolve curriculum without a schema migration or DB round-trip. Tables in
-- this file only hold per-family *dynamic* data (progress, journal, unlocks),
-- and reference content by its stable string id (e.g. "creation-and-covenant-2")
-- rather than a foreign key, since the content itself isn't in Postgres.
--
-- Auth model: one Supabase Auth user represents the whole family (no per-kid
-- login). RLS below simply requires "is authenticated" rather than scoping by
-- a family_id, since each family runs its own Supabase project.

create extension if not exists "pgcrypto";

-- Family member profiles, switched between in-app (not separate logins).
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar text,
  role text not null check (role in ('parent', 'child')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- One row per (profile, waypoint) tracking spaced-repetition memorization state.
create table memorization_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  waypoint_id text not null,
  status text not null default 'learning' check (status in ('learning', 'mastered')),
  ease_factor numeric not null default 2.5,
  interval_days int not null default 0,
  repetitions int not null default 0,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id, waypoint_id)
);

-- Log of every practice attempt (transcript + score), which the AI coach uses
-- to notice when someone is struggling on a specific waypoint.
create table practice_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  waypoint_id text not null,
  transcript text,
  score int,
  created_at timestamptz not null default now()
);

-- The family scrapbook/journal feed.
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  waypoint_id text,
  kind text not null check (kind in ('text', 'photo', 'audio', 'parent_message', 'auto_milestone')),
  content text,
  media_url text,
  created_at timestamptz not null default now()
);

-- Biblical places for the unlockable map (Phase 2). Seeded from OpenBible.info
-- geocoding + Wikidata/Wikimedia at content-authoring time, not fetched live.
create table map_places (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  lat numeric not null,
  lng numeric not null,
  image_url text,
  facts jsonb not null default '{}'::jsonb,
  attribution text,
  created_at timestamptz not null default now()
);

create table map_unlocks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade, -- null = family-wide unlock
  place_id uuid not null references map_places(id) on delete cascade,
  waypoint_id text,
  unlocked_at timestamptz not null default now()
);

-- Weekly relational challenges (Phase 2), e.g. "quote this verse to grandma".
create table challenges (
  id uuid primary key default gen_random_uuid(),
  waypoint_id text not null,
  cadence text not null default 'weekly',
  prompt text not null,
  target_person text,
  created_at timestamptz not null default now()
);

create table challenge_completions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  journal_entry_id uuid references journal_entries(id) on delete set null,
  completed_at timestamptz not null default now()
);

-- Row Level Security: the single family auth account can read/write everything.
-- No public/anon access.
alter table profiles enable row level security;
alter table memorization_progress enable row level security;
alter table practice_attempts enable row level security;
alter table journal_entries enable row level security;
alter table map_places enable row level security;
alter table map_unlocks enable row level security;
alter table challenges enable row level security;
alter table challenge_completions enable row level security;

create policy "family full access" on profiles for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "family full access" on memorization_progress for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "family full access" on practice_attempts for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "family full access" on journal_entries for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "family full access" on map_places for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "family full access" on map_unlocks for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "family full access" on challenges for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "family full access" on challenge_completions for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Storage bucket for journal photos/audio (parent messages, milestone snapshots).
insert into storage.buckets (id, name, public)
values ('journal-media', 'journal-media', false)
on conflict (id) do nothing;

create policy "family read journal media" on storage.objects for select
  using (bucket_id = 'journal-media' and auth.uid() is not null);
create policy "family write journal media" on storage.objects for insert
  with check (bucket_id = 'journal-media' and auth.uid() is not null);
create policy "family delete journal media" on storage.objects for delete
  using (bucket_id = 'journal-media' and auth.uid() is not null);
