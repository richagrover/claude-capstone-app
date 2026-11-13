# Phase 05 — Implementation Summary

**Story Key:** MDP-7
**Phase:** 5 — Code Implementation
**Run:** 2 (re-run — gap-closure only, per `docs/MDP-7/04-impl-plan.md`)
**Input:** `docs/MDP-7/04-impl-plan.md` (Run 2 gap-closure plan, GAP-1 … GAP-5)
**Scope executed:** exactly the plan's five gaps — no other code touched.

## Baseline

- Before this phase: 75 backend tests + 5 frontend tests passing (per `01-requirements.md` / plan
  §0).
- Dependencies were not installed in this working copy (`backend/node_modules`,
  `frontend/node_modules` absent); ran `npm install` in both `backend/` and `frontend/` before
  testing/building. No `package.json`/`package-lock.json` changes were made — same dependency
  versions as already pinned.

## Files changed

### 1. `backend/src/app.ts` — GAP-1 (export) + GAP-2 (trust proxy)

- Added `export` to the two existing rate-limit constants (no value change):
  ```ts
  export const RATE_LIMIT_WINDOW_MS = 60_000;
  export const RATE_LIMIT_MAX_REQUESTS = 100;
  ```
- Added `parseTrustProxySetting(raw: string | undefined): boolean | number`, a small pure
  helper that maps `TRUST_PROXY` into Express's `"trust proxy"` setting shape:
  - unset/empty → `false` (identical to today's behavior — no regression)
  - `"true"` / `"false"` → boolean
  - a non-negative integer string → that number (trusted-hop count)
  - anything else → throws `AppError(500, "invalid_trust_proxy_config", ...)` — fails loudly at
    app-creation time instead of silently defaulting to an unvalidated value.
- Called `app.set("trust proxy", parseTrustProxySetting(process.env.TRUST_PROXY))` at the top of
  `createApp()`, before any middleware that reads `req.ip` (CORS, rate limiter).
- No other line in `app.ts` changed; CORS, body-limit, rate-limiter config, and route mounting are
  untouched.

### 2. `backend/.env.example` — GAP-2 documentation

- Added a new `TRUST_PROXY=` line (name only, no value — consistent with the file's existing
  NFR-1 convention and with the project's credential-handling governance rule) immediately after `FRONTEND_ORIGIN=`, with a comment
  explaining default behavior, the production value (trusted-hop count), the less-safe `true`
  option, and the security rationale for not trusting an unvalidated proxy chain.

### 3. `backend/src/__tests__/app.hardening.test.ts` — GAP-1 + GAP-2 tests

- Added `import { createApp, RATE_LIMIT_MAX_REQUESTS } from "../app"` (replacing the import that
  previously brought in only `createApp`) and imported `afterEach` from `vitest`.
- New `describe("Rate limiting (resolves NFR-8(c) / AC-10)")`: fires `RATE_LIMIT_MAX_REQUESTS`
  (100) sequential requests against `GET /api/tasks` on one shared `createApp()` instance,
  asserts none of them is `429`, then asserts the 101st request returns `429` with the exact body
  the real `app.ts` handler sends — `{ error: "rate_limited", message: "Too many requests. Please
  try again later." }` — verified against the literal strings in `app.ts`, not a paraphrase.
- New `describe("Trust proxy configuration (resolves SEC-6)")` with three tests:
  1. `TRUST_PROXY` unset → `app.get("trust proxy")` is `false` (today's exact behavior, no
     regression).
  2. `TRUST_PROXY=1` → `app.get("trust proxy")` is `1`.
  3. `TRUST_PROXY="not-a-number"` → `createApp()` throws.
  `afterEach` deletes `process.env.TRUST_PROXY` so the setting doesn't leak into other test
  files/cases.

### 4. `backend/src/services/syncHealthService.ts` — GAP-5

- Fixed the stale doc comment on `getSyncHealth` that referenced the previous run's "M7"
  milestone number (which no longer exists in this document's structure). It now reads:
  > "...a few seconds of staleness on a health/status endpoint is an accepted trade-off
  > (documented in docs/MDP-7/04-impl-plan.md, GAP-3)."
- Comment-only change; no behavior, signature, or logic touched.

### GAP-3 and GAP-4 — no code change (confirmed)

- **GAP-3** (sync-health TTL cache undocumented in architecture): re-confirmed by direct read of
  `syncHealthService.ts` that `SYNC_HEALTH_CACHE_TTL_MS = 5000` and the per-provider `Map` cache
  are already implemented correctly. This is a Phase-2 (architecture doc) gap, not a Phase-5 code
  gap; the plan's §GAP-3 note is the authoritative trade-off record for this run. No action taken
  here, as directed.
- **GAP-4** (`failing[]` capped at 50, no pagination): confirmed as an explicitly deferred `Note`
  per the design review, with no FR/AC requiring it and no observed trigger. No action taken, as
  directed.

## Credential-hygiene check

Ran the project's mandatory pre-commit credential-scanning hook against the staged diff of all four
changed files (`app.ts`, `app.hardening.test.ts`, `.env.example`, `syncHealthService.ts`): the scan
completed successfully and reported no hardcoded credential values found.

`TRUST_PROXY=` was added to `.env.example` with no value, consistent with the file's existing
"names only" convention and the project's governance rule prohibiting hardcoded credentials.

## Test / build results

### Backend (`backend/`)

- `npm test` (vitest): **79 passed** (75 pre-existing + 4 new: 1 rate-limit test + 3 trust-proxy
  tests), 7 test files, 0 failures.
- `npm run build` (`tsc -p tsconfig.json`): clean, no errors.

### Frontend (`frontend/`)

- `npm test` (vitest): **5 passed** (unchanged), 2 test files, 0 failures — confirms no regression
  from backend-only changes.
- `npm run build` (`tsc -b && vite build`): clean, no errors; Vite production bundle built
  successfully (85 modules transformed).

## Acceptance criteria check (against `04-impl-plan.md`)

| Plan item | Result |
|---|---|
| GAP-1: `RATE_LIMIT_MAX_REQUESTS` exported, new 429-body test added | Done — test passes, asserts exact literal body |
| GAP-2: `parseTrustProxySetting` + `app.set("trust proxy", ...)`, default unchanged (`false`), invalid input throws, `.env.example` documents name only | Done — 3 new tests pass |
| GAP-3: no code change, decision already recorded in plan | Confirmed, no action |
| GAP-4: no code change, deferral already recorded in plan | Confirmed, no action |
| GAP-5: stale "M7" comment fixed | Done |
| Full backend suite stays green after changes | 79/79 passing |
| Backend build clean | `tsc` clean |
| Frontend unaffected | 5/5 passing, build clean |

## Not done (out of scope / explicitly excluded from this phase)

- No commit was created — per this phase's explicit instruction, commits are deferred to Phase 8
  (pr-creator-agent).
- `docs/MDP-7/pipeline-state.json` was not modified by this phase, per this run's explicit
  instruction to the implementation agent (the orchestrator owns that file's phase-5 status
  transition).
- No change to `docs/MDP-7/02-architecture.md` (GAP-3's optional follow-up amendment is Phase 2's
  artifact, not this phase's, and is non-blocking per the plan).

---

*This document is the implementation-agent's output for Phase 5. Per the plan's own closing note
and this run's explicit instruction, this agent does not modify `pipeline-state.json`; the
orchestrator owns that transition.*
