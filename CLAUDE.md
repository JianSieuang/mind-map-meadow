# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This repo is a Docker Compose stack with one application inside it:

- `docker-compose.yml` — orchestrates 4 services: `ollama` (local LLM inference), `mind-map-meadow` (the app, built from `mind-map-meadow/Dockerfile`), `postgres-db` (pgvector/pgvector:pg16), `db-viewer` (Adminer).
- `mind-map-meadow/` — the actual application source. All real development happens here.
- `ollama_data/`, `postgres_data/` — bind-mounted container data volumes (gitignored). Never edit or read these as source; `postgres_data` is raw Postgres binary storage.
- `.env` — port numbers and Postgres credentials consumed by `docker-compose.yml` (gitignored, not committed).

There is no root `package.json`; all Node tooling lives in `mind-map-meadow/`.

## What the app is

"Mind Map Meadow" is a real-time multiplayer-style life-gamification app: a Stardew-Valley-esque Phaser grid world where completing real tasks (coding/fitness/finance goals) spawns buildings in the meadow, and a local Ollama-driven "AI companion" wanders the map and comments on your progress. Single-player in practice (hardcoded username `'chong'` throughout the schema and queries), state is synced to all connected sockets via Socket.IO.

Goals are managed through a full-screen "Goal Dashboard" (left-nav shell with Goals/Calendar/Daily Tasks pages) reachable via a bottom-middle button, separate from the always-there game HUD (a Profile panel and an Agenda panel, each behind its own top-right toggle icon, plus a toggleable minimap top-left). Coin rewards scale with how long a task is expected to take and whether it's finished by its deadline; completing tasks also grants XP and can level you up.

## Commands

Run from `mind-map-meadow/`:

```
npm run dev      # concurrently runs `vite` (frontend, :5173) and `nodemon` on server.js (backend, :5000)
npm run build    # vite build -> dist/
npm start        # node server.js (serves prebuilt dist/, production mode)
```

There is no lint config and no test suite in this repo currently — don't assume `npm test`/`npm run lint` exist.

Full stack (Postgres + Ollama + app) is normally run via Docker Compose from the repo root:

```
docker compose up -d
```

