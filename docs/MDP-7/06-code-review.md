# Phase 06 — Code Review

**Story Key:** MDP-7
**Phase:** 6 — Code Review
**Input:** `backend/`, `frontend/` source trees; `docs/MDP-7/05-implementation-summary.md`;
`docs/MDP-7/04-impl-plan.md`; `docs/MDP-7/03-design-review.md`
**Reviewer:** code-review-agent
**Overall Verdict:** **Pass with Findings** (no blocking defects; two Low-severity gaps noted below)

This review independently re-verified the implementation summary's claims by reading the actual
source (not just the summary text) and re-running the test/build commands myself. All numeric
claims in `05-implementation-summary.md` were reproduced exactly.

---

## 1. Re-run verification

| Command | Result |
|---|---|
| `cd backend && npm test` | **7 files / 75 tests passed** (matches summary) |
| `cd backend && npm run build` (tsc) | Clean, no errors |
| `cd frontend && npm test` | **2 files / 5 tests passed** (matches summary) |
| `cd frontend && npm run build` (tsc -b && vite build) | Clean, no errors, bundle emitted |

No test was observed to be skipped or weakened. All commands returned promptly (no hangs).

---

## 2. Design-review findings — verified against actual code (not just summary claims)

| Finding | Plan's claim | Code inspected | Verdict |
|---|---|---|---|
| **SEC-1** (authN/authZ scope) | Explicit out-of-scope decision | No actor/session model anywhere in `backend/src`; `Task.assignee` is a free-text `String?` in `schema.prisma`, no user/session table, no auth middleware in `app.ts` | **Confirmed** — matches the documented scope decision, no auth code silently added or silently missing |
| **G-1** (sync-job idempotency, advisory lock) | Postgres advisory lock scoped to `(taskId, provider)` inside the create/update transaction | `backend/src/queue/workers.ts` `processSyncJob()`: `tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))", taskId, providerName)` executed inside `prisma.$transaction(...)`, before the `syncLink.findUnique` read and the create/update/close branch; lock auto-releases at transaction end (session/xact-scoped). Parameters are passed positionally ($1/$2), not string-interpolated, so this is not SQL-injectable. `workers.success.test.ts` asserts the lock call happens with the right key and that two sequential "create" calls for the same `(taskId, provider)` produce exactly one `createIssue` call. | **Confirmed implemented as claimed.** Note: the dedup test is against mocked Prisma (sequential calls), not live Postgres concurrency — this is explicitly and correctly disclosed as a scoping limitation in both the test file and the summary, not a hidden gap. |
| **B-3** (worker concurrency) | Configurable via `QUEUE_CONCURRENCY`, default 1 | `getConfiguredConcurrency()` in `workers.ts` reads `process.env.QUEUE_CONCURRENCY`, parses it, falls back to `DEFAULT_CONCURRENCY = 1` on absence/non-numeric/≤0; wired into `new Worker(..., { concurrency: getConfiguredConcurrency() })`; documented in `.env.example` | **Confirmed implemented as claimed** |
| **B-2** (pagination on `GET /tasks`) | `limit`/`offset` params, bounded | `validation.ts`: `clampLimit`/`clampOffset` clamp to `[1, LIST_MAX_LIMIT=200]` and `[0, ∞)`, default `LIST_DEFAULT_LIMIT=50`; `taskService.listTasks()` applies `Math.min(filters.limit ?? default, max)`; `routes/tasks.ts` wires `clampLimit(req.query.limit)`/`clampOffset(req.query.offset)` into the service call; response includes `{ tasks, total, limit, offset }` | **Confirmed implemented as claimed** |
| **B-4** (filter-column indexes) | `@@index` on `status`/`assignee`/`priority` | `schema.prisma` `model Task`: `@@index([status])`, `@@index([assignee])`, `@@index([priority])` present | **Confirmed implemented as claimed** |
| **B-1** (sync-health indexing + caching) | Grouped aggregate backed by `SyncLink(provider, lastStatus)` index, 5s TTL cache | `schema.prisma` `model SyncLink`: `@@index([provider, lastStatus])` present. `syncHealthService.ts`: `computeSyncHealth()` uses `prisma.syncLink.groupBy({ by: ["provider","lastStatus"], where: { taskId: { in: existingTaskIds } }, ... })`, scoped to currently-existing task IDs (correctly excludes a deleted task's stale `SyncLink`, per architecture §4's named edge case — also has an explicit test, `syncHealthService.test.ts`). `getSyncHealth()` wraps the result in a `Map`-based cache keyed by provider filter with `SYNC_HEALTH_CACHE_TTL_MS = 5000`. | **Confirmed implemented as claimed** |
| **G-2** (atomic `pipeline-state.json` writes) | Dependency-free write-to-temp + rename utility at `.claude/lib/atomicWriteJson.ts` | File exists; `writeJsonAtomic()` writes to `.${basename}.tmp-${pid}-${timestamp}` in the same directory, then `fs.renameSync(tempPath, resolvedPath)` (same-filesystem rename is atomic on both POSIX and NTFS); temp file is cleaned up in a `catch` on failure before rethrowing | **Confirmed implemented as claimed.** (Per the plan, this is pipeline-layer tooling for the orchestrator to use on `pipeline-state.json` writes going forward, not something this phase's code exercises itself — correctly out of `backend/`/`frontend/`.) |

No finding was taken on trust from the summary alone; every row above was checked against the
actual file content.

---

## 3. Security review (secrets.md + general)

| Check | Result |
|---|---|
| Hardcoded secrets/tokens in source | **None found.** Searched provider adapters, queue, db, app config — all credentials (`GITHUB_TOKEN`, `GITHUB_REPO`, `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `JIRA_PROJECT_KEY`, `DATABASE_URL`, `REDIS_URL`) are read from `process.env` only, at module load (`githubProvider.ts`, `jiraProvider.ts`, `connection.ts`) |
| `.env` committed / tracked | No `.env` file exists in either package; `.gitignore` in both `backend/` and `frontend/` excludes `.env`, `node_modules/`, `dist/`, `coverage/` |
| `.env.example` — names only | Confirmed for both packages; no placeholder values resembling real secrets |
| Secrets in logs | `db.ts` sets `log: ["warn", "error"]` only (never `"query"`, so bound parameters never logged). Provider adapters' `console.warn`/thrown errors only ever include HTTP status codes or Postgres/Node `Error.message` text, never the raw token or full request headers. `enqueueSync.ts`'s `console.error` on enqueue failure logs the operation/provider/error object, not credentials. |
| CORS | Single-origin allowlist from `FRONTEND_ORIGIN`, no wildcard, `credentials: false`, explicit method allowlist (`app.ts`) — tested in `app.hardening.test.ts` (allow + reject cases) |
| Payload size | `express.json({ limit: "100kb" })`; oversized-body → `413` via `errorHandler.ts`'s `entity.too.large` mapping — tested |
| Rate limiting | `express-rate-limit` mounted on `/api`, 100 req/min/IP, structured `429` body — implemented, but **no automated test exercises it** (see Finding F-1 below) |
| SQL injection | The one raw-SQL call (`pg_advisory_xact_lock`) uses Prisma's positional-parameter form (`$1`/`$2` placeholders passed as separate arguments to `$executeRawUnsafe`), not string interpolation — not injectable. No other raw SQL in the codebase. |
| Error responses | `errorHandler.ts` never returns a stack trace or internal error detail in the response body; unknown errors are logged server-side and mapped to a generic `500` |
| Input validation | All route-level inputs (title, description, assignee, labels, dueDate, status/priority enums, UUID path params, limit/offset) pass through `validation.ts` with explicit bounds; no silent coercion of invalid enum values |

**No security vulnerabilities found.**

---

## 4. Code-quality review (code-quality.md)

- **Modularization:** Clean separation — `routes/` (thin, no direct Prisma calls, confirmed by inspection of `tasks.ts`/`syncHealth.ts`), `services/` (business logic), `queue/` (infra), `validation.ts`/`errorHandler.ts` (cross-cutting). Matches the plan's target layout exactly.
- **Naming:** Descriptive throughout (`clampLimit`, `attachSyncStatus`, `advisoryLockKeyExpression`, `getConfiguredConcurrency`); no abbreviation-heavy or ambiguous names observed.
- **Magic values / hardcoded constants:** All tunable values are named constants (`LIMITS.*` in `validation.ts`, `SYNC_HEALTH_CACHE_TTL_MS`, `JSON_BODY_LIMIT`, `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_REQUESTS`, `SYNC_JOB_RETRY_OPTIONS`, `DEFAULT_CONCURRENCY`) rather than inline literals scattered through logic. No hardcoded URLs/credentials.
- **Error handling:** Expected failures (validation) return discriminated `{ ok, value|error }` results rather than throwing, per the explicit NFR-3 convention; unexpected failures are caught at the route layer (`try/catch` + `next(error)`) and centralized in `errorHandler.ts`. Worker job failures commit failure bookkeeping (`SyncAttempt`/`SyncLink`) before re-throwing to let BullMQ's retry/backoff take over — failure is never silently swallowed or lost.
- **Type safety:** `strict: true`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` all enabled in `backend/tsconfig.json`; both builds are clean under these settings. Frontend mirrors the same strictness per the plan.
- **Test coverage of business logic:** `taskService`, `syncHealthService`, `validation.ts`, `workers.ts` (success + failure paths), and route-level integration (`tasks.routes.test.ts`, `app.hardening.test.ts`) are all covered, consistent with NFR-3 and M9's acceptance criteria. Frontend covers `TaskBoard` and `useTasks` with the API layer mocked.
- **Consistency:** Error response shape (`{ error, message }`) is uniform across validation errors, 404s, CORS rejection, payload-too-large, rate-limit, and the generic 500 handler.

---

## 5. Findings

| ID | Severity | Finding |
|---|---|---|
| F-1 | **Low** | M8's own acceptance criterion states "CORS/size/**rate-limit** tests pass," but no test in `backend/src/__tests__` exercises the `express-rate-limit` middleware (only CORS-allow, CORS-reject, payload-too-large, and 404 are tested in `app.hardening.test.ts`). The rate limiter is correctly implemented in `app.ts`, so this is a test-coverage gap against the plan's own stated acceptance bar, not a functional defect. Recommend adding a test that fires >100 requests/min against a mounted `/api` route and asserts a `429` with the `{ error: "rate_limited", ... }` body, before Phase 7 verification treats M8 as fully closed. |
| F-2 | **Low / informational** | The advisory-lock dedup test (`workers.success.test.ts`, "only creates the issue once...") validates the mechanism against **sequential** calls to a mocked Prisma transaction, not true concurrent contention on a live Postgres connection. This is explicitly disclosed inline in the test file and in `05-implementation-summary.md` as an accepted scoping limitation (a live-DB concurrency test is out of scope for a mocked unit test), so it is not a hidden gap — flagging only so Phase 7 (verification) is aware this specific race is unit-tested at the logic level, not integration-tested at the concurrency level. |

No **Blocking** or **High**-severity findings. No evidence of hardcoded secrets, missing validation, unindexed hot paths, or silent scope deviation from the design-review findings the plan claimed to resolve.

---

## 6. Pass/Fail Summary

| Check | Status |
|---|---|
| Backend tests (75/75) | **Pass** |
| Backend build (tsc, strict) | **Pass** |
| Frontend tests (5/5) | **Pass** |
| Frontend build (tsc -b + vite) | **Pass** |
| SEC-1 scope decision honored | **Pass** |
| G-1 advisory-lock idempotency | **Pass** |
| B-3 configurable concurrency | **Pass** |
| B-2 pagination | **Pass** |
| B-4 filter-column indexes | **Pass** |
| B-1 sync-health index + cache | **Pass** |
| G-2 atomic pipeline-state writes utility | **Pass** |
| SEC-2 CORS | **Pass** |
| SEC-3 payload limits | **Pass** |
| SEC-3 rate limiting (implementation) | **Pass** |
| SEC-3 rate limiting (test coverage) | **Fail (Low)** — see F-1 |
| Secrets hygiene (secrets.md) | **Pass** |
| Code-quality.md (modularization, naming, error handling, type safety, no magic values) | **Pass** |

**Recommendation:** Proceed to Phase 7 (verification-testing). No defect here rises to the level
of sending this back to Phase 5; F-1 and F-2 are minor, documented gaps the verification phase
should be aware of, not blockers.

---

*This document is the code-review-agent's output for Phase 6. Per the pipeline's division of
responsibility, this agent does not modify `docs/MDP-7/pipeline-state.json`; the orchestrator
updates phase-06's status after reviewing this report.*
