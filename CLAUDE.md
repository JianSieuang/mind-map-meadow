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
- `server.js` is the entrypoint: creates the HTTP/Socket.IO server, serves the built `dist/` as static files, holds a single in-memory `gameContext` object (player position, AI position/target/speed, AI's current "thought"), runs a 33ms physics-interpolation `setInterval` that moves the AI companion toward its target and broadcasts `state_update`, and on each new socket connection sends a snapshot (`init_state`) of buildings/stats/tasks read fresh from Postgres.
- `server/db.js` — exports the shared `pg` `Pool` (reads `DATABASE_URL`).
- `db/index.js` — `runMigrations(pool)`, executed once at boot before the HTTP server starts listening. It runs the 5 SQL files in `mind-map-meadow/db/*.sql` in a fixed, hardcoded order (`01_extensions.sql` → `05_ai_analysis.sql`). Migration files are idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) — there is no migration versioning table, so adding a new migration means adding a new numbered `.sql` file *and* adding its filename to the array in `db/index.js`.
- `server/socketHandlers.js` — `registerSocketEvents(io, socket, gameContext)` wires all inbound socket events: `complete_task` (spawns a building at a random grid cell, marks the task completed, credits coins/calories), `purchase_building` (hardcoded price sheet, debits coins, spawns a building), `player_move`, `move_building` (persists dragged building position), `inspect_building` (returns an HTML snippet — see security note below). Every state-mutating handler re-queries and re-broadcasts `refresh_data` (stats + tasks) and/or emits `building_spawned`/`building_moved` to all clients, and several also call `triggerLlamaBrainDecision` to nudge the AI companion into commenting.
- `server/aiBrain.js` — `triggerLlamaBrainDecision(io, gameContext)`, called on a 60s interval plus once 5s after boot and after task/purchase events. Uses an `isAiThinking` mutex flag to avoid overlapping calls. Builds a prompt from current player stats/tasks/buildings, POSTs to `http://ollama:11434/api/generate` (Docker service name — only resolves inside the compose network) with model `llama3.2:latest`, expects a plain-text `ACTION: <...> | THOUGHT: <...>` response, parses it with string splitting (not JSON), sets a new AI wander/follow/inspect target accordingly, broadcasts `ai_thought_broadcast`, and logs the exchange into the `ai_analysis` table (which has an unused `vector(768)` embedding column reserved for future semantic recall).

**Frontend** (`mind-map-meadow/src/`, React 18 + Phaser 3 + Tailwind, built with Vite):
- `main.jsx` mounts `App.jsx`, which owns a single module-level `socket = io()` connection, all React state (stats/tasks/AI thought/selected building), and renders the Phaser canvas host div alongside `Sidebar`, `TaskModal`, and `BuildingCard` as DOM overlays on top of the canvas.
- `game/index.js` — `initPhaser(parentEl, socket, onBuildingInspect, onMapClick)` constructs the single `Phaser.Game` with one scene.
- `game/scene.js` — `MeadowScene`, the entire game loop. Note it reaches out to several `window.*` globals (`window.player`, `window.aiCompanion`, `window.buildingsGroup`, `window.inputKeys`) rather than storing them as scene properties — these are read/written from `App.jsx` too (e.g. to freeze input while a modal is open), so treat them as a shared, implicit contract between the scene and React, not scene-internal state. WASD movement, click-to-place buildings, drag-to-move buildings with grid snapping (`MAP_CONFIG.TILE_SIZE = 48`), and depth-sorting by Y each frame all live here.
- `game/config.js` — map size/tile size/player speed, key bindings, and `ASSET_REGISTRY` (maps a building's `asset_key` to an image path under `src/assets/`). Adding a new building sprite means adding both the PNG under `src/assets/` and an entry here.
- `game/buildings.js` — `renderBuilding` turns a DB row into a Phaser sprite with a static physics body and an interactive popup menu (Move/Close). Falls back to a `library_asset` texture key if the row's `asset_key` isn't in the preloaded texture registry.
- Components (`src/components/`) are presentation-only and communicate purely through props/socket emits passed down from `App.jsx` — they hold no socket references of their own except via callbacks.

**Data flow**: Postgres is the source of truth for buildings/tasks/player_stats/ai_analysis; `gameContext` in `server.js` is the only in-memory (non-persisted) state, covering just live player/AI positions. Every mutation goes DB write → broadcast to all sockets, so all connected clients (in practice, all your own browser tabs) stay in sync; there's no per-user auth or session separation anywhere in the stack.

## Known sharp edges

- `BuildingCard.jsx` renders server-sourced HTML via `dangerouslySetInnerHTML`, and `socketHandlers.js`'s `inspect_building` handler builds that HTML by string-interpolating task title/category directly from the DB. If task titles are ever accepted from a less-trusted source, this is a stored-XSS path.
- The frontend emits an `add_task` socket event (`App.jsx`'s `handleAddTask`) that currently has no corresponding `socket.on("add_task", ...)` handler in `socketHandlers.js` — creating a task via the UI modal does not currently persist anything server-side.
- `triggerLlamaBrainDecision` depends on the Docker Compose service name `ollama` (`http://ollama:11434`) and will not resolve if the server is run outside the compose network (e.g. bare `npm run dev` on the host without the containers up).
