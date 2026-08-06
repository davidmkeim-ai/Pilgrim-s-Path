# Family Scripture App

A family scripture memorization app: profiles for everyone (no separate logins), spaced-repetition
practice with an on-device speech listener, and a family journal/scrapbook that grows as you go.
See [`AGENTS.md`](./AGENTS.md) and the architecture notes below before making changes.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** (or use an existing one) and copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

   Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from your Supabase
   project's API settings. `SUPABASE_SERVICE_ROLE_KEY` is only needed later, for content-seeding
   scripts — never commit it.

3. **Run the schema migration** — paste `supabase/migrations/0001_init.sql` into the Supabase SQL
   Editor and run it. This creates all tables, Row Level Security policies, and the
   `journal-media` storage bucket.

4. **Create the one family login** — in Supabase Dashboard → Authentication → Users, add a single
   user (e.g. your own email) with a password. This is the *one* shared login for the whole
   family; individual profiles are created inside the app after signing in, no separate accounts
   needed per person.

5. **Start the app**

   ```bash
   npx expo start
   ```

   Open in a development build (recommended, since speech recognition/audio need native modules —
   Expo Go won't fully work) or run `npx eas build --profile development --platform ios` and
   install via TestFlight.

## Architecture

- **Trails/waypoints/verses live in `/content` as JSON**, not in the database — see
  [`src/lib/content.ts`](./src/lib/content.ts). This is deliberate: your curriculum (which verses,
  in what order, grouped into what themes) is meant to evolve over time without a schema
  migration. Add a new file under `content/trails/`, register it in `content.ts`, done.
- **Supabase only stores dynamic family data** — profiles, memorization progress, journal entries,
  practice attempts, map unlocks, challenge completions. These reference content by its stable
  string id (e.g. `"creation-and-covenant-2"`), not a foreign key, since the content itself isn't
  in Postgres.
- **One shared Supabase Auth account** for the whole family (see step 4 above). Row Level Security
  just checks "is authenticated" — no per-person auth, no family_id scoping, since each family runs
  its own Supabase project. In-app profile switching (see
  [`src/context/profile-context.tsx`](./src/context/profile-context.tsx)) is separate from that
  auth session and just tracks who's "active" locally.
- **Practice/scoring is fully on-device** — `expo-speech-recognition` transcribes, and
  [`src/lib/verseMatch.ts`](./src/lib/verseMatch.ts) does a word-level LCS diff against the
  bundled verse text. No AI call, no network dependency, for the core "did I say it right" loop.
- **Spaced repetition** — [`src/lib/srs.ts`](./src/lib/srs.ts) implements SM-2; see
  [`src/lib/progress.ts`](./src/lib/progress.ts) for how a practice score turns into the next
  review date.

## What's not built yet (see the plan)

Map unlocks, weekly relational challenges, and the Claude-powered AI coach (hints + "find this
verse" Q&A, restricted from answering theology) are staged as fast-follow phases — the
`map_places`, `map_unlocks`, `challenges`, and `challenge_completions` tables already exist in the
schema, but there's no UI for them yet.

## Verifying changes

- `npx tsc --noEmit` — typecheck
- `npx expo export -p ios` — bundle-check without needing a simulator/Mac
- `npx expo start` — run for real; speech recognition and audio recording need a physical device
  or a development build, not the iOS Simulator/Expo Go
