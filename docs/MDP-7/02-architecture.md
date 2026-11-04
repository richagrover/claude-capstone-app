# MDP-7: System Architecture

**Phase:** 02 - Architecture Design
**Source:** `docs/MDP-7/01-requirements.md`
**Status:** Draft — awaiting human-in-the-loop design sign-off (NFR-1.2, human checkpoint after phase 3)

This document designs the Task Manager system to satisfy FR-1..FR-5, the governance
requirements AC-1..AC-6 / NFR-1..NFR-5, dependencies D-1..D-6, and the edge cases EC-1..EC-13
from `01-requirements.md`. It reuses the shape of a prior Express/Prisma/BullMQ implementation
found in this repository's git history as a precedent for a sound design in this stack (not a
restored implementation — no code is copied).

## 1. Component Interaction Diagram

```
┌─────────────────┐        REST (JSON over HTTP)        ┌──────────────────────┐
│  React Frontend  │ ───────────────────────────────────▶│   Backend API        │
│  (task list/filter│                                     │   (Express + TS)     │
│   forms, sync-    │◀─────────────────────────────────── │                      │
│   health view)    │        JSON responses / 4xx errors  │  Routes → Services   │
└──────────────────┘                                      └──────────┬───────────┘
                                                                      │
                                                     ┌────────────────┼─────────────────┐
                                                     │ Prisma ORM     │ Enqueue sync job │
                                                     ▼                ▼                  │
                                            ┌─────────────────┐  ┌───────────────────┐   │
                                            │  PostgreSQL     │  │  Job Queue         │   │
                                            │  (tasks,        │  │  (per-provider     │   │
                                            │   sync_links,   │  │   queues: Redis/   │   │
                                            │   sync_attempts)│  │   BullMQ or equiv.)│   │
                                            └─────────────────┘  └─────────┬──────────┘   │
                                                     ▲                     │              │
                                                     │ write result        ▼              │
                                                     │             ┌───────────────┐      │
                                                     └─────────────│  Sync Worker   │◀─────┘
                                                                   │  process       │
                                                                   └───────┬────────┘
                                                                           │ via SyncProviderClient interface
                                                           ┌───────────────┴────────────────┐
                                                           ▼                                 ▼
                                                 ┌───────────────────┐           ┌────────────────────┐
                                                 │  GitHubProvider    │           │  JiraProvider       │
                                                 │  adapter           │           │  adapter            │
                                                 │  (GITHUB_TOKEN)    │           │  (JIRA_API_TOKEN)   │
                                                 └─────────┬──────────┘           └──────────┬──────────┘
                                                           ▼                                 ▼
                                                   GitHub REST API                    Jira REST API
```

Key interaction properties, each tied to a requirement:

- **Frontend never talks to GitHub/Jira directly.** All sync traffic is centralized through the
  backend so retries, auth, and logging are in one place (FR-4.4, NFR-2.3).
- **Task CRUD is synchronous; sync is asynchronous.** A `POST`/`PATCH`/`DELETE` on `/api/tasks`
  commits to Postgres and returns immediately; any sync job is enqueued but never awaited by the
  request handler (FR-4.2, NFR-5.2, D-5).
- **One queue per provider.** GitHub and Jira each get an independent queue/worker lane so a
  Jira outage cannot block GitHub sync, and vice versa (EC-9, NFR-5.1).
- **Provider adapters implement one shared interface** (`SyncProviderClient`), so the worker code
  and task-level logic never depend on a concrete provider SDK (FR-4.4, D-5).
- **Credentials flow only into the provider adapter layer** via environment variables, read once
  at process start; no other layer (routes, services, queue, frontend) ever sees a raw token
  (NFR-2.1, NFR-2.2, D-3).

## 2. Data Model

### Enums

| Enum | Values |
|---|---|
| `TaskStatus` | `Backlog` (default), `InProgress`, `InReview`, `Done` |
| `TaskPriority` | `Low`, `Medium` (default), `High` |
| `SyncProvider` | `github`, `jira` |
| `SyncResult` | `ok`, `failed` |

