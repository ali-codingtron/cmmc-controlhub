---
name: Demo experience
description: Public /demo landing page, demo login endpoint, seed script, DemoModeContext, DemoBanner, GuidedTour
---

## Demo architecture

- `/demo` and `/demo-video` are PUBLIC routes in `App.tsx` (outside `<Guard>` and `<Layout>`) — placed before the catch-all route.
- `DemoModeProvider` wraps the App (inside OrgProvider).
- `isDemoMode` stored in `localStorage` as `"isDemoMode"="true"`.

## Key files

- `scripts/src/seed-demo.ts` — idempotent seed for CarmeTechnology org + all data. Run: `pnpm --filter @workspace/scripts run seed-demo`. Use `--force` to re-seed.
- `artifacts/api-server/src/routes/auth.ts` — `POST /api/auth/demo-login` (no password). Returns `{ token, user, isDemoMode: true, demoOrgId }`. Disabled when `ENABLE_PUBLIC_DEMO=false`.
- `artifacts/cmmc-app/src/context/DemoModeContext.tsx` — `useDemoMode()` hook, `enableDemoMode()`, `disableDemoMode()`.
- `artifacts/cmmc-app/src/components/DemoBanner.tsx` — amber banner shown at top of main content area when in demo mode.
- `artifacts/cmmc-app/src/components/GuidedTour.tsx` — 9-step tour card (bottom-right), triggered from DemoBanner "Start Tour" button.

## Demo data (CarmeTechnology org)

- Demo user: `demo@controlhub.com` / `DemoMode1!` / role: `reviewer`
- Org ID: seeded fresh each time (check DB or seed output)
- 110 control assessments: ~50% implemented, 20% in_progress, 20% not_started, 10% at_risk
- 20 evidence items, 8 POA&Ms, 19 monitoring items, 6 tasks
- 1 PA tenant connection + 1 completed scan (94 checks), 12 findings, 8 evidence records, 6 evidence requests, 10 roadmap actions

## DB enum pitfalls (monitoring)

- `monitoring_frequency` enum has only: `daily, weekly, monthly, quarterly, annually` — NO `semi_annually` or `as_needed`. Use `annually` for both.
- `task_type` enum: valid values include `training_review` (NOT `training`).

**Why:** TypeScript types from Drizzle are exact — invalid enum values cause TS2769 overload errors at compile time.

## Launch Live Demo fix

- `handleLaunchDemo` (demo-landing, demo-video) must use `window.location.href = "/"` NOT `navigate("/")`. The React Query cache has `user=null` after the initial 401; `navigate()` hits the Guard which redirects to `/login` before the refetch. A full page reload lets AuthProvider pick up the new localStorage token on fresh mount.
- `/demo/app` is a public auto-launch route (in App.tsx before the Guard catch-all). It calls demo-login in a `useEffect`, sets localStorage, then does `window.location.href = "/"`. Shareable direct link — no button click needed.

## Demo video generation

- Script: `scripts/src/generate-demo-video.ts`; run with `pnpm --filter @workspace/scripts demo:video`
- Two phases: `--screenshots` (Playwright) then `--assemble` (ffmpeg). Run separately — screenshot phase ~90s, assembly ~15s.
- Playwright bundled chromium fails on NixOS (missing `libglib-2.0.so.0`). Use nix chromium instead — install via `installSystemDependencies({ packages: ["chromium"] })`, then set `executablePath` to the nix store path (e.g. `/nix/store/<hash>-chromium-<ver>/bin/chromium`). Hash changes on reinstall — grep `which chromium` after install.
- Output: `artifacts/cmmc-app/public/videos/` — `control-hub-demo.mp4`, `control-hub-demo-poster.png`, `control-hub-demo-captions.vtt`
- Video served at `/videos/control-hub-demo.mp4` (BASE_PATH `/`); embedded in `/demo-video` page as native `<video>` with poster + captions track.

**Why:** Playwright's bundled headless-shell binary is compiled for Debian/Ubuntu and doesn't find glib in NixOS. The nix-managed chromium has all libs linked correctly.

## Demo video audio (TTS)

- `espeak-ng` installed via `installSystemDependencies({ packages: ["espeak-ng"] })`. Binary at `/nix/store/.../bin/espeak-ng`.
- Command: `espeak-ng -v en-us -s 145 -p 45 -f /tmp/narration.txt -w /tmp/narration.wav`
- At ~145 wpm, ~230 words produces ~138s of audio (slower than expected; espeak adds paragraph pauses).
- To match video to audio length: `ffmpeg -vf "setpts=FACTOR*PTS" -r 3` to stretch video, then combine: `ffmpeg -i video.mp4 -i audio.aac -map 0:v -map 1:a -c:v libx264 -c:a aac -shortest`.
- Silent backup kept at `control-hub-demo-silent.mp4` for regeneration.

**Why:** Playwright bundled chromium glib issue + espeak produces longer audio than word-count suggests due to sentence pauses.
