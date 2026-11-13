# Phase 02 — Architecture Design

**Story Key:** MDP-7
**Phase:** 2 — Architecture Design
**Source:** `docs/MDP-7/01-requirements.md`
**Run:** 2 (re-run — see §0)
**Status:** Draft — awaiting the human-in-the-loop checkpoint after Phase 3 (design review) before
any further implementation work (FR-6, NFR-7)

## 0. Re-run Basis (this revision only)

Unlike the previous run — which designed `backend/`/`frontend/` on a clean slate because the
source trees did not yet exist — this revision documents the **as-built** system. `backend/src/`,
`backend/prisma/schema.prisma`, and `frontend/src/` already exist and already implement the
contract fixed by the prior architecture/design-review/implementation cycle (PR #1). This document
was re-derived by reading that source tree directly, not copied from the prior `02-architecture.md`,
per `01-requirements.md` §6 ("Phases 2–5 of this run should treat the existing implementation as
the baseline ... rather than redesigning or rewriting the application from scratch, unless a
genuine requirement drift is found"). No requirement drift was found. §12 below lists exactly what
changed in this document relative to the previous run's version and why.

This document covers both deliverables named in the requirements: (A) the **Agentic SDLC
pipeline** itself (the `.claude/` automation layer, FR-1..FR-8) and (B) the **Task Manager
Application** (backend + frontend, FR-9, FR-10, FR-11, NFR-8).

## 1. System Overview

Two coupled subsystems, built to the same constraints:

| Subsystem | Responsibility | Primary requirements |
|---|---|---|
| **Pipeline layer** (`.claude/agents`, `.claude/skills`, `.claude/hooks`, `docs/MDP-7/pipeline-state.json`) | Drives the 8-phase SDLC lifecycle for this story, persists state, enforces the human checkpoint | FR-1..FR-8, NFR-5, NFR-6, NFR-7 |
| **Application layer** (`backend/`, `frontend/`) | Task CRUD, external sync-health reporting, idempotent provider sync, API hardening | FR-9, FR-10, FR-11, NFR-8 |

Both subsystems share the same governance constraints: no hardcoded credential values (NFR-1), feature-branch-only
git workflow (NFR-2), clean/tested code (NFR-3, `.claude/rules/code-quality.md`), consistent
formatting/typing/error-handling (NFR-4), and credential-hygiene enforcement at commit time (NFR-9).

## 2. Component Interaction Diagram

```
                              PIPELINE LAYER (FR-1..FR-8)
┌───────────────────────────────────────────────────────────────────────────┐
│ Orchestrator (drives docs/MDP-7/pipeline-state.json)                       │
│                                                                             │
│  Phase 1          Phase 2           Phase 3            Phase 4            │
│  requirements-   architecture-      design-review-     implementation-    │
│  agent      ───▶ agent        ───▶  agent         ──┐  planner-agent      │
│  │                │                 │                │  (blocked until    │
│  ▼                ▼                 ▼                │   human approves)  │
│  01-requirements  02-architecture   03-design-review  │       ▼            │
│  .md              .md               .md               │  04-impl-plan.md  │
│                                                         │       │          │
│                              ┌──────────────────────────┘       ▼         │
│                              │  HUMAN CHECKPOINT (FR-6, NFR-7)  Phase 5    │
│                              │  "Design approval before          implementation- │
│                              │   implementation begins"          agent           │
│                              │  gate: humanCheckpoints[0].status │     │         │
│                              │  must flip to "approved"           ▼             │
│                              └────────────────────────────  05-implementation-  │
│                                                               summary.md         │
│                                                                    │            │
│   Phase 6              Phase 7                  Phase 8            │           │
│   code-review-agent ◀──┤ verification-agent ◀───┤ pr-creator-agent │           │
│   │                    │ (runs test suites)      │ (opens PR)      │           │
│   ▼                    ▼                         ▼                │           │
│   06-code-review.md    07-verification-report.md 08-pr-summary.md ◀───────────┘
└───────────────────────────────────────────────────────────────────────────┘
        every phase transition recorded in docs/MDP-7/pipeline-state.json
        (pending → in-progress → completed), FR-4, NFR-5, NFR-6


                    APPLICATION LAYER — AS BUILT (FR-9, FR-10, FR-11, NFR-8)
┌──────────────────┐   REST/JSON over HTTP   ┌─────────────────────────────────────────┐
│  React Frontend   │ ───────────────────────▶│  backend/src/app.ts  (Express)          │
│  TaskBoard.tsx,    │◀─────────────────────── │  middleware, mounted in this order:     │
│  SyncHealthPanel   │  JSON / structured      │  1. cors() — single-origin allowlist    │
│  (useTasks,        │  4xx/5xx { error,       │  2. express.json({ limit: "100kb" })    │
│   useSyncHealth)   │  message }               │  3. rateLimit() mounted on "/api"       │
└──────────────────┘                          │  4. /health  (unauthenticated liveness) │
                                                │  5. /api/tasks      → tasksRouter       │
                                                │  6. /api/sync-health → syncHealthRouter │
                                                │  7. notFoundHandler, then errorHandler  │
                                                └─────────────────┬────────────────────┬─┘
                                                     routes → services (no Prisma in    │
                                                     routes; validation.ts is the only  │
                                                     place request shape is checked)    │
                                      ┌─────────────────────┼──────────────────────┐    │
                                      │ Prisma ORM (db.ts)   │ enqueueSyncForAllProviders │
                                      ▼                     ▼                       │
                             ┌─────────────────┐  ┌──────────────────────┐         │
                             │  PostgreSQL      │  │  BullMQ (Redis)       │         │
                             │  tasks,          │  │  queue "sync-github", │         │
                             │  sync_links,     │  │  queue "sync-jira"    │         │
                             │  sync_attempts   │  │  (queueNames.ts)      │         │
                             └─────────────────┘  └──────────┬────────────┘         │
                                      ▲                      │ job: {taskId,         │
                                      │                      │  provider, operation, │
                                      │                      │  snapshot}            │
                                      │                      ▼                      │
                                      │              ┌───────────────┐              │
                                      └──────────────│ Worker (workers.ts) │◀────────┘
                                                      │ pg_advisory_xact_lock│
                                                      │ (taskId, provider)  │
                                                      │ — inside one tx with │
                                                      │ SyncLink upsert +     │
                                                      │ SyncAttempt insert    │
                                                      └───────┬───────┘
                                                              │ via SyncProviderClient
                                              ┌───────────────┴────────────────┐
                                              ▼                                 ▼
                                    ┌───────────────────┐           ┌────────────────────┐
                                    │  githubProvider.ts  │           │  jiraProvider.ts     │
                                    │  (env: GITHUB_TOKEN, │           │  (env: JIRA_API_TOKEN,│
                                    │   GITHUB_REPO)       │           │  JIRA_BASE_URL,       │
                                    │                      │           │  JIRA_PROJECT_KEY)    │
                                    └─────────┬──────────┘           └──────────┬──────────┘
                                              ▼                                 ▼
                                      GitHub REST API                    Jira REST API
```

Key interaction properties, confirmed against source:

- **Frontend never calls GitHub/Jira directly** (`frontend/src/api/` only calls `VITE_API_BASE_URL`
  endpoints). All sync traffic is centralized through the backend (FR-10, NFR-1).
- **Task CRUD is synchronous; sync is asynchronous and fire-and-forget.** `taskService.createTask`
  / `updateTask` / `deleteTask` commit to Postgres via `prisma.task.*`, then call
  `enqueueSyncForAllProviders(...)` without `await`ing its queue `.add()` promise in the request
  path — enqueue failures (e.g., Redis unreachable) are caught and logged, never thrown into the
  HTTP response (`backend/src/queue/enqueueSync.ts`).
- **One BullMQ queue per provider** (`sync-github`, `sync-jira`) so a Jira outage cannot block
  GitHub sync and vice versa (`backend/src/queue/queueNames.ts`, `queues.ts`).
- **Provider adapters implement one shared interface**, `SyncProviderClient`
  (`backend/src/queue/providerInterface.ts`: `createIssue` / `updateIssue` / `closeIssue`), so
  `workers.ts` never depends on a concrete provider SDK.
- **Partial provider configuration is a no-crash path.** `enqueueSync.ts`'s
  `isGithubConfigured()` / `isJiraConfigured()` gate which queues receive jobs, and
  `workers.createProviderWorker()` returns `null` (logging a warning) instead of starting a worker
  when a provider's env vars are absent — the other, configured provider is unaffected.
- **Credentials flow only into `queue/providers/*.ts`**, read from `process.env` at call time; no
  route, service, queue payload, or frontend code ever sees a raw token (NFR-1). `SyncLink.lastError`
  / `SyncAttempt.detail` are restricted to human-readable failure text, never header/credential
  values.
- **Sync idempotency is enforced inside the worker transaction, not at enqueue time** (FR-11,
  AC-9) — see §6.2. This is the mechanism that resolves the previous run's design-review finding
  G-1 (sync-job idempotency race).
- **The pipeline orchestrator never implements application code itself** — it only sequences
  agents and persists phase state; the application code audited in this document was produced by
  the `implementation-agent` in the previous run's Phase 5, against the contract this document now
  re-confirms.

## 3. Pipeline Layer Design (FR-1..FR-8, NFR-5, NFR-6, NFR-7)

Unchanged from the previous run — the pipeline layer itself is not part of this run's requirement
drift (§0); restated here for completeness and because this document remains the single owner of
the pipeline-layer design.

### 3.1 Phase-to-artifact-to-agent mapping (FR-1, FR-2, AC-1)

| # | Phase | Agent | Artifact |
|---|---|---|---|
| 1 | requirements-analysis | requirements-agent | `docs/MDP-7/01-requirements.md` |
| 2 | architecture-design | architecture-agent | `docs/MDP-7/02-architecture.md` |
| 3 | design-review | design-review-agent | `docs/MDP-7/03-design-review.md` |
| 4 | implementation-planning | implementation-planner-agent | `docs/MDP-7/04-impl-plan.md` |
| 5 | code-implementation | implementation-agent | `docs/MDP-7/05-implementation-summary.md` |
| 6 | code-review | code-review-agent | `docs/MDP-7/06-code-review.md` |
| 7 | verification-testing | verification-agent | `docs/MDP-7/07-verification-report.md` |
| 8 | pr-creation | pr-creator-agent | `docs/MDP-7/08-pr-summary.md` |

Each phase is a discrete, independently invokable unit (its own agent definition file under
`.claude/agents/`) — no agent reads another phase's working context directly; each reads only the
prior phase's committed artifact file (NFR-6).

### 3.2 State machine (FR-4, FR-5, NFR-5)

`docs/MDP-7/pipeline-state.json` is the single source of truth for pipeline progress: each phase
transitions `pending → in-progress → completed`; the orchestrator — not the phase agent — writes
the transition, only after confirming the phase's artifact file exists and is non-empty, via
`.claude/lib/atomicWriteJson.ts` (temp-file write + rename, so a crash mid-write never leaves a
corrupt or partially-written state file). Phases execute strictly in order (FR-5); the
orchestrator refuses to start phase *N+1* while phase *N* is not `completed`. This phase agent's
own scope is limited to producing `02-architecture.md`; per this run's explicit task instructions,
this agent does **not** write to `pipeline-state.json` — that transition is recorded by the
orchestrator.

### 3.3 Human-in-the-loop checkpoint (FR-6, NFR-7)

- Gate location: immediately after Phase 3 (design-review) commits `03-design-review.md`.
- Mechanism: `humanCheckpoints[0].status` starts at `"awaiting-response"` (current file:
  `"pending"`, equivalent semantics); the orchestrator MUST NOT invoke `implementation-planner-agent`
  (Phase 4) while that status is not `"approved"`.
- No agent — including the design-review-agent itself — may set this status to `"approved"`. Only
  an explicit human action flips it.
- On rejection (`"changes-requested"`), the orchestrator routes back to the architecture-agent
  (Phase 2, this agent) to revise this document and resubmits a fresh `03-design-review.md`.

### 3.4 Verification and PR phases (FR-7, FR-8, AC-5, AC-6)

- Phase 7 (verification-agent) runs the automated suites in `backend/src/__tests__/` and
  `frontend/src/__tests__/` and writes pass/fail results, coverage notes, and AC traceability
  (including, this run, AC-10/AC-11) to `docs/MDP-7/07-verification-report.md`. A failing suite
  blocks Phase 8.
- Phase 8 (pr-creator-agent) authenticates to the git remote using a token read from the
  environment at run time (NFR-1) and writes a structured title/description/test-plan summary to
  `docs/MDP-7/08-pr-summary.md`, from a feature branch (NFR-2).

## 4. Application Layer — Data Model (as implemented in `backend/prisma/schema.prisma`)

### Enums

| Enum | Values |
|---|---|
| `TaskStatus` | `Backlog` (default), `InProgress`, `InReview`, `Done` |
| `TaskPriority` | `Low`, `Medium` (default), `High` |
| `SyncProvider` | `github`, `jira` |
| `SyncResult` | `ok`, `failed` |

Enum values are validated at the API boundary by `backend/src/validation.ts`
(`parseTaskStatus`/`parseTaskPriority`); an invalid value returns `ValidationResult<{ok:false}>`,
which the route maps to a structured `400` — never silently coerced to a default (NFR-3, NFR-4).

### `Task` (`@@map("tasks")`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | primary key |
| `title` | `String` | required; trimmed, 1–200 chars (`LIMITS.TITLE_MIN_LENGTH/MAX_LENGTH`) |
| `description` | `String?` | optional, ≤5000 chars (`LIMITS.DESCRIPTION_MAX_LENGTH`) |
| `status` | `TaskStatus @default(Backlog)` | indexed (`@@index([status])`) |
| `priority` | `TaskPriority @default(Medium)` | indexed (`@@index([priority])`) |
| `assignee` | `String?` | indexed (`@@index([assignee])`); free-text, not a user/session reference (no authN/authZ in scope) |
| `dueDate` | `DateTime?` | optional |
| `labels` | `String[] @default([])` | ≤20 items, each ≤50 chars (`LIMITS.LABELS_MAX_COUNT/LABEL_MAX_LENGTH`) |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | set on every write |

The three `@@index` entries on `status`/`assignee`/`priority` back every `GET /tasks` filter
column — this is the resolution of the previous run's design-review finding **B-4** (filter-column
indexes), confirmed present and unchanged in the current schema.

### `SyncLink` (`@@map("sync_links")`) — current sync state, one row per task/provider pair

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | primary key |
| `taskId` | `String` | **not** an enforced FK to `Task` (rationale below) |
| `provider` | `SyncProvider` | |
| `externalKeyOrUrl` | `String?` | linked GitHub issue URL / Jira issue key, once known |
| `lastSyncedAt` | `DateTime?` | timestamp of the most recent attempt |
| `lastStatus` | `SyncResult?` | `null` until the first attempt resolves → read as `"pending"` |
| `lastError` | `String?` | human-readable failure reason only — never a credential value (NFR-1) |
| unique | `@@unique([taskId, provider])` | one current-state row per task/provider; also the key used by the advisory-lock upsert in §6.2 |
| index | `@@index([provider, lastStatus])` | backs the sync-health `groupBy` aggregate — resolution of design-review finding **B-1** |

### `SyncAttempt` (`@@map("sync_attempts")`) — append-only audit trail

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | primary key |
| `taskId` | `String` | **not** an enforced FK to `Task`, same rationale as `SyncLink` |
| `provider` | `SyncProvider` | |
| `timestamp` | `DateTime @default(now())` | |
| `result` | `SyncResult` | |
| `detail` | `String?` | success detail (external key/url) or failure reason — never a credential |
| index | `@@index([taskId])` | fast lookup of a task's sync history |

**Why `taskId` is a plain column, not an enforced FK:** deleting a task must still be able to
write its "close" result to `SyncLink`/`SyncAttempt` *after* the `Task` row is gone
(`taskService.deleteTask` snapshots the task, deletes it, then enqueues the close job — the worker
later writes its result against a `taskId` that no longer resolves to a `Task` row). A restrictive
FK would reject that write; `ON DELETE CASCADE` would erase the audit trail the moment the task is
deleted, undermining sync-health accounting (FR-10, AC-8) and auditability (NFR-6).

**Why "pending" is derived, not stored:** `syncHealthService.computeSyncHealth` computes, per
provider, `pending = max(existingTaskCount − ok − failed, 0)`, scoped to `existingTaskIds` fetched
fresh from `prisma.task.findMany`. A deleted task's historical (terminal) `SyncLink` row is
excluded from `existingTaskIds` and therefore never skews the pending count for tasks that still
exist (AC-8).

## 5. Application Layer — Backend API

Base path: `/api`. All responses are JSON; every error response uses the structured body
`{ "error": "<machine_code>", "message": "<human text>" }` (`errorHandler.ts`'s `ErrorBody` type)
and never includes a stack trace (NFR-3, NFR-4).

| Method | Path | Request | Success | Errors |
|---|---|---|---|---|
| `GET` | `/tasks` | optional `status`, `priority`, `assignee` filters; optional `limit`, `offset` | `200` `{ tasks: TaskWithSyncStatus[], total, limit, offset }` | `400` `invalid_status` / `invalid_priority` on unrecognized enum filter |
| `POST` | `/tasks` | `title` (required), `description?`, `status?`, `priority?`, `assignee?`, `labels?`, `dueDate?` | `201` created `Task` | `400` structured validation error per field (see `validation.ts`) |
| `GET` | `/tasks/:id` | — | `200` `Task & { syncLinks[] }` | `404` `not_found`; `400` `invalid_id` for a malformed UUID |
| `PATCH` | `/tasks/:id` | any subset of the `POST` body fields | `200` updated `Task` | `404` `not_found`; `400` invalid partial field or malformed id |
| `DELETE` | `/tasks/:id` | — | `204` no content | `400` `invalid_id`; **idempotent** — a repeat delete on an already-missing id still returns `204`, never `404` |
| `GET` | `/sync-health` | optional `provider` (`github`\|`jira`) | `200` `{ counts: ProviderCounts, byProvider: Record<string, ProviderCounts>, failing: FailingTaskSummary[] }` | `400` `invalid_provider` |
| `GET` | `/health` (outside `/api`, unauthenticated, exempt from the `/api` rate limiter) | — | `200` `{ status: "ok" }` | — |

### 5.1 `GET /tasks` pagination contract (FR-9, AC-7)

- `limit`/`offset` are parsed by `clampLimit`/`clampOffset` in `validation.ts`: a missing,
  non-numeric, or out-of-range value is **clamped, never rejected with a `400`** —
  `limit` defaults to `LIMITS.LIST_DEFAULT_LIMIT` (`50`) and is capped at
  `LIMITS.LIST_MAX_LIMIT` (`200`); `offset` floors at `0`.
- The response always echoes the effective `limit`/`offset` actually applied, plus `total` (the
  unpaginated match count via `prisma.task.count`), so a client can page reliably even after its
  own values were clamped server-side — this is the exact shape AC-7 requires.
- This is the resolution of design-review finding **B-2** (previously: `GET /tasks` had no
  pagination at all).

### 5.2 Sync-related response shape

- `GET /tasks` list items include a lightweight `syncStatus: { provider, status }[]`
  (`taskService.attachSyncStatus`) — `status` is `lastStatus ?? "pending"` — so a board/list view
  renders per-provider badges without N extra requests.
- `GET /tasks/:id` includes the full `syncLinks[]` (`externalKeyOrUrl`, `lastSyncedAt`,
  `lastStatus`, `lastError`) for the detail view (`taskService.getTask`).
- Both are read-time projections over `SyncLink` — no duplicated stored state.

### 5.3 Validation rules enforced at the API boundary (NFR-3, NFR-4)

Centralized in `backend/src/validation.ts`; every validator returns a discriminated
`ValidationResult<T>` (`{ok:true,value}` / `{ok:false,error}`) instead of throwing, so an expected
validation failure is a typed outcome, not an unhandled exception (code-quality rule, NFR-3):

- `title`: required, string, trimmed length `1..200`.
- `description`: optional string, ≤5000 chars.
- `assignee`: optional string, ≤200 chars.
- `labels`: optional array, ≤20 items, each a string ≤50 chars.
- `dueDate`: optional ISO-8601 string or `Date`, must parse to a valid date.
- `status`/`priority`: must be a member of the Prisma enum; unknown values rejected via
  `parseTaskStatus`/`parseTaskPriority`, never coerced.
- `:id` path params: validated as a well-formed UUID (`isValidUuid`) before reaching Prisma —
  malformed ids short-circuit to `400 invalid_id` rather than surfacing a `500`.
- Any uncaught error reaching `errorHandler` is converted to the structured 4xx/5xx body; no stack
  trace or internal detail reaches the client.

## 6. Application Layer — API Hardening & Sync Idempotency (NFR-8, FR-11)

### 6.1 Hardening middleware stack (`backend/src/app.ts`) — NFR-8, AC-10

Mounted in this fixed order, each independently testable and each resolving one previous
design-review security finding:

| Order | Control | Implementation | Resolves |
|---|---|---|---|
| 1 | CORS single-origin allowlist | `cors({ origin: (reqOrigin, cb) => ... })` — allows only `process.env.FRONTEND_ORIGIN` (and no-`Origin` server-to-server calls); any other origin gets `AppError(403, "cors_rejected", ...)`; `credentials: false` (no auth/cookies in scope, confirmed scope decision); `methods` restricted to `GET/POST/PATCH/DELETE` | SEC-2 |
| 2 | Bounded JSON body size | `express.json({ limit: "100kb" })`; body-parser's `entity.too.large` error is mapped by `errorHandler.ts` to a structured `413 { error: "payload_too_large", message }`, never a raw 500/crash | SEC-3 (payload half) |
| 3 | Rate limiting on `/api` | `express-rate-limit`: `windowMs = 60_000`, `max = 100`, mounted via `app.use("/api", apiRateLimiter)`; its `handler` returns `429 { error: "rate_limited", message: "Too many requests. Please try again later." }` (matching NFR-8(c) and the AC-10 assertion text exactly) | SEC-3 (rate half) |

No architectural change is required for NFR-8/AC-10 in this run — all three controls, in this
exact configuration, already exist in `app.ts` and already match the requirement text. The only
open item is **test coverage**, addressed in §6.3.

### 6.2 Sync-job idempotency (FR-11, AC-9) — resolution of design-review finding G-1

The previous design-review flagged a race: if two sync jobs for the same `(taskId, provider)` were
both processed before the first resolved, both could see "no `SyncLink.externalKeyOrUrl` yet" and
both call the provider's `createIssue`, producing a duplicate external issue. The implemented fix,
in `backend/src/queue/workers.ts::processSyncJob`:

1. The entire create-vs-update decision, the provider call, and the `SyncLink` upsert +
   `SyncAttempt` insert happen inside **one Prisma `$transaction`**.
2. The first statement inside that transaction acquires a **Postgres session-scoped advisory lock**
   keyed on `(taskId, provider)` via `pg_advisory_xact_lock(hashtext($1 || ':' || $2))` — this lock
   is automatically released at transaction commit/rollback, so no explicit unlock path can be
   missed.
3. Because the lock is held for the lifetime of the transaction, a second job for the same
   `(taskId, provider)` pair — whether from a retry, a duplicate enqueue, or genuine worker
   concurrency — blocks until the first transaction commits, then re-reads `SyncLink` and correctly
   sees the now-existing `externalKeyOrUrl`, taking the **update** branch instead of **create**.
4. This makes the fix correct independent of `QUEUE_CONCURRENCY` (`getConfiguredConcurrency()`,
   default `1`) — raising concurrency later does not reopen the race, because the lock — not serial
   processing — is what prevents the duplicate (this also resolves the previous design-review's
   **B-3** note about undefined worker concurrency: it is now explicit, env-configurable, and
   safe at any value).
5. On a provider-call failure, the `failed` `SyncAttempt` + `SyncLink` bookkeeping is committed
   as part of the same transaction before the error is re-thrown, so BullMQ's own retry/backoff
   (bounded attempt cap) reschedules the job without ever losing the failure record.

This is a transaction/locking design, not a queue-level dedupe key, specifically because it must
also cover the plain retry case (same job redelivered by BullMQ) and the cross-operation case
(e.g., a `create` job and a racing `update` job for a task edited immediately after creation) —
both land on the same lock key and are serialized identically.

### 6.3 Where AC-10's missing test belongs (test-layer placement only — no architecture change)

`01-requirements.md` §9 (gap F-1) and AC-10 call out that CORS-allow, CORS-reject, and
payload-too-large each already have a passing test in `backend/src/__tests__/app.hardening.test.ts`,
but rate-limiting (`429`) does not. This is purely a **test-coverage gap in the existing
verification layer**, not a missing or incorrect architectural component — §6.1 confirms the
middleware itself is correctly implemented and already exercised manually in the requirements
analysis. The fix belongs entirely within the existing test file/pattern, with no change to
`app.ts`, `routes/`, or `services/`:

- **File:** add to `backend/src/__tests__/app.hardening.test.ts` (keeps all three — soon four —
  hardening controls' tests co-located), under a new `describe("Rate limiting (resolves NFR-8(c) /
  AC-10)", ...)` block, following the existing pattern in that file (same `vi.mock(...)` setup for
  `taskService`/`syncHealthService`/`enqueueSync`, same `createApp()` + `supertest(app)` harness,
  same `beforeEach` setting `FRONTEND_ORIGIN`).
- **Test shape:** fire `RATE_LIMIT_MAX_REQUESTS` (100) requests against a mounted `/api` route
  (e.g. `GET /api/tasks`, already mocked to resolve instantly) within the `RATE_LIMIT_WINDOW_MS`
  (60s) window, then assert the next (101st) request returns `res.status === 429` and
  `res.body === { error: "rate_limited", message: "Too many requests. Please try again later." }`
  — i.e., assert against the exact literals already in `app.ts`'s `apiRateLimiter.handler`, not a
  re-derived string, so the test stays coupled to the real behavior rather than a paraphrase of it.
- **Scope boundary:** writing and running this test is Phase 5/Phase 7 work (code-implementation /
  verification-testing), not a Phase 2 architecture change — it is listed here only so Phase 3
  (design review) and Phase 4 (implementation planning) have an unambiguous, pre-confirmed
  placement and assertion contract to plan against, consistent with how `01-requirements.md` §9
  already frames it as "a future implementation pass."

## 7. Application Layer — Frontend (FR-9)

`frontend/src/` is a thin, typed consumer of the backend contract in §5 — it holds no business
logic beyond request/response shaping and UI state:

- `api/client.ts` — a single `apiRequest<T>()` wrapper: builds the URL from
  `VITE_API_BASE_URL` (name-only env var, NFR-1), serializes query params, and converts any
  non-2xx response into a typed `ApiError { status, code, message }` rather than throwing a raw
  `Response`/stack trace into the UI.
- `api/tasks.ts`, `api/syncHealth.ts` — typed endpoint callers built on `apiRequest`.
- `hooks/useTasks.ts`, `hooks/useSyncHealth.ts` — TanStack Query hooks (`useQuery`/`useMutation`)
  wrapping the API callers; mutations invalidate the `tasks` query key on success so the board
  reflects server state rather than an optimistic guess.
- `types/task.ts` — a manually-maintained mirror of the backend `Task`/`SyncLink`/`SyncHealth`
  shapes (§4, §5). The architecture intentionally does not specify a shared-types package; this
  duplicated contract boundary is an explicit, accepted trade-off, not an oversight — any future
  drift between `types/task.ts` and `validation.ts`/`schema.prisma` would surface as a type error
  at the `apiRequest<T>()` call sites, which is the acceptable detection point.
- `components/TaskBoard.tsx`, `TaskCard.tsx`, `TaskForm.tsx`, `SyncHealthPanel.tsx`,
  `SyncStatusBadge.tsx` — presentation components consuming the hooks above; none call `fetch`
  directly, keeping `api/client.ts` the single network boundary (so the hardening/error contract
  in §5/§6 has exactly one client-side enforcement point).

## 8. Governance / NFR Traceability

| Requirement | Architectural mechanism |
|---|---|
| NFR-1 — no hardcoded credential values | `GITHUB_TOKEN`, `GITHUB_REPO`, `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `JIRA_PROJECT_KEY`, `DATABASE_URL`, `QUEUE_URL`/Redis connection, and `VITE_API_BASE_URL` are read exclusively from `process.env` / `import.meta.env` (`.env`, git-ignored; `.env.example` lists names only). `SyncLink.lastError` / `SyncAttempt.detail` and all API error bodies carry only human-readable text, never a token/header value. |
| NFR-2 — git workflow | Work occurs on `feature/mdp-7-sdlc-pipeline`; Phase 8's pr-creator-agent is the only phase that opens a PR; `.claude/hooks/no-main-commit.sh` is mandatory before any commit (`.claude/rules/git.md`). |
| NFR-3 / NFR-4 — code quality & consistency | Business logic isolated into `taskService`/`syncHealthService`/`SyncProviderClient`, independent of Express routing and queue transport, each independently unit-testable (confirmed by the existing `*.test.ts` files). Centralized `validation.ts` + `errorHandler.ts` keep error shape and type safety uniform across every route; the same `{ error, message }` contract is what `frontend/src/api/client.ts`'s `ApiError` depends on. |
| NFR-5 — workflow integrity | `pipeline-state.json` transitions are written only by the orchestrator, atomically, via `.claude/lib/atomicWriteJson.ts` (temp-file + rename), only after an artifact is confirmed non-empty. |
| NFR-6 — auditability | Every phase leaves a durable Markdown artifact under `docs/MDP-7/`; every sync attempt leaves an immutable `SyncAttempt` row — both independent of chat/session history. |
| NFR-7 — human oversight | The Phase-3→4 gate (§3.3) cannot be bypassed by any agent; only an explicit human action records approval. |
| NFR-8 — API hardening | §6.1: CORS allowlist, bounded body size, rate limiting, all implemented in `app.ts`'s fixed middleware order; §6.3 confirms the one remaining item (rate-limit test coverage) is a test-layer task, not an architectural gap. |
| NFR-9 — credential hygiene | The project's mandatory pre-commit credential-scanning hook runs against staged files before any commit (per the project's credential-handling governance rule), independent of and in addition to the application-layer credential handling in the NFR-1 row above. |

## 9. Acceptance Criteria Traceability

| AC | Satisfied by |
|---|---|
| AC-1 | §3.1 phase-to-agent-to-artifact mapping |
| AC-2 | §3.2 state machine transition rules |
| AC-3 | §8 NFR-1 row; §4/§5 confirm no credential ever enters the data model or API payloads |
| AC-4 | §8 NFR-2 row |
| AC-5 | §3.4 Phase 7 verification gating |
| AC-6 | §3.4 Phase 8 PR summary contract |
| AC-7 | §5.1 — `clampLimit`/`clampOffset` never reject, always echo effective `limit`/`offset`/`total` |
| AC-8 | §4 ("why pending is derived") and §5.2 — sync-health scoped to `existingTaskIds`, excluding deleted tasks' stale rows |
| AC-9 | §6.2 — `pg_advisory_xact_lock(taskId, provider)` inside the worker's upsert transaction |
| AC-10 | §6.1 (controls implemented) + §6.3 (test placement for the one open item — rate-limit test, not yet written as of this document; tracked for Phase 5/7) |
| AC-11 | Out of this document's scope to execute — `npm test` / `npm run build` cleanliness is verified in Phase 7 (`07-verification-report.md`); this document's role is only to ensure nothing in the contract above requires a change that would newly break either command |

## 10. Application Layer — Sync Pipeline Summary (FR-10)

1. A task mutation that creates, deletes, or changes a sync-relevant field (`status`, `priority`,
   `assignee`, `title`, `description` — `taskService.SYNC_RELEVANT_FIELDS`) commits to Postgres
   first.
2. On commit, `enqueueSyncForAllProviders` enqueues one job per **configured** provider (§2) onto
   that provider's BullMQ queue, carrying a `TaskSnapshot` captured at enqueue time — so a `close`
   job for an already-deleted task never needs to re-read a gone `Task` row.
3. Each provider's `Worker` (`workers.createProviderWorker`) pulls jobs from its own queue and runs
   `processSyncJob` (§6.2): **create** (no existing link) → `provider.createIssue`; **update**
   (existing link) → `provider.updateIssue`; **close** (task deleted) → `provider.closeIssue` if a
   link exists — the external item is transitioned/closed, never hard-deleted.
4. The job result is written as an immutable `SyncAttempt` row, and `SyncLink` is upserted with
   `lastStatus`/`lastError`/`lastSyncedAt`, inside the same lock-guarded transaction — this happens
   regardless of whether the owning `Task` row still exists.
5. On failure, BullMQ's own bounded retry/backoff policy reschedules the job; once attempts are
   exhausted, the terminal `failed` state is already recorded and visible via `/api/sync-health` —
   never silently dropped.

## 11. Configuration Surface (names only — no values; ties NFR-1)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Prisma, `backend/src/db.ts`) |
| `FRONTEND_ORIGIN` | Single allowed CORS origin (NFR-8(a)) |
| `GITHUB_TOKEN`, `GITHUB_REPO` | GitHub provider adapter auth/target; absence → GitHub sync skipped at enqueue time, worker not started, never a crash |
| `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `JIRA_PROJECT_KEY` | Jira provider adapter auth/target; same absence behavior as GitHub |
| `QUEUE_CONCURRENCY` | Per-provider worker concurrency (default `1`); safe at any value per §6.2 |
| Redis connection (`backend/src/queue/connection.ts`) | BullMQ backing store |
| `VITE_API_BASE_URL` | Frontend's backend base URL (`frontend/src/api/client.ts`) |

All of the above are supplied via environment variables / a local, git-ignored `.env`; only
variable *names*, never values, appear in `.env.example` or this document.

## 12. Changelog vs. the Previous Run's Architecture Document

This revision is **not** a redesign; it is the same contract, re-grounded in the code that now
implements it, plus the additive sections the new FR-11/NFR-8/NFR-9/AC-7..AC-11 required:

- **§5 (Backend API table) corrected:** the previous document specified `GET /tasks` returning
  only `{ tasks: Task[] }` with no pagination fields. The actual, implemented, and now-documented
  contract is `{ tasks, total, limit, offset }` with server-side clamping (§5.1) — this already
  resolves the previous design-review's **B-2** finding and is the basis for AC-7.
- **§4 (Data model) confirmed, not changed:** `Task` indexes on `status`/`assignee`/`priority`
  (resolving **B-4**) and `SyncLink`'s `(provider, lastStatus)` index (resolving **B-1**) are
  present in `schema.prisma` exactly as the previous design review required.
- **§6 is new:** the previous document had no dedicated hardening/idempotency section — NFR-8 and
  FR-11 did not exist in that run's requirements. §6.1 documents the CORS/body-limit/rate-limit
  stack (resolving design-review findings **SEC-2**, **SEC-3**) as already implemented; §6.2
  documents the advisory-lock transaction (resolving **G-1**) as already implemented; §6.3 scopes
  the one remaining AC-10 gap (rate-limit test) to the test layer, explicitly keeping it out of
  this document's architectural surface.
- **§7 (Frontend) is new**, documenting the actual `frontend/src/` structure (API client, hooks,
  typed mirror, presentation components) that the previous run's document had only sketched at the
  "React Frontend" box level.
- **Worker concurrency (§6.2) confirmed explicit:** `QUEUE_CONCURRENCY` (default `1`) resolves the
  previous design-review's **B-3** note, and the advisory-lock design means raising it later is
  safe without a further architecture change.
- **No change** to the pipeline-layer design (§3), the core `Task`/`SyncLink`/`SyncAttempt` shapes
  (§4), or the governance mechanisms (§8) — these were re-verified against source and found
  unchanged.

## 13. Open Design Questions

None blocking. AC-10's rate-limit test (§6.3) is an explicitly tracked, non-architectural gap for
Phase 5/7 to close, not an open design question for this document. The two implementation-time
choices the previous document deferred (exact queue/broker technology; precise
Task-field-to-issue-field mapping per provider) are resolved in the current code (BullMQ/Redis;
mapping constrained to `TaskSnapshot`) and require no further architectural decision.