Enum values are validated at the API boundary (request schema validation); an invalid enum
value is rejected with a 4xx and a structured error body rather than silently coerced (FR-2.1,
EC-2) — never stored, logged, or passed further into the system.

### `Task`

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | primary key |
| `title` | string | required, non-empty after trim (EC-1) |
| `description` | string, nullable | optional |
| `status` | `TaskStatus` | default `Backlog` (FR-1.2) |
| `priority` | `TaskPriority` | default `Medium` (FR-1.2) |
| `assignee` | string, nullable | optional |
| `dueDate` | datetime, nullable | optional |
| `labels` | string[] | default `[]` |
| `createdAt` | datetime | set on create |
| `updatedAt` | datetime | set on every write; used as the deterministic last-write-wins tiebreaker for concurrent PATCH requests (EC-5) |

### `SyncLink` (current sync state, one row per task/provider pair)

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | primary key |
| `taskId` | string (UUID) | **not** a foreign key to `Task` (see rationale below) |
| `provider` | `SyncProvider` | |
| `externalKeyOrUrl` | string, nullable | the linked GitHub issue URL / Jira issue key, once known |
| `lastSyncedAt` | datetime, nullable | timestamp of the most recent attempt |
| `lastStatus` | `SyncResult`, nullable | `null` until the first attempt resolves ⇒ "pending" |
| `lastError` | string, nullable | human-readable failure reason only — never a credential value (NFR-2.3, FR-4.3) |
| unique constraint | `(taskId, provider)` | one current-state row per task/provider |

### `SyncAttempt` (append-only audit trail)

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | primary key |
| `taskId` | string (UUID) | **not** a foreign key to `Task` |
| `provider` | `SyncProvider` | |
| `timestamp` | datetime | default now |
| `result` | `SyncResult` | |
| `detail` | string, nullable | success detail (external key/url) or failure reason — never a credential (NFR-2.3) |
| index | `(taskId)` | fast lookup of a task's sync history |

**Why `taskId` is a plain column, not an FK/relation, on `SyncLink`/`SyncAttempt`:** EC-6
requires a defined, testable answer for "task deleted while it has sync links" — the chosen
flow is *delete-closes-linked-issue* (on task delete, enqueue a `close` sync job per existing
`SyncLink`, which calls the provider's close/transition operation and then upserts the result).
That close job's result must still be written to `SyncLink`/`SyncAttempt` **after** the `Task`
row is already gone. A restrictive FK would reject that write; `ON DELETE CASCADE` would erase
the audit trail the moment the task is deleted, which breaks sync-health accounting and the
auditability intent of FR-4.3. An unenforced reference lets the close result land correctly in
both tables.

**Why "pending" is derived, not stored (FR-5.3, EC-8):** a task with no `SyncLink` row for a
given provider yet (never synced) and a task whose only `SyncLink` has `lastStatus = null`
(job enqueued, no result yet) are both "pending" — computed at read time in the sync-health
service as `expected (existing tasks × configured providers) − rows with a non-null lastStatus`,
scoped to currently-existing tasks only, so a deleted task's historical `SyncLink` row (which
already has a terminal `ok`/`failed` status from its close job) never skews the pending count
for tasks that still exist.

## 3. Backend API Endpoints

Base path: `/api`. All responses are JSON; all error responses use a structured body
`{ "error": "<machine_code>", "message": "<human text>" }` and never include a stack trace
(FR-2.1, NFR-4.2).

| Method | Path | Request | Success | Errors | Requirement |
|---|---|---|---|---|---|
| `GET` | `/tasks` | query params `status`, `assignee`, `priority` (combinable, optional) | `200` `{ tasks: Task[] }` (empty array if no match) | `400` on an invalid enum filter value | FR-2.2, EC-4 |
| `POST` | `/tasks` | Task fields; `status`/`priority` optional (defaulted) | `201` created `Task` | `400` structured validation error (missing/empty title, invalid enum) | FR-2.1, EC-1, EC-2 |
| `GET` | `/tasks/:id` | — | `200` `Task` (+ `syncLinks[]` summary, see §3.1) | `404` unknown id; `400` malformed id | FR-2.3, EC-3 |
| `PATCH` | `/tasks/:id` | partial Task body | `200` updated `Task` | `404` unknown id; `400` invalid partial body/enum; `400` malformed id | FR-2.4, EC-2, EC-3, EC-5 |
| `DELETE` | `/tasks/:id` | — | `204` no content | `404` unknown id; `400` malformed id; **idempotent** — a repeat delete of an already-deleted id still returns success semantics per the agreed delete contract, not a crash | FR-2.5, EC-3 |
| `GET` | `/sync-health` | optional `provider` filter | `200` `{ counts: { synced, pending, failed }, byProvider: { github: {...}, jira: {...} }, failing: [...] }` | — | FR-5.1, FR-5.3, EC-8, EC-9 |

