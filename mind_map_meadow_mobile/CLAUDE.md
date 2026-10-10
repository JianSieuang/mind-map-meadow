# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## What this project is

`mind_map_meadow_mobile` is a **Flutter mobile client** for the existing "Mind Map Meadow" app. The real backend — Node/Express/Socket.IO server, Postgres schema, Google OAuth verification, all game/task/friend logic — already exists and is NOT duplicated here. It lives in the sibling folder:

```
../mind-map-meadow/     <- Node/Express/Socket.IO/Postgres backend + the existing React/Phaser web client
```

This Flutter app is purely a client against that backend's existing REST + Socket.IO contract. **Do not reimplement server logic, reward math, or DB access in Dart** — call the same endpoints/events the web client uses. If anything in this doc looks wrong or incomplete, the source of truth is the backend repo, specifically:

- `../mind-map-meadow/server/auth.js` — auth endpoints
- `../mind-map-meadow/server/socketHandlers.js` — task/building/game socket events
- `../mind-map-meadow/server/friendHandlers.js` — friend system socket events
- `../mind-map-meadow/server.js` — connection/session wiring, per-user room model
- `../mind-map-meadow/db/*.sql` — schema (numbered migrations, run in order)

Grep those files directly if you suspect the backend has changed since this doc was written, rather than trusting this file blindly.

## Running the backend for local development

The backend + Postgres + Ollama run via Docker Compose from the repo root (one level up from `../mind-map-meadow`):

```
cd ../..    # to the ollama-local repo root
docker compose up -d
```

Server listens on `http://localhost:<GAME_SERVER_PORT>` (see root `.env`, default `5000`). Socket.IO is on the same host/port, path `/socket.io`. When testing the Flutter app against it:
- **Android emulator**: use `http://10.0.2.2:5000` to reach the host machine's localhost.
- **iOS simulator**: `http://localhost:5000` works directly.
- **Physical device**: use the host machine's LAN IP, and make sure `GAME_SERVER_PORT` is reachable on the network (check firewall).

## Auth

Google Sign-In here is **native**, not the web ID-token button — use the `google_sign_in` Flutter package. This has one important consequence for the backend:

