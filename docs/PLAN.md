# Mind Map Meadow — Project Plan

Owner: Chong · Project Lead: Claude · Last updated: 2026-11-09

## Vision
People quit long-term goals (saving money, fitness, learning) because the payoff is far away. Mind Map Meadow makes progress visible **every day**: real tasks and money logs grow a pixel town (SimCity-inspired — you're the builder), and an AI resident lives in it and notices your progress. Built for the owner now, friends next, public later.

## Principles (non-negotiable)
1. **Consistency over bursts** — the town grows a little every day you show up; a daily limit stops one-day binges.
2. **Reward honesty, not outcomes** — reward the act of logging, never the amount: a splurge still counts, a weigh-in counts whatever it says.
3. **Never destroy earned progress** — no disasters, streak resets or clawbacks; bad weeks show as rain/sleepy streets and recover with one good action.
4. **Fast** — logging and collecting take under 5 seconds.
5. **Our own art** — one style guide, drawn ourselves; reference images are never copied.
6. **Privacy** — money notes and health data never go to an LLM or to friends; integration tokens are stored encrypted.
7. **Never pay-to-win** — summons, workers, coins and speed-ups are never sold for real money.

## Where we are
| Area | Status |
|---|---|
| Foundations: per-user data, timezones, atomic coins | ✅ `dev` |
| Money: Quick log with categories + details, Money page, savings goals as construction sites | ✅ `dev` |
| Builder Loop v1: buildings, workers, summons, merging, zones, sleepy town, catch-up, guided first day | ✅ `dev` |
| Hardening: localhost-only ports, DB wait on boot, migration tracking, coin ledger, 1007-check test suite | ✅ `dev` |
| Accounts: Google sign-in, linked-login table (`user_identities`), friends + read-only visits | ✅ `dev` |
| UI: lighter task form and Quick log, page addresses (`/tasks`, `/calendar`, `/daily-tasks`, `/money`), right-click = back, normalised movement | ✅ `dev` |
| Owner's test week | 🟡 now |

## Next, in order (agreed 2026-11-09 with the Business Manager's notes)
The goal of this stretch: **get friends in for a 4-week test and be able to measure it.**

| # | Item | Size | Why now / depends on |
|---|---|---|---|
| 1 | **Visit tracking**: `activity_events` (opened, task done, log, collect; by local day) + a weekly report of active days and week-1 → week-4 retention | S | Without it the test can't answer "keep going?". Event type and day only, never content. |
| 2 | **Account deletion + data export** (JSON of everything; deletion also ends sessions) | M | Trust before strangers join; required before health data and before charging. |
| 3 | **Shortcut key settings** (plan below) | S | Owner asked. |
| 4 | **AI resident on Claude** (Haiku reactions with prompt caching, batched daily reflection; per-user call caps, a spend alert, a rule-based fallback; Ollama stays for dev) | M | A hosted app has no Ollama, so the resident would be silent. **Needs the owner's Claude API key.** |
| 5 | **Test hosting**: `staging` site with HTTPS, secure cookies, CSP, daily DB backups, privacy policy + terms; then an installable web app (PWA) with one optional daily reminder (never guilt) | M–L | Friends can't test localhost; push needs HTTPS. **Owner creates the host account and buys the domain.** |
| 6 | **Landmarks** (moved up from v1.1): consistent weeks build toward a world landmark | M | A steady player hits their first Lv3 around day 21 and then has no next goal — inside the test window. |
| 7 | **Fitness tracker** (plan below) | L | After #2, since it stores health data. |

**Then:** weekly town recap card (shareable; the natural paid feature) → the rest of Builder Loop v1.1 (weekly villagers, decoration boosts, coin sinks) → Google Calendar sync → pricing.
**Parked:** Flutter app (the PWA covers phones), pricing and payments (only if ~40% of testers are still active in week 4).
**Watch:** the economy is already a lot for a new player (workers, rarities, merging, zones, catch-up, sleepy mode). Simplify where testers get confused before adding systems.

## Builder Loop v1 (built; numbers live in `server/builderRules.js`)
**Core loop:** do a real task → a **Lv1 building of that task's category** (max **5 per local day**, overflow becomes slow catch-up) → **place it** in your zone → **workers** staff buildings and fill capped coin storage → **Collect** → **merge** two identical buildings + coins → Lv2 → Lv3 → **expand the zone** with town level + coins.

| Category | Lv1 | Lv2 | Lv3 |
|---|---|---|---|
| 🏋️ Fitness | Training Yard | Gym | Sports Arena |
| 💻 Work & Study | Shed Workshop | Library | Academy |
| 💰 Finance | Stall | Market | Bank |
| 🔁 Habits (the day's first) | Cottage | House | Manor (beds = workers) |

Plus the savings construction site, decorations, and money logs (5 coins, first 3 a day; the day's first builds a Stall).

**Decisions (owner):**
1. **Workers are required and scarce** (2026-11-02): a building only earns while staffed. Workers come from a base 3, house beds (max 20) and **mystery summons** (one per town level; Normal/Rare/Epic/Legendary, pity at 10). Never sold; every result is useful. Design: [`WORKER_DESIGN.md`](WORKER_DESIGN.md).
2. **Zone expansion in v1**: start 12×10 tiles, 7 steps to the full map.
3. **Tasks pay a flat 10 coins** (first 5 a day); **Town Level replaces XP** (old levels grandfathered).
4. **Burst players get a slow catch-up**: big days still help, consistency stays faster.
5. **Tuning after QA** (2026-11-06): one paid savings milestone a day; the day's first habit builds a home; max 20 beds; zone steps 5–7 cost 7000/11000/16000; storage grows with worker speed.

Contract: [`BUILDER_LOOP_CONTRACT.md`](BUILDER_LOOP_CONTRACT.md).

## Planned: shortcut key settings
- **Settings panel** (gear on the HUD rail) → **Controls**: every action with its key; click one, press the new key; **Reset to defaults**.
- **Defaults:** WASD/arrows move · `L` Quick log · `T` Tasks · `M` map · `B` buildings · `C` collect all · `Esc`/right-click back · `?` shortcut list.
- **Rules:** never fire while typing; `Esc`, `Tab` and browser keys (Ctrl+W, Ctrl+R…) can't be rebound; taking a used key offers a swap.
- **Storage:** per account (`users.settings` JSONB), so it follows you between devices; Phaser movement reads the same bindings.

## Planned: fitness tracker
- **Long plan:** pick a level (just starting / some / active) and a goal (move more, get stronger, endurance) → a 4–8 week plan whose sessions become tasks. Steps up slowly; a missed day moves the plan on, never resets it.
- **Calories (estimate):** MET × body weight × time, shown as "about", never as diet advice. (`tasks.calories_burned` already exists.)
- **Body log:** weight, height, optional waist; BMI charted over time with a "rough guide" note; weekly chart of minutes, sessions, kcal.
- **Rewards:** logging a weigh-in earns coins (capped per week) whatever it says; a weight change is never rewarded or punished.
- **Privacy:** never to an LLM, never shown to friends, optional, included in export and deletion.

## Planned: linking more sign-ins
`user_identities` holds **provider + provider id → user id**. Accounts are **never joined by matching email** (anyone can make a Facebook account with your Gmail address): a second provider is linked only from inside a signed-in account (Profile → "Link Facebook"), and unlinking the last one is refused. Each new provider needs its own developer app registered by the owner.

## Integrations (later)
- **Two-way Google Calendar first.** The app writes only to its **own "Mind Map Meadow" calendar** and reads your other calendars (never edits your real events).
- **Creator owns the item**; change stamps prevent ping-pong; deletes never remove earned buildings.
- **Imported events are suggestions** — you mark them done yourself.
- **Plugin architecture:** `integrations` (one row per connected account, encrypted tokens) + one shared `external_items` table; each plugin implements fetch / normalize / push.
- Calendar scopes need Google verification (verified domain, privacy policy, demo video, about a week); testing mode caps at 100 users.

## Business (from [`BUSINESS_NOTES.md`](BUSINESS_NOTES.md))
- Cost: ~$6/month for the owner alone, ~$1 per user at scale; Claude calls are the part that grows, hence caps and a spend alert before friends.
- If we charge: free game + optional "Meadow Plus" (~$29.99/yr: AI reflection and memory, calendar sync, cosmetics). Cosmetics carry no gameplay effect.
- Before charging: privacy policy, terms, refunds, deletion/export, a merchant of record for sales tax, daily backups.

## Art direction
Full rules: [`ART_STYLE_GUIDE.md`](ART_STYLE_GUIDE.md). ¾ top-down, light from top-left, one 1 px `#2b1e1a` outline, one master palette. Sizes: tile 48×48 · characters 24×32 · buildings 2×2 tiles (96 wide; 112 / 136 / 168 tall by level) · decorations 1×1 · landmarks 3×3+. All sprites redrawn to this ratio (owner approved).

## How the team works
- **Project Lead (Claude):** plans, writes the contract, splits work so nobody edits the same files, reviews, builds, commits. Small work is done inline to save tokens; agents for larger pieces.
- **Team** (`.claude/agents/`): `backend-dev`, `frontend-dev`, `art-game-dev`; reviewers `qa-reviewer`, `qa-security`, `qa-economy`, `ui-ux-reviewer`; testers `qa-api-tester`, `qa-browser-tester`; advisor `product-strategist`. The Business Manager works in the cloud and answers on `TEAM_BOARD.md` / `BUSINESS_NOTES.md`.
- **Flow:** plan → build → `node tests/run.mjs` + `npm run build` → commit and push to **`dev`** (owner, 2026-11-06: work directly on `dev`; local Docker at http://localhost:5173 runs `dev`). Major features also get the QA agents and an independent review.
- **Branches:** `dev` → `staging` (browser-tested) → `main` (live; owner's go-ahead only).