### 3.1 Sync-related response shape

- `GET /tasks` list items include a lightweight `syncStatus[]`: `{ provider, status }[]` so the
  list/board view can render per-provider badges without N extra requests (FR-3.1, FR-5.2).
- `GET /tasks/:id` includes the full `syncLinks[]` (externalKeyOrUrl, lastSyncedAt, lastStatus,
  lastError) for the detail view (FR-4.3).
- Both are read-time projections of `SyncLink` — no duplicate stored state.

### 3.2 Validation rules enforced at the API boundary (ties EC-1, EC-2, EC-3, FR-2.1)

- `title`: required, rejected if empty or whitespace-only.
- `status`, `priority`: must be one of the enum values above; unknown values rejected, never
  coerced to a default.
- `:id` path params: validated as a well-formed id (e.g. UUID shape) before hitting the
  database — malformed ids short-circuit to `400` rather than reaching a query that could
  surface a `500`.
- Any uncaught error is converted by a centralized error-handling middleware into the structured
  4xx/5xx body described above; no stack trace or internal detail reaches the client (NFR-4.2).

## 4. Sync Pipeline (end-to-end)

1. A task mutation that affects a mapped field (create, delete, or an update to a
   sync-relevant field such as `status`/`priority`/`assignee`) commits to Postgres first.
2. On commit, the service layer enqueues one job per configured provider onto that provider's
   queue (`sync-github`, `sync-jira`) — never awaited by the HTTP request (FR-4.2, NFR-5.2).
   The job payload carries a snapshot of the task's mapped fields captured at enqueue time, so a
   `close` job for a just-deleted task does not need to re-read a `Task` row that may already be
   gone.
3. Each provider's worker pulls jobs from its own queue and calls the matching
   `SyncProviderClient` adapter:
   - **create** — no existing `SyncLink.externalKeyOrUrl` for that provider ⇒ create the external
     issue, store the returned key/url.
   - **update** — existing link ⇒ update the issue's mapped fields.
   - **close** (task deleted) — existing link ⇒ transition/close the external issue; the
     external item is never deleted (EC-6).
4. The job result (success or failure) is written as an immutable `SyncAttempt` row, and
   `SyncLink` is upserted with `lastStatus`/`lastError`/`lastSyncedAt` — this write happens
   regardless of whether the owning `Task` row still exists (see §2 rationale).
5. On failure, the queue applies a bounded retry policy with exponential backoff (fixed attempt
   cap) rather than a tight retry loop, so a provider outage cannot exhaust its own rate limits
   (EC-7, NFR-5.1). Once attempts are exhausted, the terminal `failed` state is already recorded
   and visible via `/api/sync-health` — it is never silently dropped.
6. **Partial provider configuration (EC-9, D-3):** at worker start, each provider adapter checks
   whether its required env vars are present. If a provider's credentials are absent, that
   provider's queue/worker is not started (or immediately short-circuits jobs to a `pending`/
   "unavailable" outcome rather than attempting a doomed call) and never crashes the process;
   the other, fully-configured provider continues to sync normally.

## 5. Governance / NFR Traceability

