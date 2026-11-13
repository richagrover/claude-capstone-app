# Phase 04 — Implementation Plan

**Story Key:** MDP-7
**Phase:** 4 — Implementation Planning
**Run:** 2 (re-run — see §0)
**Inputs:** `docs/MDP-7/02-architecture.md` (Run 2, as-built re-derivation), `docs/MDP-7/03-design-review.md` (verdict: **Approved with Changes**)
**Human checkpoint:** `pipeline-state.json → humanCheckpoints[0].status = "approved"` (confirmed; note records
"proceed through all remaining phases without further pausing")
**Output consumer:** Phase 5 `implementation-agent`
**Status:** Planning complete — no application code written in this phase

## 0. Re-run Basis — this is a gap-closure plan, not a rebuild

Unlike this document's previous-run version (a from-scratch M0–M14 scaffolding plan for an empty
repo), `backend/` and `frontend/` **already exist, already work, and already pass their test
suites** (75 backend + 5 frontend tests, per `01-requirements.md`). Per the human checkpoint's
direction and this run's explicit brief, this plan does **not** re-plan anything already built and
confirmed correct by `02-architecture.md` / `03-design-review.md`'s source spot-checks (CORS, body
limits, pagination, indexes, sync-idempotency locking, etc. — all already implemented and already
reviewed as sound). It scopes **only** the small, surgical deltas the design review left open:

| Gap | Design-review ref | Kind | Code change? |
|---|---|---|---|
| GAP-1 | AC-10 / F-1 — rate-limit test missing | test-coverage gap | test-only (+2-line export in `app.ts`) |
| GAP-2 | SEC-6 — rate limiter has no `trust proxy` setting | Should-Fix, real gap | small, additive, non-breaking |
| GAP-3 | B-5 / S-4 — sync-health TTL cache undocumented | documentation gap | none (see note below) |
| GAP-4 | B-6 — `failing[]` capped at 50, no pagination | Note, low priority | none (deferred) |
| GAP-5 | housekeeping — stale doc cross-reference in source | consistency | 1-line comment fix |

No other item from `03-design-review.md` requires action this phase: SEC-1/S-1/S-3/B-1..B-4/G-1/G-2
are all carried-forward confirmations ("— positive, confirmed" in the review) with nothing left to
do.

---

## GAP-1 — AC-10 / F-1: rate-limit test coverage (test-only)

**Files:** `backend/src/app.ts` (trivial export only), `backend/src/__tests__/app.hardening.test.ts`

The middleware itself is correct and unchanged (confirmed by direct read, §6.1/§6.3 of
`02-architecture.md`): `express-rate-limit` mounted on `/api`, `windowMs = 60_000`, `max = 100`,
`handler` returns `429` with body `{ error: "rate_limited", message: "Too many requests. Please
try again later." }` exactly. Only the test is missing.

1. **`backend/src/app.ts`** — add `export` to the two existing constant declarations so the test
   can assert against the real values instead of a re-typed magic number (code-quality: avoid
   hardcoded/duplicated literals):
   ```ts
   export const RATE_LIMIT_WINDOW_MS = 60_000;
   export const RATE_LIMIT_MAX_REQUESTS = 100;
   ```
   No behavior change — same values, now importable.
2. **`backend/src/__tests__/app.hardening.test.ts`** — add a new block, following the file's
   existing pattern exactly (same `vi.mock(...)`s, same `beforeEach` setting `FRONTEND_ORIGIN`,
   same `createApp()` + `supertest(app)` harness):
   ```ts
   import { createApp, RATE_LIMIT_MAX_REQUESTS } from "../app";

   describe("Rate limiting (resolves NFR-8(c) / AC-10)", () => {
     it("returns 429 with the structured body once the per-window request cap is exceeded", async () => {
       const app = createApp(); // one instance for the whole test — the limiter's in-memory
                                 // bucket must be shared across every request below
       for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
         const res = await request(app).get("/api/tasks").set("Origin", "http://localhost:5173");
         expect(res.status).not.toBe(429);
       }
       const res = await request(app).get("/api/tasks").set("Origin", "http://localhost:5173");
       expect(res.status).toBe(429);
       expect(res.body).toEqual({
         error: "rate_limited",
         message: "Too many requests. Please try again later.",
       });
     }, 20_000); // 101 sequential in-process requests; default vitest timeout may be tight
   });
   ```
