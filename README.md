# Kinetic

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
