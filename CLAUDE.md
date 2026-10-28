# Run Coach — agent handoff

Self-hosted Runkeeper-style iPhone app with a live AI coach voice. Owner: Omer. PRD + mockup: https://claude.ai/artifact/S6soSnKFuVsM9wfW8ufynB

## Where things stand (2026-10-28)

- **Phase 1 done:** workout engine, AI coach server (Claude), Kokoro voice, browser run simulator.
- **Phase 2 done:** Expo SDK 58 iPhone app (`apps/mobile`): Today, workout picker/builder, live run, summary (map, elevation, rounds, km splits), history, settings, crash recovery. Tested end to end in the web build with simulated GPS; 30 core + 5 server tests pass.
- **Never run on a real iPhone yet.** Not verified: background GPS with the screen locked, music ducking under the coach voice, haptics, real-GPS trend detection.
- The owner's 2020 Intel MacBook Pro can install Xcode 26.4 (SDK 58 needs 26.4+, iOS 16.4+, Node 22.13+).

## Immediate next step: install on the iPhone from the Mac

Follow `apps/mobile/README.md` (free Apple ID, `npx expo run:ios --device --configuration Release`). Help the owner through Xcode/signing/CocoaPods errors. Free-account installs expire every 7 days; rerun the same command.

Then a real-world test run, checking the unverified items above.

## Later phases

1. Expose the coach server over HTTPS on the owner's domain so the coach works outside home Wi-Fi. The home server already uses Nginx Proxy Manager (`nginx_main`, 80/443, Let's Encrypt) for other apps — add a proxy host there, not a Cloudflare tunnel. Then the app's server URL becomes `https://…`.
2. Tighten coach lines (currently ~25–35 words, 2.5–4 s latency) — offered, owner hasn't decided.
3. Phase 4: talk to the coach during walk steps (push-to-talk → STT → Claude → TTS).
4. Phase 5: sync runs to the server + web dashboard.
5. Phase 6: multi-week training plans.

## Layout

- `packages/core` — workout model, `WorkoutEngine`, cues, coach snapshot/triggers, trend detection, `RunController` (ports pattern, crash-recovery replay). Pure TS, exported from source.
- `apps/server` — Hono API on port 3020: `POST /api/coach/line` (Claude `claude-haiku-5-5`, 6 s timeout, canned fallbacks), Kokoro TTS, `/api/profile` (the runner's name/goal/"why"), simulator at `/`. Bearer `APP_API_KEY` on everything except audio files.
- `apps/mobile` — Expo Router app in `src/app`; services in `src/services` (SQLite db, background location task, voice queue, settings, coach client); `.web.ts(x)` files are browser stand-ins for native modules.

## Rules that matter

- The engine advances only on GPS timestamps, never its own timers — iOS suspends JS timers when locked. Keep it that way.
- One coach request in flight at a time; instant cues (Go/Walk/3-2-1) stay local on the phone.
- Secrets live in `.env` on the server (git-ignored). Never commit or print `ANTHROPIC_API_KEY` / `APP_API_KEY`.
- Commits are authored as `Omer Sher <omer182@gmail.com>`.

## Home server (where the backend runs)

- LAN IP `192.168.0.147`, repo at `~/projects/run-coach`, data in `/hosted-apps/run-coach`.
- Containers: `run-coach` (:3020), `run-coach-kokoro`, `run-coach-web-preview` (:8095, static web build for browser testing).
- No Node on that host: run node commands in `node:22-bookworm-slim` containers (see root README).
- `docker-compose` is v1 and breaks on recreate (`KeyError: 'ContainerConfig'`). Redeploy with:
  `docker-compose build run-coach && docker rm -f run-coach && docker-compose up -d run-coach`

## On the Mac

Node is native there: `pnpm install`, `pnpm test`, `pnpm typecheck` from the repo root. The server stays on the home server; don't run it locally unless needed.
