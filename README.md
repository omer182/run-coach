# Run Coach

Self-hosted running app with a live AI coach. PRD: https://claude.ai/artifact/S6soSnKFuVsM9wfW8ufynB

## Layout

| Path | What |
| --- | --- |
| `packages/core` | Workout model, interval engine, instant cues, coach snapshot. Shared by the phone app, server and simulator. |
| `apps/server` | Hono API: AI coach lines (Claude) + voice (Kokoro TTS), runner profile, and the browser run simulator. |
| `apps/mobile` | Expo iPhone app: live run screen, workout builder, history with map/elevation. See [apps/mobile/README.md](apps/mobile/README.md) to install it on your iPhone. |

The engine advances only on the timestamps it's given (GPS updates), never on its own timers, because iOS pauses JS timers when the screen is locked.

## Run it

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY and APP_API_KEY
docker-compose up -d --build
```

- Simulator: http://<server>:3020 (enter `APP_API_KEY` from `.env`)
- Health: `GET /api/health`
- Coach line: `POST /api/coach/line` with `{ "snapshot": CoachSnapshot }` and `Authorization: Bearer <APP_API_KEY>`
- Profile: `GET`/`PUT /api/profile`, stored in `/hosted-apps/run-coach/profile.json`

Without `ANTHROPIC_API_KEY` the coach answers with canned backup lines.

## Develop

No Node on the host; everything runs in a container:

```bash
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v "$PWD":/app -w /app node:22-bookworm-slim corepack pnpm install
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v "$PWD":/app -w /app node:22-bookworm-slim corepack pnpm -r test
```