**You must register a separate OAuth Client ID per platform** in Google Cloud Console (Android needs your app's SHA-1 fingerprint + package name; iOS needs its own client ID) — these are different from the Web application Client ID the website already uses.

**Backend change required**: `../mind-map-meadow/server/auth.js` currently does:
```js
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
...
await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
```
This only accepts tokens issued for a single client ID (the web one). To accept mobile-issued ID tokens too, `audience` needs to become an array of all valid client IDs (web + Android + iOS), e.g. `audience: [WEB_CLIENT_ID, ANDROID_CLIENT_ID, IOS_CLIENT_ID]` (google-auth-library's `verifyIdToken` accepts an array). This is a small, backwards-compatible edit to make in the backend repo before mobile login can work — do it there, not by working around it in Dart.

### Auth flow
1. `google_sign_in` → get an ID token (`idToken`, a JWT).
2. `POST /auth/google` with JSON body `{ "credential": "<idToken>" }`.
3. Response: `{ "user": { "id", "email", "name", "avatarUrl" } }`, plus a `Set-Cookie: connect.sid=...` session cookie (30-day expiry, backed by Postgres via `connect-pg-simple`).
4. **Cookie handling is on you** — Flutter's HTTP clients don't persist cookies like a browser. Use `dio` + `dio_cookie_manager` + `cookie_jar` (persisted to disk via `path_provider`) so the session survives app restarts, and so you can attach the same cookie to the Socket.IO handshake:
   ```dart
   IO.io(baseUrl, IO.OptionBuilder()
       .setTransports(['websocket'])
       .setExtraHeaders({'Cookie': sessionCookieString})
       .build());
   ```
   The server reads this session via `io.engine.use(sessionMiddleware)` — without the cookie header, the socket connects but is immediately disconnected (no `userId` on the session).
5. `GET /auth/me` — call at app startup; 200 + `{ user }` if the stored cookie is still valid, 401 otherwise. Use this to skip the Google sign-in screen on relaunch.
6. `POST /auth/logout` — clears the session server-side; clear your local cookie jar too.

## Socket.IO event contract

Connect only after a valid session cookie is attached (see above) — the server disconnects unauthenticated sockets immediately. Every socket is auto-joined server-side to room `user:<your user id>`; you never join rooms yourself.

### Bootstrapping & live state
| Direction | Event | Payload |
|---|---|---|
| emit | `request_init_state` | *(none)* — send once, right after registering your listeners |
| on | `init_state` | `{ player:{x,y}, ai:{x,y}, buildings:[...], stats:{...}, tasks:[...], recurringTasks:[...] }` |
| on | `state_update` | `{ ai:{x,y} }` — fired ~30/sec while the AI companion is moving |
| emit | `player_move` | `{ x, y }` — your position; throttle this on mobile, the web client sends it every frame |

### Tasks
| Direction | Event | Payload |
|---|---|---|
| emit | `add_task` | `{ title, category, due_date, estimated_minutes }` |
| emit | `edit_task` | `{ id, title, category, due_date, estimated_minutes }` (pending tasks only) |
| emit | `delete_task` | `taskId` |
| emit | `complete_task` | `taskId` |
| on | `refresh_data` | `{ stats, tasks }` — full re-sync after any task mutation |
| on | `building_spawned` | full building row — a task completion or purchase spawns one |
| on | `task_reward` | `{ taskId, baseCoins, bonusCoins, totalCoins, isOnTime }` |

### Recurring tasks / daily habits
| Direction | Event | Payload |
|---|---|---|
| emit | `add_recurring_task` / `edit_recurring_task` | `{ (id,) title, category, estimated_minutes, days_of_week, start_time, end_time }` (times as `"HH:MM"`) |
| emit | `delete_recurring_task` | `id` |
| emit | `toggle_recurring_task` | `{ id, active }` — pause/resume |
| on | `refresh_recurring_tasks` | `{ recurringTasks }` |

### World / buildings
| Direction | Event | Payload |
|---|---|---|
| emit | `purchase_building` | `{ assetKey, x, y }` — price sheet: `supermarket` 250, `garden_fountain` 150, `cozy_bench` 50 (hardcoded server-side) |
| on | `purchase_failed` | error string, e.g. insufficient coins |
| emit | `move_building` | `{ id, x, y }` |
| on | `building_moved` | `{ id, x, y }` — broadcast to your other connected devices/tabs |
| emit | `delete_task`'s building cleanup | *(automatic — deleting a task that spawned a building deletes the building too)* |
| on | `building_removed` | `{ id }` |
| emit | `inspect_building` | `buildingId` |
| on | `inspection_details` | **raw HTML string** (e.g. `<strong>...</strong><br/><small>...</small>`) — the web client dumps this via `dangerouslySetInnerHTML`. **Do not render raw HTML in Flutter.** Either parse out the title/category substrings, or (better) treat this as a backend TODO: add a structured JSON variant of this event before building real mobile UI around it. |

### Friends (read-only "visit" system)
| Direction | Event | Payload |
|---|---|---|
| emit | `request_friends_state` | *(none)* |
| on | `friends_state` | `{ friends:[{friendshipId,id,name,email,avatarUrl}], incoming:[...], outgoing:[...] }` |
| emit | `search_users` | `{ query }` (min 2 chars) |
| on | `search_users_result` | `[{ id, name, email, avatarUrl, friendshipId, friendshipStatus, isIncomingRequest }]` — `friendshipStatus` is `null \| "pending" \| "accepted"` |
| emit | `send_friend_request` | `{ addresseeId }` |
| emit | `respond_friend_request` | `{ requestId, accept: boolean }` |
| emit | `remove_friend` | `{ friendshipId }` |
| emit | `visit_friend_map` | `{ friendId }` — requires an accepted friendship |
| on | `visit_state` | `{ host:{id,name,avatarUrl}, buildings:[{...building row, task_title, task_category}] }` |
| on | `visit_failed` | error string (e.g. not friends) |

**Visiting is strictly read-only, enforced server-side**: every mutating event (`move_building`, `complete_task`, `purchase_building`, etc.) is scoped to `WHERE user_id = <your own id>` regardless of what you're viewing, so there's no risk in the UI accidentally letting a mutation through — it would just silently no-op against your own data, never the host's. Don't build move/purchase/complete controls into the "visiting a friend" screen.

## Database schema (reference only — never queried directly from Flutter)

- `users` — `id, google_id, email, name, avatar_url`
- `player_stats` — `user_id (unique FK), level, xp, coins, calories_burned, custom_status`
- `buildings` — `user_id (FK), type, asset_key, x, y, content, metadata (jsonb)`
- `tasks` — `user_id (FK), building_id, title, category, status, due_date, estimated_minutes, coins_earned, completed_at, recurring_task_id`
- `recurring_tasks` — `user_id (FK), title, category, estimated_minutes, days_of_week, start_time, end_time, active`
- `ai_analysis` — `user_id (FK), analysis_text, raw_response, embedding (unused vector(768))`
- `friendships` — `requester_id, addressee_id, status ('pending'|'accepted')`
- `session` — connect-pg-simple's session store (not relevant to app logic)

## Open design decisions (not yet made — flag to the user before assuming)

- **Scope of the mobile app**: the web client is a full Phaser game (WASD movement, drag-to-place buildings, minimap). Should mobile be a full game-view port (would likely need the `flame` package or custom `CustomPainter` canvas work — a large effort), or a lighter companion UI (task list, goal dashboard, friend requests/visiting) without live map movement? This hasn't been decided — ask before building either direction.
- **State management**: no package chosen yet (`provider`, `riverpod`, `bloc` all reasonable) — pick one and stay consistent rather than mixing.

## Suggested packages

`socket_io_client`, `google_sign_in`, `dio` + `dio_cookie_manager` + `cookie_jar`, `path_provider` (cookie jar persistence), `go_router` (a routing skill is installed for this — see below).

## Installed skills

Flutter/Dart skills are installed globally at `C:\Users\User\.claude\skills\` and available via the `Skill` tool without re-reading this project each time:
- `flutter-apply-architecture-best-practices` — layered UI/Logic/Data structure
- `flutter-build-responsive-layout`
- `flutter-setup-declarative-routing` (go_router)
- `flutter-add-widget-test`, `flutter-add-integration-test`
- `dart-add-unit-test`, `dart-fix-runtime-errors`, `dart-run-static-analysis`