The `mind-map-meadow` container mounts the source directory as a volume and runs `npm run dev`, so code edits on the host hot-reload inside the container (vite HMR + nodemon watching `server.js`). `.env` at the repo root must define `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `GAME_SERVER_PORT`, `VITE_DEV_PORT`, `POSTGRES_PORT`, `DB_VIEWER_PORT`, `OLLAMA_PORT`.

## Architecture

**Backend** (`mind-map-meadow/server.js` + `mind-map-meadow/server/*`, ESM, Node + Express + Socket.IO):
- `server.js` is the entrypoint: creates the HTTP/Socket.IO server, serves the built `dist/` as static files, holds a single in-memory `gameContext` object (player position, AI position/target/speed, AI's current "thought"), and runs a 33ms physics-interpolation `setInterval` that moves the AI companion toward its target and broadcasts `state_update`. It does **not** push `init_state` eagerly on connect — instead it registers a `request_init_state` handler and waits for the client to ask (see "Init-state race" below). It also calls `generateTodayInstances()` once at boot and hourly thereafter to materialize today's recurring-task instances.
- `server/db.js` — exports the shared `pg` `Pool` (reads `DATABASE_URL`).
- `db/index.js` — `runMigrations(pool)`, executed once at boot before the HTTP server starts listening. It runs the SQL files in `mind-map-meadow/db/*.sql` in a fixed, hardcoded order (`01_extensions.sql` → `07_recurring_task_times.sql`). Migration files are idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) — there is no migration versioning table, so adding a new migration means adding a new numbered `.sql` file *and* adding its filename to the array in `db/index.js`.
- `server/socketHandlers.js` — `registerSocketEvents(io, socket, gameContext)` wires all inbound socket events:
  - Tasks: `add_task` / `edit_task` (pending only) / `delete_task` (also deletes any spawned building and emits `building_removed`) / `complete_task` (spawns a building, computes the coin reward via `server/rewards.js`, applies XP/leveling, emits `task_reward` with the base/bonus breakdown).
  - Recurring tasks/habits: `add_recurring_task` / `edit_recurring_task` / `delete_recurring_task` / `toggle_recurring_task` (pause/resume) manage `recurring_tasks` templates; adding or resuming one immediately calls `generateTodayInstances()` so it can show up right away if scheduled today.
  - World: `purchase_building` (hardcoded price sheet, debits coins, spawns a building), `player_move`, `move_building`, `inspect_building` (returns an HTML snippet — see security note below).
  - Every state-mutating handler re-broadcasts via the shared `emitRefreshData`/`emitRefreshRecurringTasks` helpers (`refresh_data` = stats + tasks, `refresh_recurring_tasks` = templates) and/or emits `building_spawned`/`building_moved`/`building_removed`; several also call `triggerLlamaBrainDecision`.
- `server/rewards.js` — `computeTaskReward(estimatedMinutes, dueDate, completedAt)` returns `{ baseCoins, bonusCoins, totalCoins, isOnTime }` (base scales with estimated effort, +20 flat bonus if completed by the due date), and `applyLevelUp(level, xp)` rolls xp into levels using an `xp >= level * 100` threshold, looping to handle multi-level jumps from one big reward.
- `server/recurringTasks.js` — `generateTodayInstances()` turns each active `recurring_tasks` template into a real `tasks` row due today if one doesn't already exist (idempotent via a partial unique index on `tasks(recurring_task_id, due_date)`). Recurring tasks/habits are always daily now — the UI has no day-of-week picker — but the `days_of_week` column still exists and is always written as every day from the client.
- `server/aiBrain.js` — `triggerLlamaBrainDecision(io, gameContext)`, called on a 60s interval plus once 5s after boot and after task/purchase events. Uses an `isAiThinking` mutex flag to avoid overlapping calls. Builds a prompt from current player stats/tasks/buildings, POSTs to `http://ollama:11434/api/generate` (Docker service name — only resolves inside the compose network) with model `llama3.2:latest`, expects a plain-text `ACTION: <...> | THOUGHT: <...>` response, parses it with string splitting (not JSON), sets a new AI wander/follow/inspect target accordingly, broadcasts `ai_thought_broadcast`, and logs the exchange into the `ai_analysis` table (which has an unused `vector(768)` embedding column reserved for future semantic recall).

**Frontend** (`mind-map-meadow/src/`, React 18 + Phaser 3 + Tailwind, built with Vite):
- `main.jsx` mounts `App.jsx`, which owns a single module-level `socket = io()` connection and all top-level React state (stats/tasks/recurringTasks/AI thought/selected building/which HUD panel or overlay is open). It renders the Phaser canvas host div alongside the HUD overlays: `HudIconRail` (Profile/Agenda toggle icons, top-right) with `ProfilePanel`/`AgendaPanel` popovers — mutually exclusive via a single `activeHudPanel` state, since both render in the same screen slot — a minimap toggle icon (top-left), the bottom-middle "Goals" button opening `TaskDashboard`, `TaskModal` (quick-add from a map click), and `BuildingCard`.
- `game/index.js` — `initPhaser(parentEl, socket, onBuildingInspect, onMapClick)` constructs the single `Phaser.Game` with one scene.
- `game/scene.js` — `MeadowScene`, the entire game loop. Reaches out to several `window.*` globals (`window.player`, `window.aiCompanion`, `window.buildingsGroup`, `window.inputKeys`) rather than storing them as scene properties — these are read/written from `App.jsx` too (e.g. to freeze input while a modal is open), so treat them as a shared, implicit contract between the scene and React, not scene-internal state. WASD movement, click-to-place buildings, drag-to-move buildings with grid snapping (`MAP_CONFIG.TILE_SIZE = 48`), and depth-sorting by Y each frame all live here. Also owns the minimap: a second Phaser camera (`scene.minimapCamera`, zoomed to fit the whole world) with oversized "blip" markers for the player/AI/buildings, a viewport-indicator rectangle, and a drag-to-pan zone (`scene.minimapDragZone`) that pans the main camera without moving the player — pressing a movement key resumes following. `scene.toggleMinimap(visible)` is called from `App.jsx` to open/close it; the panel is positioned via `MINIMAP_CONFIG.MARGIN_LEFT/MARGIN_TOP` in `config.js`, offset to leave room for the toggle icon so they never overlap. On `create()`, after every socket listener is registered, the scene emits `request_init_state` — see "Init-state race" below.
- `game/config.js` — map size/tile size/player speed, key bindings, `MINIMAP_CONFIG` (minimap size + screen offsets), and `ASSET_REGISTRY` (maps a building's `asset_key` to an image path under `src/assets/`). Adding a new building sprite means adding both the PNG under `src/assets/` and an entry here.
- `game/buildings.js` — `renderBuilding` turns a DB row into a Phaser sprite with a static physics body, a minimap blip, and an interactive popup menu (Move/Close). Falls back to a `library_asset` texture — a placeholder generated at runtime in `scene.js` via `generateTexture`, since no such image asset actually exists — if the row's `asset_key` isn't in the preloaded texture registry.
- `src/components/TaskDashboard.jsx` — the full-screen Goal Dashboard shell: a left-hand nav (`GoalsPage` / `CalendarPage` / `DailyTasksPage`) plus a "Back to Meadow" button. All task/recurring-task CRUD callbacks are threaded down from `App.jsx` through this shell to whichever page is active.
  - `GoalsPage.jsx` — tab/search list view over one-off tasks (`tasks.recurring_task_id IS NULL`), tabs: All / Due (overdue-or-today) / category / Completed.
  - `CalendarPage.jsx` — month grid (no external calendar library) showing every task grouped by due date/completion date; click a day to add a task there or see what's scheduled.
  - `DailyTasksPage.jsx` — recurring-task templates (`RecurringTaskForm`: title/category/start time/end time, no day picker), each showing today's generated instance status inline.
  - `TaskForm.jsx` — shared add/edit form for one-off tasks. Duration is a number + Hour/Day unit (`src/utils/duration.js`) that auto-computes the due date unless the date is edited manually (tracked via a `dateManuallySet` flag, also pre-set true when a date is passed in from the Calendar page).
  - `RecurringTaskForm.jsx` — add/edit form for daily habits: title/category/start time/end time (`minutesFromTimeRange` derives the reward-relevant duration; no day-of-week UI).
- `src/utils/rewards.js` — client-side mirror of the server's reward formula (`estimateTaskReward`), used purely for live previews in the forms/lists; the server in `server/rewards.js` is the actual source of truth for what gets paid out.
- Components (`src/components/`) are presentation-only and communicate purely through props/socket emits passed down from `App.jsx` — they hold no socket references of their own except via callbacks.

**Data flow**: Postgres is the source of truth for buildings/tasks/recurring_tasks/player_stats/ai_analysis; `gameContext` in `server.js` is the only in-memory (non-persisted) state, covering just live player/AI positions. Every mutation goes DB write → broadcast to all sockets, so all connected clients (in practice, all your own browser tabs) stay in sync; there's no per-user auth or session separation anywhere in the stack.

**Init-state race (fixed, but the pattern matters if you add new bootstrap data)**: the server used to push `init_state` immediately on socket connect, racing against `MeadowScene.create()` (which only registers its `init_state` listener after Phaser finishes preloading images). On a fast connection / slow preload, that one-shot emit could arrive before the Phaser-side listener existed and get silently dropped — buildings just wouldn't render, intermittently. It's now pull-based: the server only sends `init_state` in response to a `request_init_state` event, and the client only emits that request from `scene.js` after all of `create()`'s socket listeners are registered (Socket.IO buffers the emit client-side if the handshake isn't done yet, so this is safe regardless of ordering). If you add new data that needs to reach the Phaser scene on load, add it to the `request_init_state` response in `server.js` and consume it in the `init_state` handler in `scene.js` — don't add a new eager `socket.emit(...)` on connect.

## Known sharp edges

- `BuildingCard.jsx` renders server-sourced HTML via `dangerouslySetInnerHTML`, and `socketHandlers.js`'s `inspect_building` handler builds that HTML by string-interpolating task title/category directly from the DB. If task titles are ever accepted from a less-trusted source, this is a stored-XSS path.
- `triggerLlamaBrainDecision` depends on the Docker Compose service name `ollama` (`http://ollama:11434`) and will not resolve if the server is run outside the compose network (e.g. bare `npm run dev` on the host without the containers up).
- `npm run dev`'s `nodemon` only watches `server.js` itself (`--watch server.js`), not `server/*.js` or `db/*.sql` — editing `socketHandlers.js`, `rewards.js`, `recurringTasks.js`, or adding a migration won't trigger a restart under plain `npm run dev`. The Vite dev server side (all of `src/`) hot-reloads fine. A full `docker compose up -d --build -V` (rebuilding and forcing the anonymous `node_modules`/`dist` volumes to refresh) is the reliable way to pick up backend/migration changes.
- Dates are handled inconsistently around timezones: `due_date` is a plain `DATE` and `completed_at`/`created_at` are timezone-naive `TIMESTAMP`s, so `.slice(0, 10)`-style date-key comparisons (used throughout `CalendarPage.jsx`, `rewards.js`'s on-time check, etc.) can be off by one day right around midnight depending on the server's local timezone. Not fixed; consistent with how the app already treated dates before this was noticed.