3. Run `npm test` in `backend/` — confirm this new test passes and the existing CORS/payload/404
   tests in the same file are unaffected (same mocked `taskService.listTasks` resolves instantly,
   so looping is fast; all requests share one process-local `req.ip`, so they land in one bucket).

**Why no `app.ts` logic change:** `03-design-review.md` §5 explicitly confirms the middleware
config needs no change for AC-10 as scoped — only §6.3's test. GAP-2 below is a related but
*separate* gap (SEC-6), not conflated with this one, per the review's own instruction.

**Acceptance:** new test passes; full `backend` suite (76 tests after this addition) stays green;
no change to any other route's behavior.

---

## GAP-2 — SEC-6: configurable `trust proxy` for the rate limiter

**Files:** `backend/src/app.ts`, `backend/.env.example`, `backend/src/__tests__/app.hardening.test.ts`

**Problem (confirmed by source read):** `express-rate-limit` keys by `req.ip`. With no
`app.set("trust proxy", ...)`, Express ignores `X-Forwarded-For` entirely — fine for direct-connect
local/dev (today's test harness and local `npm run dev`), but behind a real reverse
proxy/load-balancer in production, every client would resolve to the proxy's IP, collapsing the
100 req/min limit into one shared bucket for *all* callers. Fix must stay additive and
non-breaking for the current direct-connect case (default behavior must not change).

1. **`backend/src/app.ts`** — add a small, explicit parser and call `app.set(...)` once, near the
   top of `createApp()` (before any middleware that reads `req.ip`):
   ```ts
   /** Parses TRUST_PROXY into the shape Express's "trust proxy" setting expects. Defaults to
    * `false` (do not trust any proxy) — safe for direct-connect local/dev, which is this
    * app's default/test topology (resolves SEC-6). */
   function parseTrustProxySetting(raw: string | undefined): boolean | number {
     if (raw === undefined || raw === "") return false;
     if (raw === "true") return true;
     if (raw === "false") return false;
     const hops = Number(raw);
     if (!Number.isNaN(hops) && Number.isInteger(hops) && hops >= 0) return hops;
     // Unrecognized value: fail safe rather than silently trusting an unvalidated proxy chain.
     throw new AppError(500, "invalid_trust_proxy_config", `Invalid TRUST_PROXY value: "${raw}"`);
   }

   app.set("trust proxy", parseTrustProxySetting(process.env.TRUST_PROXY));
   ```
   - Unset (today's state, and every existing test): `false` — **identical behavior to today**,
     so no existing test changes.
   - `TRUST_PROXY=1` (one trusted hop, e.g. a single reverse proxy/load balancer in front of the
     app) or any non-negative integer (N trusted hops) — the documented production value.
   - `TRUST_PROXY=true` — trust all hops (only for a fully trusted internal network); documented
     as the less-safe option, not the recommended default.
   - Throwing (not silently defaulting) on garbage input is deliberate: a misconfigured proxy
     trust setting is a security-relevant misconfiguration, not something to paper over (NFR-3:
     "avoid... unhandled exceptions" — this *is* handled, as a clear startup-time `AppError`
     rather than a silent wrong-behavior fallback).
2. **`backend/.env.example`** — add, after `FRONTEND_ORIGIN`:
   ```
   # Reverse-proxy trust for the /api rate limiter's client-IP keying (resolves SEC-6). Leave
   # unset for direct-connect local/dev (default: do not trust any proxy). In production behind
   # a reverse proxy/load balancer, set to the number of trusted hops in front of this process
   # (typically 1) so express-rate-limit keys by the real client IP from X-Forwarded-For instead
   # of the proxy's IP. Only set this to a value that matches your actual trusted deployment
   # topology — trusting an untrusted proxy chain lets a client spoof X-Forwarded-For to evade
   # the rate limit.
   TRUST_PROXY=
   ```
3. **`backend/src/__tests__/app.hardening.test.ts`** — add one small settings-level test (not a
   full proxy simulation, which `supertest`'s in-process harness cannot provide — see note below):
   ```ts
   describe("Trust proxy configuration (resolves SEC-6)", () => {
     afterEach(() => {
       delete process.env.TRUST_PROXY;
     });

     it("defaults to not trusting any proxy when TRUST_PROXY is unset", () => {
       const app = createApp();
       expect(app.get("trust proxy")).toBe(false);
     });

     it("trusts the configured number of hops when TRUST_PROXY is set", () => {
       process.env.TRUST_PROXY = "1";
       const app = createApp();
       expect(app.get("trust proxy")).toBe(1);
     });

     it("rejects an invalid TRUST_PROXY value at app-creation time", () => {
       process.env.TRUST_PROXY = "not-a-number";
       expect(() => createApp()).toThrow();
     });
   });
   ```
   **Scope note (consistent with `03-design-review.md` §5's own caveat):** this verifies the
   *setting* is applied correctly; it intentionally does not simulate a real proxy rewriting
   `req.ip`, which would require a second hop `supertest` cannot represent. That remains a
   deployment-level concern to verify manually once a real reverse proxy is in front of a
   deployed instance — out of scope for an in-process unit/integration test, exactly as the design
   review notes for the GAP-1 rate-limit test.
4. **Doc note (non-blocking, not actioned by this plan):** `03-design-review.md` §8 item 2 also
   suggests `02-architecture.md` §6.1/§11 could state this topology assumption explicitly. That
   edit belongs to the Phase-2 artifact this phase does not own; recording the decision here (env
   var name, default, semantics) is this phase's complete contribution. Recommend a follow-up
   architecture-doc amendment, not a blocker.

**Acceptance:** three new tests pass; `TRUST_PROXY` unset preserves today's exact behavior (no
regression to GAP-1's test or any existing test); `.env.example` documents the name only, no value
(NFR-1).

---

## GAP-3 — B-5 / S-4: sync-health TTL cache documentation

**Files:** none planned for change by this phase; see verification note below.

`backend/src/services/syncHealthService.ts` already implements `SYNC_HEALTH_CACHE_TTL_MS = 5000`
as a process-local `Map` keyed by the provider filter (confirmed by direct read) — this is real,
correct, and requires **no code change**. The design review's finding is purely that
`02-architecture.md` didn't describe it.

**Verification performed for this plan:** this phase re-checked `docs/MDP-7/02-architecture.md`
directly (not just the brief that assumed it) — as of the version read for this plan, the document
does **not** yet contain the words "cache"/"TTL" anywhere, so the gap is not actually closed in
that file yet. Since `02-architecture.md` is Phase 2's owned artifact (not this phase's), this plan
does not edit it; instead, per the previous run's own precedent (that document's §0.1 documented
`S-1`/`S-2` inline when the architecture text was silent), this plan records the trade-off here as
the authoritative note for this run, so it is not a silent gap:

> **Trade-off, confirmed accepted:** `GET /api/sync-health` is served from a 5-second, per-process,
> in-memory TTL cache keyed by the optional `provider` filter. This bounds staleness to ≤5s on a
> read-only status endpoint (not a mutation path) and is not a correctness risk — a cache miss
> always recomputes from Postgres. It does mean the backend is not perfectly stateless: if ever run
> as more than one instance, two concurrent callers can see different counts for up to 5s depending
> on which instance answers. Accepted for the current single-instance deployment shape. If
> horizontal scaling is introduced later, this would need to move to a shared cache (e.g. Redis) or
> be removed — flagged as a future follow-up, not required now.

**Recommended (optional, non-blocking) follow-up:** a short, separate doc-only amendment to
`02-architecture.md` §5.2/§8 adding the paragraph above, done by re-entering Phase 2 or as a direct
human edit — not required to unblock Phase 5.

**Acceptance:** no code change; this section is the closed record of the decision for this run.

---

## GAP-4 — B-6: `failing[]` cap at 50, no pagination (deferred)

**Files:** none changed.

`computeSyncHealth`'s `failing` array is capped at `FAILING_LIST_PAGE_SIZE = 50` with no
`total`/`limit`/`offset`, unlike `GET /tasks`' pagination (M4 in the prior run's plan). The design
review itself classifies this as a **Note**, not a Should-Fix, and recommends deferring absent a
concrete trigger.

**Decision: defer.** Rationale:
- No FR/AC in `01-requirements.md` requires it.
- No observed failing-sync volume near 50 in current usage.
- Adding pagination here now, with no driving requirement, is scope creep inconsistent with this
  run's explicit "surgical gap-closure, not redesign" directive.

**If revisited later**, the fix is small and already sketched by precedent: mirror
`clampLimit`/`clampOffset` from `validation.ts` onto the `failingLinks` query (`take`/`skip`, plus
a `prisma.syncLink.count` for a `failingTotal`), and add `failingTotal`/`failingLimit`/
`failingOffset` to `SyncHealthResult`. Left here as a pointer for a future pass, not actioned now.

**Acceptance:** explicitly documented, non-silent deferral — no action required for Phase 5.

---

## GAP-5 — housekeeping: stale in-code doc cross-reference

**Files:** `backend/src/services/syncHealthService.ts`

While verifying GAP-3, this phase found `getSyncHealth`'s doc comment (line ~118) reads:

```
"...a few seconds of staleness on a health/status endpoint is an accepted trade-off (documented in
docs/MDP-7/04-impl-plan.md M7)."
```

This refers to the previous run's milestone numbering (`M7`), which no longer exists in this
document's structure. Trivial, non-functional fix:

1. Update the comment to point at the current location of the decision record:
   ```ts
   /**
    * Returns the current sync-health snapshot, optionally filtered to one provider. Backed by a
    * process-local TTL cache keyed by the provider filter — a few seconds of staleness on a
    * health/status endpoint is an accepted trade-off (documented in
    * docs/MDP-7/04-impl-plan.md, GAP-3).
    */
   ```

**Acceptance:** comment accurately points at a section that exists; no behavioral change.

---

## Sequencing for Phase 5

1. GAP-5 (comment-only, zero risk) — do first, trivially.
2. GAP-2's `app.ts` change (adds `trust proxy` setting) — do before GAP-1's test, since GAP-1's
   test should run against the final `app.ts`, not an intermediate version.
3. GAP-1's test + GAP-2's tests — add together to `app.hardening.test.ts` in one pass (same file,
   same patterns, avoids two near-duplicate diffs).
4. GAP-3 / GAP-4 — no code; already resolved by this document.
5. Run `npm test` and `npm run build` in `backend/` (AC-11) to confirm the full suite — existing
   75 tests + up to 4 new ones — stays green and the build stays clean. No frontend change is
   planned or required by this run's gaps.

**Total estimated surface area:** 2 files touched with real code changes (`app.ts`,
`app.hardening.test.ts`), 1 file with a comment-only edit (`syncHealthService.ts`), 1 file with an
additive env-var doc line (`.env.example`). No schema, route, service-logic, or frontend change.

---

## Traceability Summary

| Finding | Severity (per `03-design-review.md`) | Resolution | Section |
|---|---|---|---|
| AC-10 / F-1 | test-coverage gap | Implemented (test + 2-line export) | GAP-1 |
| SEC-6 | Should-Fix | Implemented (configurable, safe-default `trust proxy`) | GAP-2 |
| B-5 | Should-Fix (doc) | Documented here; code already correct, unchanged | GAP-3 |
| S-4 | Should-Fix (doc) | Documented here; accepted single-instance trade-off | GAP-3 |
| B-6 | Note | Explicitly deferred, not actioned | GAP-4 |
| (housekeeping) | — | Stale doc cross-reference fixed | GAP-5 |
| SEC-1, S-1, S-2, S-3, B-1, B-2, B-3, B-4, G-1, G-2 | — (confirmed, carried) | No action — already resolved and source-confirmed by `03-design-review.md`; nothing further for this plan | — |

---

*This document is the implementation-planner-agent's output for Phase 4. Per `.claude/rules/workflow-state.md`
and `02-architecture.md` §3.2, the orchestrator — not this agent — updates
`docs/MDP-7/pipeline-state.json` to mark Phase 4 `completed`; this agent does not modify that file.*
