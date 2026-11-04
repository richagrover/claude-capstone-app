# Phase 04 — Implementation Plan

**Story Key:** MDP-7
**Phase:** 4 — Implementation Planning
**Inputs:** `docs/MDP-7/02-architecture.md` (contract), `docs/MDP-7/03-design-review.md` (verdict: **Approved with Changes**)
**Human checkpoint:** `pipeline-state.json → humanCheckpoints[0].status = "approved"` (confirmed before this phase started)
**Output consumer:** Phase 5 `implementation-agent`, building `backend/` and `frontend/` from an empty repo
**Status:** Planning complete — no code written in this phase

This plan does not re-derive architecture. Every data model, endpoint, and queue behavior below
is the contract already fixed in `02-architecture.md`; this document only sequences the coding
work and resolves the **Should-Fix** / **Note** items the design review raised, per the human's
direction to carry them forward as explicit requirements rather than redesign blockers.

---

## 0. Design-Review Findings — Scope Decisions

Each finding from `03-design-review.md` is resolved below as either an **implemented task**
(with the milestone that carries it) or an **explicit, documented scope decision**. None are
left as silent gaps.

| # | Finding | Severity | Resolution | Carried by |
|---|---|---|---|---|
| SEC-1 | No authN/authZ model | Should-Fix (confirm scope) | **Explicit scope decision: out of scope for MDP-7.** Neither `01-requirements.md` nor `02-architecture.md` specifies an actor/session/permission model, and the human checkpoint approved the architecture without adding one. `Task.assignee` remains a free-text label, not a user-account reference. This is documented here as a deliberate deferral, not an oversight, and is flagged as a recommended follow-up story before any multi-tenant or production exposure of this API. | §0.1 |
| G-1 | Sync-job idempotency race (duplicate create) | Should-Fix | **Implemented.** Per-provider worker concurrency fixed at 1 (serial per lane) plus a Postgres advisory lock around the create-vs-update decision + `SyncLink` upsert, so the race is closed even if concurrency is later raised. | M6 |
| B-3 | Worker concurrency (serial vs pooled) unspecified | Note | **Implemented as part of G-1's fix**: concurrency = 1 per provider queue, documented and configurable via `QUEUE_CONCURRENCY` env var (default 1) so a future change is a config change, not a design change. | M6 |
| B-2 | `GET /tasks` unbounded list, no pagination | Should-Fix | **Implemented.** `limit`/`offset` query params, bounded defaults/maxima. | M4 |
| B-4 | No index on `Task.status`/`assignee`/`priority` (the `GET /tasks` filter columns) | Should-Fix | **Implemented.** Prisma `@@index` on each filter column. | M2 |
| B-1 | `/sync-health` unindexed aggregate scan, no caching strategy | Should-Fix | **Implemented.** Grouped SQL aggregate (`COUNT ... GROUP BY provider, lastStatus`) backed by an index on `SyncLink(provider, lastStatus)`, plus a short in-memory TTL cache to absorb bursty polling. Materialized-aggregate table explicitly deferred (documented, not silently dropped). | M7 |
| SEC-2 | No CORS policy specified | Should-Fix | **Implemented.** Explicit single-origin allowlist via `FRONTEND_ORIGIN` env var. | M8 |
| SEC-3 | No payload size limits / rate limiting | Note | **Implemented** (size limits are in-scope; rate limiting is added as a lightweight defense-in-depth measure). | M8 |
| S-1 | `SyncAttempt` unbounded growth, no retention policy | Note | **Explicit scope decision: deferred.** Retention/archival is out of scope for MDP-7 (no FR demands it); documented here as a known follow-up (e.g., archive-after-N-days job) rather than implemented now. | §0.1 |
| S-2 | Backend statelessness/horizontal scalability implied, not stated | Note | **Explicit scope decision: confirmed.** The backend is designed stateless (no in-process session/affinity state beyond the §M7 TTL cache, which is safe to lose on restart or diverge across replicas since it only shortens a read-time aggregate's freshness window). Documented here for the human/Phase 5 record. | §0.1 |
| G-2 | `pipeline-state.json` writes not specified as atomic | Should-Fix | **Implemented.** A small, dependency-free atomic-write utility (write-to-temp + rename) for the orchestrator to use on every phase-state write going forward. This is pipeline-layer, not application-layer, so it is scoped as its own milestone (M0) outside `backend/`/`frontend/`. | M0 |

### 0.1 Scope decisions — rationale detail

- **Authentication/authorization (SEC-1):** Not implemented. Rationale: adding an actor model
  would require inventing a user/session contract not present in `01-requirements.md` or
  `02-architecture.md`; doing so here would be re-deriving architecture, which is explicitly out
  of scope for this phase. Recommendation recorded for a future story.
- **`SyncAttempt` retention (S-1):** Not implemented. Rationale: no FR specifies a volume/SLA
  that requires pruning yet; append-only is the architecture's deliberate auditability trade-off
  (NFR-6). Recommendation: revisit with a scheduled archival job once attempt volume is observed
  in production.
- **Statelessness (S-2):** Confirmed, not changed. The backend holds no durable in-process state;
  the only in-memory data is the M7 sync-health cache, which is a performance optimization with
  no correctness dependency — any replica can serve a cache miss by recomputing from Postgres.

---

## 1. Tech Stack (fixes `02-architecture.md` §10's deferred choices)

| Concern | Choice | Rationale |
|---|---|---|
| Backend language/framework | Node.js + TypeScript + Express | Matches architecture diagram ("Backend API (Express + TS)") |
| ORM | Prisma + PostgreSQL | Matches architecture §4 data model language |
| Queue/broker | BullMQ + Redis | Satisfies "per-provider queue + bounded retry with backoff" (architecture §10); mature, well-tested Node queue library |
| Testing | Vitest + Supertest (routes) | Lightweight, TS-native, matches existing test file naming convention |
| Frontend | React + TypeScript + Vite | Matches architecture diagram ("React Frontend") |
| Frontend data fetching | Fetch wrapper + React Query (TanStack Query) | Handles polling (`/sync-health`) and cache invalidation cleanly |
| Linting/formatting | ESLint + Prettier (shared config, backend + frontend) | NFR-4 consistency |

---

## 2. Target Directory Layout

```
backend/
  src/
    app.ts                  # Express app wiring (routes, middleware)
    index.ts                # HTTP server entrypoint
    db.ts                   # Prisma client singleton
    errorHandler.ts         # Centralized error-handling middleware
    validation.ts           # Request validation helpers (enums, UUID, limits)
    atomicState.ts          # (re-exported from pipeline-layer util, see M0) — NOT used by app; omitted if unused
    routes/
      tasks.ts
      syncHealth.ts
    services/
      taskService.ts
      syncHealthService.ts
    queue/
      connection.ts          # Redis connection factory
      queueNames.ts
      queues.ts               # BullMQ Queue instances, one per provider
      types.ts                 # Job payload types
      providerInterface.ts     # SyncProviderClient interface
      providers/
        githubProvider.ts
        jiraProvider.ts
      workers.ts               # Worker factories (concurrency, advisory lock, retry/backoff)
      worker-main.ts           # Worker process entrypoint
    __tests__/
      taskService.test.ts
      syncHealthService.test.ts
      tasks.routes.test.ts
      workers.success.test.ts
      workers.failure.test.ts
  prisma/
    schema.prisma
  .env.example
  .gitignore
  package.json
  tsconfig.json
  vitest.config.ts

frontend/
  src/
    main.tsx
    App.tsx
    api/
      client.ts               # fetch wrapper, base URL from env
      tasks.ts                # task CRUD calls
      syncHealth.ts
    components/
      TaskBoard.tsx
      TaskForm.tsx
      TaskCard.tsx
      SyncStatusBadge.tsx
      SyncHealthPanel.tsx
    hooks/
      useTasks.ts
      useSyncHealth.ts
    types/
      task.ts
    __tests__/
      TaskBoard.test.tsx
      useTasks.test.ts
  .env.example
  .gitignore
  package.json
  tsconfig.json
  vite.config.ts
```

---

## 3. Milestones (ordered; each is a Phase-5 coding unit)

### M0 — Pipeline-layer hardening: atomic state writes (resolves G-2)

Outside `backend/`/`frontend/`; a pipeline-layer utility the orchestrator uses for every future
`pipeline-state.json` write (including the one that follows this phase's handback).

1. Create `.claude/lib/atomicWriteJson.ts` (or `.cjs`/`.mjs` — no build step, dependency-free):
   exports `writeJsonAtomic(path: string, data: unknown): void` implemented as
   `write to "<path>.tmp-<pid>-<timestamp>"` → `fs.renameSync(tmp, path)` (rename is atomic on
   the same filesystem), with the temp file cleaned up on write failure.
2. Document in a short header comment: this is the mechanism that satisfies `02-architecture.md`
   §3.2's "never a partially-written one" guarantee and NFR-5.
3. No test framework is wired for `.claude/` scripts yet; add a minimal manual verification note
   (not a unit test) — out of scope to stand up a second test runner for one utility function.

**Acceptance:** utility exists, is importable, and its write-then-rename behavior is documented
inline; orchestrator process (this agent pipeline) adopts it for all subsequent phase-state
writes from Phase 5 onward.

### M1 — Backend scaffolding

1. `backend/package.json` — scripts: `dev`, `build`, `start`, `test`, `worker`; dependencies:
   `express`, `@prisma/client`, `bullmq`, `ioredis`, `cors`, `express-rate-limit`, `zod` (or
   equivalent) for validation; devDependencies: `typescript`, `prisma`, `vitest`, `supertest`,
   `@types/*`, `eslint`, `prettier`.
2. `backend/tsconfig.json` — strict mode on (`strict: true`), `noImplicitAny`, ES2022 target.
3. `backend/.gitignore` — `node_modules`, `.env`, `dist`.
4. `backend/.env.example` — **names only**, per NFR-1: `DATABASE_URL`, `REDIS_URL` (renamed from
   architecture's generic `QUEUE_URL` to the concrete BullMQ backing store), `GITHUB_TOKEN`,
   `GITHUB_REPO`, `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `JIRA_PROJECT_KEY`, `FRONTEND_ORIGIN`,
   `PORT`, `QUEUE_CONCURRENCY` (default documented as `1`).
5. `backend/vitest.config.ts` — Node environment, coverage enabled (NFR-3: business logic must
   be covered).

**Acceptance:** `npm install` succeeds; `npm run build` produces no type errors on an empty
`src/index.ts` stub.

### M2 — Data layer: Prisma schema (resolves B-4)

1. `backend/prisma/schema.prisma`:
   - `enum TaskStatus { Backlog InProgress InReview Done }` (default `Backlog`)
   - `enum TaskPriority { Low Medium High }` (default `Medium`)
   - `enum SyncProvider { github jira }`
   - `enum SyncResult { ok failed }`
   - `model Task` — fields per architecture §4 (`id` UUID default, `title`, `description?`,
     `status`, `priority`, `assignee?`, `dueDate?`, `labels String[] @default([])`,
     `createdAt @default(now())`, `updatedAt @updatedAt`).
     - `@@index([status])`, `@@index([assignee])`, `@@index([priority])` — **resolves B-4**.
   - `model SyncLink` — `id`, `taskId String` (plain column, **no** `@relation` to `Task`, per
     architecture §4's documented delete-closes-linked-issue rationale), `provider`,
     `externalKeyOrUrl?`, `lastSyncedAt?`, `lastStatus SyncResult?`, `lastError?`.
     - `@@unique([taskId, provider])`
     - `@@index([provider, lastStatus])` — **resolves B-1** (backs the sync-health aggregate).
   - `model SyncAttempt` — `id`, `taskId String` (plain column, same rationale), `provider`,
     `timestamp @default(now())`, `result`, `detail?`.
     - `@@index([taskId])` (already specified in architecture).
2. Generate an initial migration: `npx prisma migrate dev --name init`.
3. `backend/src/db.ts` — single `PrismaClient` instance, exported, with
   `log: ["warn", "error"]` (never logs query params that could contain `description`/labels
   content with secrets — NFR-1 defense-in-depth).

**Acceptance:** `prisma migrate dev` runs clean against a local Postgres; generated client types
match the model above.

### M3 — Validation & centralized error handling

1. `backend/src/validation.ts`:
   - `isValidUuid(id: string): boolean`
   - `parseTaskStatus`, `parseTaskPriority` — reject unknown values (never coerce, per §5.2).
   - Field-length caps (**resolves SEC-3**): `title` required, 1–200 chars after trim;
     `description` optional, ≤5000 chars; `labels` array ≤20 items, each ≤50 chars; `assignee`
     optional, ≤200 chars.
   - Each validator returns a discriminated result (`{ ok: true, value }` |
     `{ ok: false, error: { code, message } }`) — no thrown exceptions for expected validation
     failures, per NFR-3 ("unhandled exceptions disallowed").
2. `backend/src/errorHandler.ts` — Express error middleware: maps known validation errors to
   `400` with `{ error, message }`; maps "not found" to `404`; catches everything else as `500`
   with a generic message, logging the real error server-side only — never a stack trace or
   internal detail in the response body (§5.2, NFR-3/4).
3. Unit tests for `validation.ts` edge cases (empty title, whitespace-only title, oversized
   description, invalid enum, malformed UUID).

**Acceptance:** all validators have passing unit tests covering valid, boundary, and invalid
inputs.

### M4 — Task CRUD: service + routes (resolves B-2)

1. `backend/src/services/taskService.ts` — pure functions over Prisma, no Express types leak in:
   - `listTasks({ status?, assignee?, priority?, limit = 50, offset = 0 })` → caps `limit` at a
     hard max (e.g., 200) regardless of requested value — **resolves B-2**; returns
     `{ tasks, total, limit, offset }`.
   - `getTask(id)` → task + `syncLinks[]` projection (architecture §5.1), or `null`.
   - `createTask(input)` → inserts with defaults, then triggers sync enqueue (M5) for the
     "create" case.
   - `updateTask(id, patch)` → partial update; triggers sync enqueue (M5) only if a mapped field
     changed (`status`/`priority`/`assignee`/title/description per provider mapping chosen in
     M6).
   - `deleteTask(id)` → idempotent delete (second delete on a missing id still returns success
     semantics the route maps to `204`); triggers "close" sync enqueue (M5) using a snapshot of
     the task taken immediately before delete.
2. `backend/src/routes/tasks.ts` — thin layer: parses/validates query & body via `validation.ts`,
   calls `taskService`, maps results to the status codes in architecture §5 table, never calls
   Prisma directly.
3. `backend/src/app.ts` — mounts `/api/tasks` router, JSON body parsing, error handler last.
4. Integration tests (`tasks.routes.test.ts`, Supertest + a test database or mocked Prisma):
   cover every row of the architecture §5 table (200/201/204/400/404 paths), plus pagination
   bounds (requesting `limit=10000` is clamped, not rejected) and the two "malformed id → 400"
   cases (`GET`/`PATCH`/`DELETE` by non-UUID id).

**Acceptance:** route tests green; `taskService` unit-testable with Prisma mocked (NFR-3).

### M5 — Sync queue infrastructure

1. `backend/src/queue/connection.ts` — single `ioredis` connection factory from `REDIS_URL`.
2. `backend/src/queue/queueNames.ts` — `"sync-github"`, `"sync-jira"` constants.
3. `backend/src/queue/types.ts` — `SyncJobPayload { taskId, provider, operation: "create" |
   "update" | "close", snapshot: { title, status, priority, assignee, labels } }` — the snapshot
   is captured at enqueue time so a `close` job never needs to re-read a possibly-deleted `Task`
   row (architecture §6 step 2).
4. `backend/src/queue/queues.ts` — one BullMQ `Queue` per provider, both configured with the
   bounded exponential-backoff retry policy from architecture §6 step 5 (e.g.,
   `attempts: 5, backoff: { type: "exponential", delay: 1000 }`).
5. Wire `taskService`'s create/update/delete to enqueue onto whichever provider queues are
   configured (env-var presence check — see M6 point 5) — enqueue call is fire-and-forget, never
   `await`ed by the request handler (architecture §2, §6 step 2).

**Acceptance:** enqueue calls are unit-testable by mocking the `Queue.add` call; no HTTP request
handler awaits a queue operation.

### M6 — Sync workers + provider adapters (resolves G-1, B-3)

1. `backend/src/queue/providerInterface.ts` — `SyncProviderClient { createIssue(snapshot):
   Promise<{ externalKeyOrUrl }>; updateIssue(externalKeyOrUrl, snapshot): Promise<void>;
   closeIssue(externalKeyOrUrl): Promise<void> }`.
2. `backend/src/queue/providers/githubProvider.ts`, `jiraProvider.ts` — implement the interface
   against each REST API, reading `GITHUB_TOKEN`/`GITHUB_REPO` or
   `JIRA_API_TOKEN`/`JIRA_BASE_URL`/`JIRA_PROJECT_KEY` once at module load; no other layer ever
   sees the raw token (NFR-1).
3. **Partial provider configuration** (architecture §6 step 6): at worker-process start, each
   provider adapter checks its required env vars; if absent, that provider's worker is not
   started (logged once, not per-job) and jobs on that queue are left pending rather than
   crashing the process. The other provider's worker continues independently.
4. **Idempotency / dedup fix (resolves G-1) and concurrency fix (resolves B-3)**, in
   `backend/src/queue/workers.ts`:
   - Each provider `Worker` is created with `concurrency` read from `QUEUE_CONCURRENCY`
     (**default `1`** — serial processing per lane, closing B-3 by making the behavior explicit
     and configurable rather than undefined).
   - Inside the job processor, before the create-vs-update branch, acquire a Postgres session
     advisory lock scoped to `(taskId, provider)`:
     `SELECT pg_advisory_xact_lock(hashtext(taskId || ':' || provider))` inside the same
     transaction that reads `SyncLink`, decides create vs update, calls the provider adapter, and
     upserts `SyncLink` + inserts `SyncAttempt`. The lock is released automatically at
     transaction end. This makes the create-vs-update decision safe even if `QUEUE_CONCURRENCY`
     is later raised above 1 — **resolves G-1** without depending solely on serial processing.
   - On provider-call failure, the transaction still commits the `SyncAttempt` (`failed`) and
     `SyncLink` update — failure bookkeeping is never lost — then BullMQ's retry/backoff (M5)
     reschedules the job up to its attempt cap.
5. `backend/src/queue/worker-main.ts` — process entrypoint that starts both workers; run via
   `npm run worker`, separate process from the API server (statelessness, S-2).
6. Tests: `workers.success.test.ts` (create → update → close happy path, snapshot-based close
   after task deletion), `workers.failure.test.ts` (provider call throws → `SyncAttempt(failed)`
   recorded, job retried per backoff policy, process does not crash); a dedicated test
   simulating two concurrent jobs for the same `(taskId, provider)` asserting only one
   `createIssue` call occurs.

**Acceptance:** concurrency + advisory-lock tests pass; partial-config test (one provider's env
vars absent) shows the other provider's worker still processes jobs.

### M7 — Sync-health endpoint (resolves B-1)

1. `backend/src/services/syncHealthService.ts`:
   - Single grouped SQL query (via Prisma `groupBy` or raw SQL) over `SyncLink`, filtered to
     `taskId`s of currently-existing tasks, producing counts per `(provider, lastStatus)` —
     backed by the `@@index([provider, lastStatus])` added in M2. `pending` is derived as
     `expected (existing tasks × configured providers) − rows with non-null lastStatus`, per
     architecture §4's "pending is derived, not stored" rule.
   - `failing: [...]` list: tasks whose latest `SyncLink.lastStatus = "failed"`, with
     `lastError`, capped at a reasonable page size (reuses the pagination pattern from M4).
   - **Caching (resolves B-1):** wrap the computed result in a process-local TTL cache (e.g., 5
     seconds), keyed by the optional `provider` filter, invalidated naturally on expiry — no
     invalidation-on-write needed since a few seconds of staleness on a health/status endpoint is
     an accepted trade-off, explicitly documented here rather than left unstated. A materialized
     aggregate table is documented as the next escalation if load ever requires sub-second
     freshness at high volume (deferred, not implemented — consistent with S-1's deferred
     posture).
2. `backend/src/routes/syncHealth.ts` — `GET /api/sync-health`, optional `provider` query param,
   validated against the `SyncProvider` enum.
3. Unit tests for `syncHealthService` covering: no tasks, all pending, mixed ok/failed/pending,
   a deleted task's stale `SyncLink` correctly excluded from the "existing tasks" denominator
   (architecture §4's explicit edge case), and cache-hit vs cache-expiry behavior.

**Acceptance:** sync-health tests pass, including the deleted-task exclusion case called out in
the architecture doc.

### M8 — Cross-cutting hardening (resolves SEC-2, SEC-3)

1. **CORS (resolves SEC-2):** in `app.ts`, configure the `cors` middleware with a single-origin
   allowlist read from `FRONTEND_ORIGIN` (no wildcard `*`), `credentials: false` (no cookies/auth
   in scope per §0.1's SEC-1 decision), explicit allowed methods (`GET, POST, PATCH, DELETE`).
2. **Payload limits (resolves SEC-3):** `express.json({ limit: "100kb" })`; field-level caps
   already enforced in M3's validators.
3. **Rate limiting (resolves SEC-3, defense-in-depth):** `express-rate-limit` mounted on `/api`,
   a conservative window (e.g., 100 req/min/IP), returning the same structured error body shape
   (`429` with `{ error: "rate_limited", message }`) for consistency with §5.2.
4. Integration test asserting a cross-origin request from a non-allowlisted origin is rejected,
   and one asserting an oversized JSON body is rejected with `400`/`413` rather than crashing the
   process.

**Acceptance:** CORS/size/rate-limit tests pass; no behavior change to existing route tests from
M4.

### M9 — Backend test completion & coverage pass

1. Confirm coverage of all business logic per NFR-3: `taskService`, `syncHealthService`,
   `validation.ts`, provider adapters (mocked HTTP), workers.
2. Run full suite (`npm test`) locally; fix any gaps before moving to frontend milestones so
   Phase 6 (code-review) and Phase 7 (verification) start from a green backend.

**Acceptance:** `npm test` green; coverage report shows no untested service/validation module.

### M10 — Frontend scaffolding

1. `frontend/package.json` — Vite + React + TypeScript template; dependencies: `react`,
   `react-dom`, `@tanstack/react-query`; devDependencies: `typescript`, `vite`, `vitest`,
   `@testing-library/react`, `eslint`, `prettier`.
2. `frontend/.env.example` — `VITE_API_BASE_URL` (name only, per NFR-1).
3. `frontend/tsconfig.json` — strict mode on, matching backend's rigor (NFR-4 consistency).
4. `frontend/src/api/client.ts` — thin fetch wrapper: base URL from
   `import.meta.env.VITE_API_BASE_URL`, structured-error-aware (surfaces `{ error, message }`
   from a non-2xx response as a typed exception the UI can render, never a raw stack trace).

**Acceptance:** `npm run dev` serves a blank app with no type errors.

### M11 — Frontend: task board

1. `frontend/src/types/task.ts` — mirrors backend `Task`/`SyncLink` shapes (manually kept in
   sync; architecture doesn't specify a shared-types package, so this is an explicit,
   intentionally duplicated contract boundary).
2. `frontend/src/api/tasks.ts` — `listTasks(filters, pagination)`, `getTask(id)`, `createTask`,
   `updateTask`, `deleteTask`, matching the M4 backend contract including `limit`/`offset`.
3. `frontend/src/hooks/useTasks.ts` — React Query hook wrapping `listTasks`, with filter/page
   state.
4. `frontend/src/components/TaskBoard.tsx`, `TaskCard.tsx`, `TaskForm.tsx`,
   `SyncStatusBadge.tsx` — board view grouped by status, create/edit form with the same
   validation boundaries as the backend (client-side mirrors M3's caps for immediate feedback;
   server remains the source of truth), per-provider sync badges from the `syncStatus[]`
   projection (architecture §5.1).
5. Pagination controls wired to the `limit`/`offset` params from M4/B-2.
6. Component tests (`TaskBoard.test.tsx`, `useTasks.test.ts`) with the API layer mocked.

**Acceptance:** board renders, create/edit/delete flows work against a running backend; tests
green with API mocked.

### M12 — Frontend: sync-health view

1. `frontend/src/api/syncHealth.ts`, `frontend/src/hooks/useSyncHealth.ts` — polling hook (sane
   interval, e.g., 15s, respecting the backend's M7 cache TTL so polling doesn't defeat the
   cache).
2. `frontend/src/components/SyncHealthPanel.tsx` — renders `counts`, `byProvider`, `failing[]`
   with `lastError` text.

**Acceptance:** panel reflects backend `/api/sync-health` state and updates on poll.

### M13 — Docs & environment wiring

1. Root or per-package `README.md` sections: setup (`.env` from `.env.example`, `prisma migrate
   dev`, `npm run dev`, `npm run worker`), matching NFR-1 (names only, no values anywhere).
2. Confirm `.env.example` files in both `backend/` and `frontend/` are git-tracked while `.env`
   is git-ignored in both.

**Acceptance:** a fresh clone + `.env` fill-in can run the full stack following the README alone.

### M14 — Phase-5 readiness checklist

Before handing off to the `implementation-agent` (Phase 5), confirm this plan's milestones each
have: target files, explicit acceptance criteria, and a named design-review finding (if
applicable) they resolve. Phase 5 should implement milestones **in the order listed** (M0 → M13),
since M2–M9 (backend) establish the contract M10–M12 (frontend) consume, and M0 is independent
pipeline-layer housekeeping that can land anytime before the next phase-state write.

---

## 4. Traceability Summary

| Requirement/Finding | Resolved by |
|---|---|
| FR-9 (task CRUD) | M4 |
| FR-10 (sync-health) | M5, M6, M7 |
| NFR-1 (no hardcoded secrets) | M1 (.env.example), M6 (token scoping) |
| NFR-2 (git workflow) | Enforced by orchestrator/PR phase, not this plan's concern |
| NFR-3 (clean code, tests) | M3, M4, M6, M7, M9 |
| NFR-4 (consistency) | M1/M10 shared strictness, M8 error-shape consistency |
| SEC-1 (authN/authZ) | §0.1 — explicit out-of-scope decision |
| SEC-2 (CORS) | M8 |
| SEC-3 (payload limits/rate limiting) | M3 (field caps), M8 (body size, rate limit) |
| G-1 (idempotency race) | M6 |
| G-2 (atomic state writes) | M0 |
| B-1 (/sync-health scan+caching) | M2 (index), M7 (caching) |
| B-2 (pagination) | M4 |
| B-3 (worker concurrency) | M6 |
| B-4 (filter-column indexes) | M2 |
| S-1 (SyncAttempt retention) | §0.1 — explicit deferred decision |
| S-2 (statelessness) | §0.1 — explicit confirmation |

---

*This document is the implementation-planner-agent's output for Phase 4. Per `02-architecture.md`
§3.2, the orchestrator — not this agent — updates `docs/MDP-7/pipeline-state.json` to mark Phase
4 `completed`.*
