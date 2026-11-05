# Mind Map Meadow — Project Plan

Owner: Chong · Project Lead: Claude · Last updated: 2026-11-02

## Vision
People quit long-term goals (saving money, fitness, learning) because the payoff is far away. Mind Map Meadow makes progress visible **every day**: real tasks and money logs grow a pixel town (SimCity-inspired — you're the builder), and an AI resident lives in it and notices your progress. Built for the owner now, friends next, public later.

## Principles (non-negotiable)
1. **Consistency over bursts** — the town grows a little every day you show up; a daily limit stops one-day binges.
2. **Reward honesty, not frugality** — never scale rewards by money amounts; logging a splurge still counts.
3. **Never destroy earned progress** — no disasters, streak resets or clawbacks; bad weeks show as rain/sleepy streets and recover with one good action.
4. **Fast** — logging and collecting take under 5 seconds.
5. **Our own art** — one style guide, drawn ourselves; reference images are never copied.
6. **Privacy** — financial free text never goes to an LLM; integration tokens are stored encrypted.

## Roadmap
| Phase | Status | Contents |
|---|---|---|
| 0. Foundations | ✅ on `dev` | Per-user AI lock, context cleanup, atomic coin spending, double-reward guard, per-user timezone |
| 1. Money tracking | ✅ on `dev` | Quick-log (💸), Money page (💰), savings goals as construction projects, coin-farming + XSS hardening |
| **2. Builder Loop v1** | 🟡 designing | See below |
| 3. Integrations | ⏳ after Builder Loop v1 | Two-way Google Calendar, plugin architecture for ClickUp/Teams/… |
| 4. AI resident as city advisor | ⏳ | Hybrid: rules for movement, Claude for event reactions + daily reflection with memory |
| 5. Hosting | ⏳ last (owner, 2026-11-05: localhost until the features are done) | Railway/Render-style host, `staging` + `main` sites, production Docker build. Security items to finish first are listed by `qa-security`. |

## Phase 2 — Builder Loop v1 (decided by owner)
**Core loop:** do a real task → a **Lv1 building of that task's category** is generated (max **5 per local day**) → **you place it** in your zone → **NPC workers** earn coins over time (capped storage; tap a building or **Collect all**) → **merge** two identical buildings + coins → next level (Lv1→Lv2→Lv3) → expand the **small starting zone** once you reach the **town level AND pay coins**.

**Building lines (4 × 3 levels), tied to task categories:**
| Category | Lv1 | Lv2 | Lv3 |
|---|---|---|---|
| 🏋️ Fitness | Training yard | Gym | Sports arena |
| 💻 Coding / Learning | Shed workshop | Library | Academy |
| 💰 Finance | Stall | Market | Bank |
| 🔁 Daily habits | Cottage | House | Manor (houses = villager capacity) |

Plus **decorations** (bought with coins; boost nearby buildings), **world landmarks** (earned by consistent weeks), and the existing **savings construction project**.

**Weekly layer:** effort beyond the daily 5 goes into a **weekly effort pool** (capped per day) → recruits a villager (Apprentice / Builder / Master). **Consistency** (≥5 active days in a week) → progress toward a **world landmark**.

**Sleepy town:** no real task or money log for ~3 days → production pauses (rain, closed shutters); one action resumes it. Nothing is destroyed.

### Proposed numbers (from Backend Dev simulation — tune before build)
- Production (coins/h, needs a worker): Lv1 0.15 · Lv2 0.4 · Lv3 1.0. Storage fills ~20 h.
- Merge: Lv1→2 = 25 coins · Lv2→3 = 150 coins + town level 5.
- Zone: plots are 2×2 tiles; start 12×10 tiles, 7 expansion steps up to the full 70×50 map (e.g. TL2 + 200 coins, TL3 + 500, TL5 + 1000 …).
- Direct coins: first 5 tasks/day pay a flat 10 (replaces the old `minutes × 1.5` formula); money log 5 coins (max 3/day) and the first log of the day generates a Finance Stall.
- Simulated result: a steady player (4 tasks/day) gets Lv2 on day 2, first expansion week 1, first Lv3 week 3, first landmark week 5. A burst player (15 tasks one day/week) progresses far slower — by design.

### Decisions (owner, 2026-11-02)
1. **NPC workers: required, and a separate scarce resource.** Workers are counted apart from buildings: you might own 10 buildings but have only 2 workers, so only 2 earn. A building only earns while staffed. Workers come from a base pool, houses (Cottage 1 / House 2 / Manor 4 beds) and **mystery summons: each town level up gives one summon that reveals a worker of random level (higher level earns more)**. Summons are never sold for real money and every result is useful. (Product Strategist preferred "buildings just produce" — owner chose workers for the strategy layer; auto-assign by default, with priority/off controls to choose who works.)
2. **Zone expansion is in v1:** start 12×10 tiles, unlock land with town level + coins.
3. **Economy:** tasks pay a flat 10 coins (first 5/day) instead of `minutes × 1.5`; **Town Level replaces the player level** (existing levels grandfathered).
4. **Burst players get a slow catch-up:** overflow effort turns into progress over the following days you visit — big days still help, consistency stays faster.

### MVP slice (build first)
Task → Lv1 building into inventory (5/day) → place (+ "auto-place" option) → workers staff buildings (auto-assign) → buildings fill coin storage → Collect all → merge Lv1→Lv2→Lv3 → zone expansion by town level + coins → production pauses after 3 inactive days → overflow pool with slow catch-up. Existing buildings stay as "heritage" where they are. Deferred to v1.1: weekly villager tiers, world landmarks, decoration boosts.

## Art direction (owner: "all buildings need to be redone")
Full rules: [`docs/ART_STYLE_GUIDE.md`](ART_STYLE_GUIDE.md).
- **Projection:** ¾ top-down (Stardew / Pokémon style) — front face + top/roof, no side walls, light from top-left.
- **Outline:** one 1 px `#2b1e1a` outline on everything (white sticker outline retired). One 32-colour master palette.

### Size ratio (building ↔ player) — ⚠️ owner to check against the lineup image
| Thing | Footprint | Sprite size | Ratio to player |
|---|---|---|---|
| Ground tile | 1×1 | 48×48 | — |
| **Player / AI / villagers** | — | **24×32** | 1 |
| Building Lv1 | 2×2 tiles | 96×112 | building is **4× player width** |
| Building Lv2 (1 storey) | 2×2 | 96×136 | storey 45 px ≈ **1.4× player height**; door 18×34 fits a player |
| Building Lv3 | 2×2 | 96×168 | ≈ 5× player height incl. topper |
| Decoration | 1×1 | 48×48–64 | 2× player width |
| Landmark | 3×3+ | 144 × (144+H) | 6× player width |

Today the player is **32×48 next to 48×48 buildings** — a person almost as tall as a building. The new ratio makes a building read as a building.

**Redraw list:** all 11 existing sprites (House, SuperMarket, CozyBench, GardenFountain, Savings Stage0–4, Player, AiCompanion) + ~24 character walk frames + the 12 new building sprites + UI/effects (~45 sprites total). Code change: 2×2 building footprint/physics, 24×32 character bodies.

## Phase 3 — Integrations (decided)
- **Two-way Google Calendar first.** The app writes only to its **own "Mind Map Meadow" calendar** and reads your other calendars (never edits your real events).
- **Creator owns the item** (app-made → app wins; Google-made → Google wins). Change stamps prevent ping-pong. Deletes never remove earned buildings.
- **Imported events are suggestions** — you mark them done yourself; nothing auto-completes.
- **Plugin architecture:** `integrations` table (one row per connected account, encrypted tokens) + one shared `external_items` table for every provider; each plugin implements fetch / normalize / push. ClickUp, Teams, etc. are added as new plugins with no new tables.
- Google "testing mode" works for the owner now; public launch needs Google's OAuth verification.

## How the team works
- **Project Lead (Claude):** plans, writes the shared contract, splits work so nobody edits the same files, reviews, builds, commits.
- **Team** (`.claude/agents/`): `backend-dev` (server, db), `frontend-dev` (React UI), `art-game-dev` (pixel art + Phaser), `qa-reviewer` (read-only review before every commit), `product-strategist` (read-only devil's advocate).
- **Flow per feature:** plan + contract → devs build in parallel → QA review → lead verifies (build, checks) → commit on `feature/<name>` → merge to `dev`. Major features also get a QA run that tests every feature for real, then an independent review by Fable, before merging.
- **Branches:** `feature/*` → `dev` (builds) → `staging` (tested in the browser) → `main` (live; owner's go-ahead only).