| Requirement | Architectural mechanism |
|---|---|
| NFR-2.1 / NFR-2.2 / AC-3 — no hardcoded secrets | `GITHUB_TOKEN`, `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `DATABASE_URL`, and the queue/broker connection string are read exclusively from process environment variables at startup (via an `.env` file excluded from version control, with `.env.example` listing only variable *names*). No source file, fixture, or committed artifact contains a literal credential value. |
| NFR-2.3 — no credential leakage | `SyncLink.lastError` / `SyncAttempt.detail` and all API error bodies carry only human-readable failure reasons (e.g. `"401 Unauthorized"`, `"rate limited"`), never the token/header value that produced them; provider adapters are the only layer that ever holds a raw token in memory, and it is never interpolated into a log line, error object, or response body. |
| NFR-5.1 / NFR-5.2 / D-5 — reliable, decoupled sync | Sync runs on a queue/worker separate from the request/response cycle (§4); a provider failure is caught, recorded, and retried with bounded backoff — it cannot corrupt `Task` rows or crash the API process (EC-7). |
| D-4 — durable persistence | PostgreSQL via Prisma is the system of record for `Task`, `SyncLink`, and `SyncAttempt`; all three survive process restarts. |
| D-6 / AC-6 — PR tooling auth | The PR-creation phase (phase 8) authenticates to the git remote using a token read from the environment (e.g. `GITHUB_TOKEN`) at run time, never a hardcoded credential in `.claude/agents/` or pipeline scripts. |
| AC-1 / AC-2 / D-2 — pipeline-state touchpoints | This architecture phase, once its artifact (`docs/MDP-7/02-architecture.md`) is written, is recorded as a state transition in `docs/MDP-7/pipeline-state.json` (phase id 2, `architecture-design`) by the orchestrator — this document does not self-report phase completion; that is the orchestrator's responsibility after reviewing this artifact. The same pattern (artifact write → orchestrator-recorded state transition) applies to every later phase, so each of the 8 phases maps 1:1 to both a `docs/MDP-7/0N-*.md` artifact and a `pipeline-state.json` entry. |
| NFR-1.2 — human-in-the-loop checkpoint | Per `pipeline-state.json`, a human checkpoint is gated after phase 3 (design review) — this architecture must not be treated as implementation-ready until that checkpoint records an approval; phase 4 (implementation planning) must not silently begin before it. |
| NFR-4.1 / NFR-4.3 / AC-5 — testability | Business logic is isolated into a service layer (`taskService`, `syncHealthService`) and a provider-interface layer (`SyncProviderClient`), independent of the Express routing and the queue transport, so each can be unit-tested with the database/queue/providers mocked or swapped for in-memory/test doubles; route-level integration tests exercise the HTTP contract in §3 end-to-end. Test results are written to `docs/MDP-7/07-verification-report.md` in phase 7, after this architecture and its implementation exist. |
| EC-10 / EC-13 | Because artifact-write and state-transition are two separate, ordered steps (see AC-1/AC-2 row above), a failure partway through generating this (or any later) artifact leaves `pipeline-state.json` at its prior "pending"/"in-progress" value rather than a false "completed" — the orchestrator only advances `pipeline-state.json` after confirming the artifact file is written and non-empty. |

## 6. Configuration Surface (names only — no values; ties NFR-2.1/NFR-2.2)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `GITHUB_TOKEN` | GitHub provider adapter auth; absence ⇒ GitHub sync reports unavailable/pending, never a crash (EC-9, D-3) |
| `JIRA_API_TOKEN`, `JIRA_BASE_URL` | Jira provider adapter auth; absence ⇒ Jira sync reports unavailable/pending, never a crash (EC-9, D-3) |
| `QUEUE_URL` / broker connection (e.g. Redis) | Job queue backing store (D-5) |
| `GITHUB_REPO`, `JIRA_PROJECT_KEY` | Fixed target repo/project for synced issues (values TBD at implementation time — never fabricated here) |

All of the above are supplied via environment variables / local `.env` (git-ignored); only
variable *names*, never values, appear in `.env.example` or this document.

## 7. Open Design Questions

None blocking. Provider-specific field-mapping details (which Task fields map to which
GitHub/Jira issue fields) and the exact queue/broker technology choice are implementation-time
decisions within the contract this document fixes (shared `SyncProviderClient` interface,
per-provider queues, append-only `SyncAttempt` audit trail) and do not change the API or data
model above.
