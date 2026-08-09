# Dev Log

Running record of what's been built, why, and where things live — kept for future reference. Secrets are never written here; only *which* secret exists and *where* it's stored.

## Accounts & infrastructure set up

- **Supabase project**: "Family Scripture App" (`uaawkglcubbskproxhyc`), region us-west-2. One family Auth user created (email/password) — the single shared login for the whole household; individual profiles are switched in-app, not separate accounts.
- **Expo/EAS**: account `swocevol`, project linked (`f8ece10d-75a3-4b20-b678-0e9ec47d5681`). iOS bundle id `com.swocevol.familyscriptureapp`. Apple Developer account (Team: David Keim, individual) used for provisioning; device registered for ad-hoc/development installs.
- **Supabase CLI**: linked locally, used to deploy Edge Functions and set secrets (`npx supabase ...`).
- **API keys obtained by the user, stored server-side only** (Supabase secrets, never in the app bundle or `.env`'s `EXPO_PUBLIC_*` vars):
  - `ANTHROPIC_API_KEY` — Claude, powers the AI coach (hints + verse-finder Q&A)
  - `ESV_API_KEY` — from api.esv.org, non-commercial free tier
  - `API_BIBLE_KEY` — from scripture.api.bible, non-commercial free tier, used for CSB

## Phase 1 — Foundation

- Scaffolded with `create-expo-app` (Expo SDK 57, Expo Router, TypeScript, NativeTabs).
- Data model split deliberately: **curriculum content (trails/verses) lives as JSON in `/content`**, not the database — lets the user author/evolve their own memorization outline without schema changes. **Supabase only stores dynamic family data** (profiles, progress, journal, unlocks) — see `supabase/migrations/0001_init.sql`.
- Core loop built: profile switcher (no per-person login) → Trails → practice a verse via on-device speech recognition (`expo-speech-recognition`) → word-level scoring (`src/lib/verseMatch.ts`) → SM-2 spaced repetition scheduling (`src/lib/srs.ts`, `src/lib/progress.ts`) → auto-logged to the family Journal/scrapbook on first mastery.
- Sample trail: "Creation & Covenant" (4 verses, WEB translation bundled locally) — placeholder content, verse text should be verified against an authoritative WEB source before relying on it.
- First TestFlight-style install: EAS **development build** (not App Store/TestFlight submission yet), installed via direct link, device registered for ad-hoc provisioning, developer profile trusted on-device.

## Phase 2a — AI Practice Coach

- New Supabase Edge Function `ai-coach` (`supabase/functions/ai-coach/index.ts`), proxies Claude (`claude-haiku-4-5-20251001`) so the API key never ships client-side.
- Two modes: `hint` (indirect nudge while practicing, doesn't just reveal the answer) and `ask` (verse-finder Q&A). System prompt hard-refuses theology/doctrine questions and redirects to a parent instead — verified working via direct curl tests.
- Client wrapper: `src/lib/aiCoach.ts`.

## Phase 2b — "Bible Buddy" (merged chat + free-form practice)

- Renamed the Practice tab/route to **Bible Buddy** (`src/app/practice.tsx` → `src/app/bible-buddy.tsx`), icon changed to reflect chat+practice combined.
- New Edge Function `verse-lookup` (`supabase/functions/verse-lookup/index.ts`) fetches live verse text: ESV via Crossway's API directly, CSB via API.Bible (requires converting the reference to USFM book-code format and resolving CSB's `bibleId` — the parsing/conversion logic lives entirely in the function). Both verified working via curl, including multi-word book names and whole-chapter lookups.
- Ad hoc (non-trail) verses practiced in Bible Buddy get a synthetic id (`adhoc:<translation>:<reference>`) so they still get SM-2 scheduling and journal logging — no schema change needed since `waypoint_id` was already free-text, no foreign key.
- Trail-linked practice (tapping a verse inside a Trail) still works exactly as before, now inside the shared `VersePracticePanel` component.

## Phase 2c — Voice feedback (Stage 1 of the longer-term voice-conversation goal)

- Added `expo-speech` (TTS) — **new native module, required a fresh EAS development build** (unlike 2a/2b, which were pure JS/config and worked via app reload against the existing dev-client).
- `src/lib/voice.ts`: `speakAsync`, `stopSpeaking`, `feedbackPhraseForScore`, persisted mute toggle (`useVoiceEnabled`, AsyncStorage).
- In `VersePracticePanel`: says "Go ahead" before listening starts (sequenced *after* speech finishes, to avoid the mic picking up the phone's own voice), speaks short feedback after scoring, speaks the AI hint when requested. 🔊/🔇 toggle in the panel header.
- **Longer-term voice vision** (not yet built): voice-driven verse selection (say the reference instead of typing it), and mid-recitation voice commands ("help me with the next word"). Deliberately staged — a phone can't reliably listen and speak simultaneously without echo, so "interrupt anytime" needs careful sequencing, not naive always-on listening. This is Stage 1 of 3.

## Phase 2d — Mic-first voice flow (Stages 2+3)

- New `ai-coach` mode `parse`: turns a spoken phrase ("recite John three sixteen", "look up first John four eight in the CSB") into structured `{reference, translation}` JSON via Claude — chosen over a hand-written regex parser because spoken references are too fuzzy for that. Verified via curl on clean input, translation-specified input, and garbage input (correctly returns nulls).
- `VersePracticePanel`'s recitation went from "score on first pause" to **chained single-shot listening segments** with trigger-phrase detection between them: say "help" → get a spoken hint → auto-resume listening; say "I'm done" → finalize early; otherwise auto-finalize once word coverage hits 90%, else keep chaining. Deliberately avoids `expo-speech-recognition`'s `continuous: true` mode — it has a confirmed bug where it stops after ~3s on iOS 18 ([issue #77](https://github.com/jamsch/expo-speech-recognition/issues/77)).
- New `VoiceLookupPanel` (mic button in Bible Buddy's "Practice a Verse" section, above the typed input which still works as a fallback): tap → listen for a spoken verse request → parse it → speak a confirmation while looking it up → hand off to `VersePracticePanel` with `autoStart` (which speaks "Go ahead" and starts listening on its own).
- Important implementation detail: `VoiceLookupPanel` and `VersePracticePanel` are never mounted at the same time (`AdHocPracticePanel` swaps between them via a `resolvedVerse` state) — `expo-speech-recognition`'s events are global/not session-scoped, so two simultaneously-mounted listeners would both react to whichever recognition session is actually running.
- No new native module in this phase — pure JS/edge-function changes, works via a normal dev-client reload.
- Voice *character* (less robotic, warmer/accented) is explicitly deferred — decided to build the mic-first flow first on the stock on-device voice; ElevenLabs vs. tuning on-device voice params is a follow-up decision.

## Standalone preview build

- The **development** build (used for everything above) only runs while connected to the Metro dev server on the dev computer over the same WiFi — fine for active building, useless away from home.
- Built a **preview** build (`eas.json`'s `preview` profile, already scaffolded from the original `eas build:configure`) — JavaScript is bundled at build time instead of fetched live, so it's a fully standalone app once installed. Needed its own copy of the Supabase env vars registered under the `preview` EAS environment (`eas env:create ... --environment preview`) since environments are separate per build profile.
- This build only has whatever code existed at build time — it won't pick up future JS-only changes automatically like the dev-client does. Rebuild via the same `eas build --profile preview --platform ios` command whenever a fresh standalone copy is needed.

## Map framework (mechanics only — no real places/art yet)

- Places live as bundled JSON under `content/places/*.json` (same "content in JSON, not DB" pattern as trails), loaded via `getAllPlaces`/`getPlaceBySlug`/`getPlacesUnlockedByWaypoint` in `src/lib/content.ts`. One placeholder demo place (`eden.json`) exists purely to make the mechanic demonstrable — real places/map art are a later decision.
- **Schema change**: `map_unlocks.place_id` (an FK to a `map_places` Postgres table that was never populated) was replaced with a free-text `place_slug` column — migration `supabase/migrations/0002_map_unlocks_by_slug.sql`, **needs to be run in the Supabase SQL Editor** (sent separately) before unlocks will actually persist.
- Unlock mechanic (`src/lib/mapUnlocks.ts`): each place JSON declares `unlockedByWaypointIds` (any one mastering it unlocks the place). Hooked into `applyAttemptResult` (`src/lib/progress.ts`) — the same function that already handles SM-2 scheduling and the journal auto-milestone — so mastering a tied verse unlocks the place, logs a second journal entry ("the family map just grew…"), and Bible Buddy's save confirmation mentions the unlock by name.
- Unlocks are **family-wide** (`profile_id: null`), not per-kid — one shared map the whole family explores together, matching the original "family journey" framing rather than individual progress tracking.
- New **Map** tab (`src/app/map.tsx`): placeholder canvas (no real art yet) with markers positioned via each place's `mapX`/`mapY` (0-1 fraction, not real lat/lng — those are kept on the Place record for later facts/photo sourcing but aren't used for on-map placement). Locked places render nothing at all (true fog-of-war, not a greyed-out teaser) — they simply pop in once unlocked. Home screen's map card now shows real "X of Y discovered" progress instead of "coming soon."

## Family Journal redesign — worn leather field journal

- Visual direction was mocked up first as a standalone HTML/CSS artifact (torn edges, ink colors, page-turn) before touching the app, iterated with the user (dropped brass/polished hardware in favor of a beat-up "Indiana Jones journal" look — scuffed saddle-brown leather, unbuckled loose strap, water stains, dog-eared corners) — then rebuilt as the real screen once the direction was approved.
- **Real photographed textures**, not CSS gradients: `assets/textures/leather.jpg` and `paper.jpg`, sourced from ambientCG's CC0 (public domain) library via Wikimedia Commons (`Leather003_4K_Color.png`, `Paper002_4K_Color.jpg`), downsized to 1536px JPEGs. No attribution required (CC0), but noted here for provenance. Paper is a neutral fiber-grain photo tinted warm/parchment in-app (`JournalColors.parchmentTint`) rather than sourcing an already-colored "old paper" photo, so the tone stays tunable.
- New `src/constants/journal-theme.ts` — deliberately separate from the app's main `theme.ts` tokens, since this screen is an intentional "different visual world," not part of the neutral app chrome. Includes a 4-color ink palette assigned per family member (`inkColorForProfile`, hashed from profile id, so each person's handwriting color is consistent across entries) and font stacks (`HandFont`/`JournalDisplayFont`).
- `src/app/journal.tsx` rebuilt as an actual book: entries paginate into pages/spreads (3 entries/page), rendered inside `ImageBackground` leather + parchment textures via the new `src/components/journal-page-entry.tsx` (handles text/photo/audio/parent_message/auto_milestone kinds, reusing the existing `getSignedMediaUrl` signed-URL pattern). Opens on the most recent spread, Prev/Next to page back through history. The composer (post text/photo, parent audio recording) is unchanged functionally, just sits above the book using normal app chrome.
- No new native dependency — `ImageBackground` and plain `View`/`Text` styling only, so this ships via a normal reload once the phone reconnects, no EAS build needed.
- Deliberately deferred: real bundled handwriting fonts (currently using iOS's built-in "Bradley Hand" via `Platform.select`, generic fallback elsewhere — bundling 2-3 licensed fonts like Caveat/Kalam via `expo-font` is an easy follow-up); animated/gesture page-turn (currently Prev/Next buttons, not a swipe or curl animation — adding `react-native-reanimated`-driven page-turn is possible without a new native module since reanimated's already a dependency, just not built yet).

## Voice: switched to British English

- `speakAsync` (`src/lib/voice.ts`) now passes `language: 'en-GB'` to every `Speech.speak` call, which alone gets iOS's built-in British voice (always present, no download needed). It also queries `Speech.getAvailableVoicesAsync()` once (cached) and upgrades to an "Enhanced" quality en-GB voice if the user has downloaded one via Settings → Accessibility → Spoken Content → Voices — graceful upgrade, not a hard requirement. Slightly relaxed rate (0.95) for a calmer read; pitch left close to natural (0.98) since a good voice doesn't need much correction, unlike the flat default.
- No new dependency, no new build needed.

## Bible Buddy persona

- User generated character art (an AI-illustrated elderly scribe/sage) via their own tool, saved to their Windows Pictures folder (OneDrive-redirected — worth remembering that `~/Pictures` isn't a real path here, resolve via `[Environment]::GetFolderPath('MyPictures')` if this comes up again). Cropped with `sharp` into two app assets: `assets/bible-buddy/avatar.jpg` (square face crop for a circular avatar) and `assets/bible-buddy/banner.jpg` (wide crop of a candlelit writing-desk scene).
- Used tastefully, not plastered everywhere: a banner with scrim + avatar at the top of the Bible Buddy screen (works for both the trail-linked and ad hoc views), a small avatar next to the Chat panel's intro and next to each of its answers, and the mic-first lookup button now shows his face with a small mic badge instead of a generic circle/emoji.
- No new dependency (`expo-image`, already used elsewhere for photos) — ships via reload, no new build.

## Rebrand: "Pilgrim's Path"

- User generated a full icon/banner branding set (same AI-illustration workflow as the Bible Buddy persona), saved to the OneDrive-redirected Pictures folder as a single composite image. App renamed from the generic "family-scripture-app" to **Pilgrim's Path** — updated in `app.json` (`expo.name`; deliberately left `slug`/`scheme`/bundle id unchanged since those are tied to the EAS project and deep-link scheme, not user-facing) and the in-app web tab bar brand label.
- Icon source had baked-in rounded corners from the mockup presentation (not a full-bleed square) — inset-cropped past the rounding with `sharp` before upscaling to 1024×1024, so iOS's own corner mask doesn't reveal white slivers underneath. Replaced the default Expo Icon Composer bundle (`assets/expo.icon/`, deleted — unused now) with a plain PNG at `assets/images/icon.png`, which `ios.icon` now points to directly.
- Splash screen background color changed from Expo's default blue to the new parchment tone, image swapped to the new icon art.
- **App-wide theme (`src/constants/theme.ts`) recolored to a parchment palette** sampled from the branding art itself (`#F3EAD3` light background, warm dark-brown `#1E1811` for dark mode) rather than the previous neutral grey/white — this affects every screen, not just Journal/Bible Buddy, since it's the base `Colors.light`/`Colors.dark` tokens `ThemedView`/`ThemedText` already read everywhere.
- Banner art saved (`assets/images/pilgrims-path-banner.jpg`) but not wired into a screen yet — a good candidate for a Home header or future About screen.
- **Requires a new build** (icon/name are baked into the native binary, unlike the JS-only changes elsewhere this session) — kicked off `eas build --profile development` to bundle this alongside everything else from today in one install.
- Known rough edge: icon art is a bit soft since the usable source region was smaller than 1024px before upscaling — fine for now, a higher-resolution regenerate would sharpen it if it bothers you at full size (e.g. App Store listing).

## Bug fix: silent hang when speech recognition catches nothing

- Found while the user was testing tonight: both `VoiceLookupPanel` and `VersePracticePanel` only handled the `'result'` and `'error'` events from `expo-speech-recognition`. When the recognizer gives up without firing either (too quiet/too short an utterance) it just emits `'end'` — which neither component was listening for as a fallback, so the UI went silently stuck ("Listening…" forever in the lookup mic, or just quietly stopped with zero feedback in the recitation mic — explaining "I didn't hear anything at the end").
- Fixed with a `segmentHandledRef`/`activeRef` guard: if `'end'` fires and no `'result'`/`'error'` already handled that segment, treat it as an empty segment (reuses the existing retry/give-up logic in `VersePracticePanel`, and surfaces a clear "I didn't catch that — try again" in `VoiceLookupPanel` instead of hanging).
- JS-only fix, ships via reload, no new build.

## Bug fix + accuracy improvement: recitation feedback and mishearing

- Found while testing: when speech recognition misheard a recitation badly enough (real example: "God so loved" heard as "Godzilla"), the low match score never crossed the 90% auto-complete threshold, so `VersePracticePanel` just kept silently re-listening instead of ever telling the user how they did. Fixed the give-up path (`MAX_EMPTY_SEGMENTS` reached) to always finalize and score whatever was heard, instead of showing a dead-end "stopped listening" message with no result.
- Added iOS's `contextualStrings` vocabulary-hinting option to both recognition calls: `VersePracticePanel` biases toward the actual target verse's own words (directly targets the "Godzilla" class of misheard-as-something-more-common error), and `VoiceLookupPanel` biases toward a static list of Bible book names. Doesn't guarantee perfect accuracy (on-device STT has real limits) but should measurably reduce this class of error.
- JS-only, ships via reload, no new build.

## Note: two build tracks, don't confuse them

- **Development build**: what we use for live testing during a work session — needs the Metro dev server running on the dev machine, same WiFi. JS changes show up on reload, no rebuild needed.
- **Preview build**: fully standalone, JS bundled at build time — works anywhere, but goes stale the moment more JS changes happen. User left the house expecting the standalone build to have tonight's work and it didn't, because only the development build had been updated. Rebuilt preview to bring it current. **Remember to rebuild preview periodically if the user wants an always-current away-from-home copy** — it doesn't happen automatically.

## Ask mode: Bible statistics allowed

- Expanded `ai-coach`'s FINDER mode (used by the Chat panel's "ask" flow) to also answer factual/statistical questions about the text -- word counts, frequency across a book/testament/whole Bible, chapter counts, etc. -- alongside its existing verse-finder job. Theology/interpretation stays hard-refused exactly as before (verified: "why does the Bible mention love so much, what does that mean about God" still correctly redirects to a parent, even though it's phrased adjacent to a stats question).
- Important accuracy caveat, and the system prompt says this explicitly every time: Claude has no live concordance/text-search tool here -- it's recalling counts from training, not querying real text, so answers are approximate and can vary by translation (different English translations use different words for the same underlying text). Verified via curl: "love" in John came back "approximately 30-40 times... depending on translation," not a bare confident number. Good enough for family trivia/curiosity; not a citable exact source.
- No client changes needed -- same `askBibleQuestion`/Chat panel, just a broader system prompt.

## Map redesign: visible pins + tap-to-trail + pinch/pan zoom

- Reversed the original "true fog of war" design (locked places rendered nothing at all) based on direct feedback -- pins are now always visible. Locked ones show a muted "?" marker (mystery preserved); unlocked ones show the pin plus a persistent name + description label (no more tap-to-reveal detail card).
- Added `Place.trailSlug` (content model + `eden.json`) so a pin is a direct entry point into its trail, not just a reward gallery -- tapping any pin (locked or unlocked) navigates to `/trails/[slug]`. This means locked pins are actionable: tap one to go start working toward unlocking it.
- Real pinch-to-zoom + drag-to-pan on the map canvas via `react-native-gesture-handler` + `react-native-reanimated`'s Gesture API (`Gesture.Pinch`/`Gesture.Pan`/`Gesture.Tap` composed with `Gesture.Exclusive`/`Gesture.Simultaneous`), double-tap to reset. Both libraries were already dependencies (reanimated v4 + `react-native-worklets`, from the original template) -- no new native module, ships via reload.
- Had to add `GestureHandlerRootView` wrapping the whole app in `src/app/_layout.tsx` -- required by gesture-handler, wasn't set up yet since nothing had used real gestures until now.
- Screen restructured to drop the outer `ScrollView` in favor of a fixed header + flex-filled map viewport, specifically to avoid gesture conflicts between the map's own pan gesture and a page-level scroll gesture (both trying to claim vertical drag).
- **Not verified on-device** -- gesture interactions (especially pan vs. Pressable tap conflicts, and whether `GestureHandlerRootView` needed any other wiring) are inherently something that needs a real touchscreen to confirm; typecheck/lint are clean but that's not the same as confirming the feel is right. Please test pinch/pan/tap directly and report back if anything feels off (e.g. taps not registering, pan fighting with pin taps).

## Map artwork: real AI-generated terrain image

- Replaced the flat background color behind the map pins with a real illustrated map image (`assets/map/base-map.jpg`), rendered via `expo-image` and absolutely positioned to fill the gesture canvas behind the pins.
- Source: user-generated via their own AI image tool, from a prompt I wrote specifying the brief -- aerial/top-down illustrated fantasy map style, a walled circular garden (Garden of Eden) at the exact center with four rivers flowing outward to the four edges (the Genesis 2:10 "four rivers" motif), surrounding terrain a mix of green hills and golden-brown wilderness with forest clusters and mountains at the corners. Original file saved to the user's own Pictures folder, not sourced from any stock/CC0 library -- provenance is "user's own AI-generated commission," not a licensed third-party asset.
- Processing: the user generated a second, larger pass ("Pilgrim's Path World Map", 4096x4096 PNG) after seeing an initial lower-res version -- that's the one actually bundled. Converted straight to JPEG quality 90 via `sharp` (no upscaling needed), landing at ~3.6MB in `assets/map/base-map.jpg`. Plenty of headroom for the map's 4x pinch-zoom.
- The "no places yet" empty-state message now overlays on top of the map image instead of replacing it, so the terrain art always renders regardless of place data.
- Deliberately did *not* build a procedural/programmatic placeholder for this -- the user has a working AI-image-generation workflow they wanted used for real art from the start, not code-generated filler.
- Architected to be layered on later (buildings, decorations) and expandable (more terrain/trails) -- this is just the base terrain layer. The "everything shrouded in black except the first pin" fog-of-war-over-terrain idea is explicitly future work, not part of this pass.

## 26 new trails + branching map paths

- Authored the family's full curriculum outline as 26 new trail JSON files under `/content/trails`, following the exact same format as the original `creation-and-covenant.json` -- fully hand-editable, no schema changes. Each trail is a `story` intro, 2-5 `verse` waypoints, and a closing `journal_prompt` or `challenge`; `books-of-the-bible.json` is structural (mostly `story` waypoints, one per book grouping) rather than memorization-focused, and `creeds.json` is a deliberate placeholder (`_readme` field explains it) with a single "Coming Soon" story waypoint and no verses -- its place therefore has `unlockedByWaypointIds: []` and will never auto-unlock until real creed lines are added later.
- Added ~72 new verse text entries to `content/verses/web.json`, reorganized in canonical Bible-book order (was previously just 4 entries in file order) to make it easier to find and hand-edit entries as the curriculum grows. Same accuracy caveat as before applies -- reconstructed from memory, not yet checked against an authoritative WEB source.
- **Map paths**: added 26 new `Place` entries (one per new trail) and a new optional `Place.connectsFrom` field (a parent place's slug) so the map can render route lines, not just isolated pins. Places are laid out along the four rivers already present in the base map art, radiating from Eden as four separate branching paths a family can explore in any order:
  - **South** (the historical Old Testament spine): Eden -> Fall -> Patriarchs -> Exodus Journey.
  - **North** (the gospel arc): Eden -> Sin -> Messianic Prophecy -> Covenants -> Trinity -> Romans Road -> Church -> Holy Spirit -> Heaven (placed at the map's very edge -- the furthest point from the garden, intentionally).
  - **East** (Christian character growth): Eden -> War Within -> Obedience -> Discipleship -> Faithfulness -> Endurance -> Patience -> Peace -> Love One Another -> Grace -> Mercy.
  - **West** (Scripture & worship): Eden -> God's Word -> Highlights of Psalms -> Books of the Bible -> Prayer -> Creeds (placeholder).
- Unlocking stays independent per place (mastering a trail's first verse unlocks its own pin) -- paths don't gate each other, so a family can jump straight to any branch rather than being forced to go in path order.
- Installed `react-native-svg` (new native module -- **requires a fresh EAS development build**, same as `expo-speech` was) and render path lines as a new `Svg` layer between the terrain image and the pins in `map.tsx`. Uses `viewBox="0 0 1 1"` with `preserveAspectRatio="none"` so line coordinates share the exact same 0-1 fractional space as the existing `mapX`/`mapY` pin positioning -- no separate coordinate system to keep in sync. Each path segment is drawn as two overlaid `Line`s (a soft dark underline + a light dashed overlay) for a hand-drawn trail look against the varied terrain colors, using `vectorEffect="non-scaling-stroke"` so line thickness stays constant through pinch-zoom.
- Kicked off a new EAS development build (`eas build --profile development --platform ios`) to pick up the native module -- until that's installed on-device, the path lines/new trails won't render, but everything is JS/content otherwise and needs no other native change.
- **Not yet verified on-device** -- same caveat as the earlier gesture work: needs a real device (and the new dev-client build) to confirm the path lines render correctly, don't visually clash with the terrain art, and that 27 pins at this density are still tappable without overlap.

## Post-device feedback: gesture fix, map web, expanded trails

First real on-device testing of the map surfaced three pieces of feedback, all addressed in this pass:

- **Pinch-to-zoom felt off.** Root cause was two-fold: (1) the pinch gesture only ever scaled around the canvas's fixed center, never toward wherever the user's fingers actually were, so zooming visually "slid" the map out from under their fingers; (2) there was no pan-bounds clamping, so it was easy to drag the huge map fully off-screen and feel lost. Fixed both in `map.tsx`: the `GestureDetector` now wraps a stable, untransformed `gestureLayer` view (measured via `onLayout` into `viewportWidth`/`viewportHeight` shared values) with the animated transform applied only to the inner canvas -- this keeps pinch focal-point math (`e.focalX`/`e.focalY`) in a coordinate space that isn't itself moving during the gesture, which is the standard fix for this class of jank. The pinch gesture now solves for the content-local point under the fingers at gesture start (`focalPointLocal`) and re-derives `translateX`/`translateY` every frame so that point stays glued under the fingers as scale changes, instead of zooming toward center. Pan and pinch both now clamp translation to `±viewportSize*(scale-1)/2`, so at scale 1 there's no pan (nothing to reveal) and panning room grows proportionally as you zoom in -- standard photo-viewer feel.
- **Paths were four isolated straight lines, not a "web."** Added an optional `Place.crossLinks: string[]` field (alongside the existing single-parent `connectsFrom`) so a place can have secondary connections in addition to its primary spine parent. Added 13 hand-picked, thematically-justified cross-links between the four spines (e.g. Fall<->Sin since the Fall *is* the origin of sin, Spirit-and-Flesh<->God's Word echoing Ephesians 6:17's "sword of the Spirit," Patriarchs<->Covenants since the Abrahamic covenant was made to the patriarchs, Holy Spirit<->Spirit-and-Flesh since the Spirit empowers that fight) -- see each cross-linked place's `crossLinks` field for the full list. Rendered in `map.tsx` as a third, visually distinct `Line` layer: thin, semi-transparent, tightly dashed, so the four primary spine paths still read as the "main" trails and cross-links read as optional shortcuts/connections, matching the "you don't have to go the same way" design goal.
- **Trails felt thin at 3 verses.** Expanded every trail from 3 to 5 verse waypoints (22 trails got +2, `covenants` and `creation-and-covenant` got +1 since they were already at 4), inserting new verses in a sensible chronological/thematic position rather than just appending, and renumbering waypoint ids/`sortOrder` sequentially. The first verse waypoint stayed at position 2 in every trail (`<slug>-2`), so no `Place.unlockedByWaypointIds` references needed to change. Two intentional exceptions, left as-is: `romans-road` (already a fixed, recognizable 5-verse sequence -- padding it would dilute the "Romans Road" concept) and `books-of-the-bible` (structural overview trail, 1 anchor verse by design, not a memorization-heavy trail). Added ~46 more entries to `content/verses/web.json` (now ~120 total), still in canonical Bible-book order.
- None of this required a new native module or EAS build -- all three fixes are pure JS/content changes on top of the dev-client build already installed, so a Metro reload (`npx expo start --dev-client`) is enough to see them.

## Open items / known rough edges

- Bundled WEB verse text in `content/verses/web.json` is placeholder (reconstructed from memory) — verify against an authoritative source before real family use.
- Weekly challenges: schema exists (`challenges`, `challenge_completions`) but no UI yet. Creeds content is intentionally a placeholder trail (see above) -- add real creed lines when ready.
- The 26 new trails were authored in one pass and haven't been reviewed verse-by-verse by the family yet -- treat them as a strong first draft of the curriculum, not final.
- Journal/scrapbook is functional but visually plain — the "worn paper, flippable pages, handwriting" scrapbook redesign is a planned future project, not started.
- Only tested via Expo dev-client builds so far — no App Store/TestFlight submission (`eas submit`) yet.
- Segmented recitation's 90%-coverage auto-completion threshold and the help/done trigger phrase lists (`src/lib/voice.ts`) are first-pass numbers — expect to tune after real family use.
- Voice character is still the stock on-device TTS voice — a warmer/accented voice (e.g. via ElevenLabs) is a deferred decision, not yet built.
