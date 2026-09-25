# Kinetic

A PWA that measures a disc golf throw's speed and spin: the phone lies on
the ground, camera up, and the disc flies over it. Android (Chrome) first.

## How it works

- **Capture** (`src/capture/`): every camera frame goes, with its capture
  timestamp, to a worker via `MediaStreamTrackProcessor` (fallback:
  `requestVideoFrameCallback`). The last ~40 greyscale frames stay in a ring
  buffer. Nothing pauses, so no throw is missed.
- **Detection** (`src/detection/`): an adaptive background model with
  exposure-gain correction finds every moving blob. A constant-velocity
  tracker accepts only straight, disc-sized tracks moving 4–45 m/s, measured
  in disc diameters per second, so no calibration is needed.
- **Analysis** (`src/analysis/`, separate worker): full-resolution disc
  silhouettes, then a blur-free diameter (width across the motion), then
  speed from `p = (u − cu)/d`, `q = (v − cv)/d`, which are linear in time and
  need no focal length. Spin comes from a tape marker's angle across frames,
  resolved with a coherence search that handles aliasing.
- **Setup** (`src/screens/SetupGuideScreen.tsx`, `src/components/SetupChecks.tsx`):
  a guide on first launch, live checks (fps, dropped frames, camera
  controls, level, marker), and spoken results and warnings while the phone
  lies screen-down.

## Tests

    pnpm test

The tests render synthetic throws and run them through the full pipeline.
Real passes saved from the app ("Save last detection", which also keeps
rejected ones) can go in `recordings/`
and are replayed through the analysis as well.

Frontend + integrations for phone sensors and camera. Extracted from the
`medisc` monorepo into its own repo — separate Cloudflare Worker, separate
deploy pipeline, no shared database or identity system.

## Stack

- React 18 + TypeScript, built with Vite
- Cloudflare Workers (static assets + a minimal Hono API), no D1/database yet
- pnpm as the package manager (own lockfile, independent of the repo root)

## Getting started

    pnpm install
    pnpm dev

## Local development

Run the Worker and the Vite dev server side by side — Vite proxies `/api/*`
to `http://localhost:8788`:

    pnpm worker:dev   # terminal 1
    pnpm dev          # terminal 2

## Deploying

    pnpm worker:deploy

Pushing to `main` also triggers `.github/workflows/deploy.yml` automatically.
It needs its own `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repository
secrets configured on this repo (GitHub Actions secrets are per-repo, so the
ones on `medisc` are not visible here).

## Notes

- Deploys to `kinetic.<account>.workers.dev` — no custom domain/DNS setup.
  Camera (`getUserMedia`) and motion sensor (`DeviceMotionEvent`/
  `DeviceOrientationEvent`) browser APIs require a secure context, which this
  URL already satisfies.
