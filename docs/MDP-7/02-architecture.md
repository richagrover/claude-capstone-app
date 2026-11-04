# Phase 02 — Architecture Design

**Story Key:** MDP-7
**Phase:** 2 — Architecture Design
**Source:** `docs/MDP-7/01-requirements.md`
**Status:** Draft — awaiting the human-in-the-loop checkpoint after Phase 3 (design review) before implementation (FR-6, NFR-7)

This document designs both deliverables named in the requirements: (A) the **Agentic SDLC
pipeline** itself (the `.claude/` automation layer, FR-1..FR-8) and (B) the **Task Manager
Application** (backend + frontend, FR-9, FR-10) it produces. Every design decision below is
traced to the FR/NFR/AC it satisfies. `backend/` and `frontend/` source trees are intentionally
absent at this stage (removed for the clean restart per the requirements' Dependencies &
Assumptions) — this document fixes their contracts so Phases 4–5 can recreate them without
re-deriving architecture.

## 1. System Overview

Two coupled subsystems, built to the same constraints:

| Subsystem | Responsibility | Primary requirements |
|---|---|---|
| **Pipeline layer** (`.claude/agents`, `.claude/skills`, `.claude/hooks`, `docs/MDP-7/pipeline-state.json`) | Drives the 8-phase SDLC lifecycle for this story, persists state, enforces the human checkpoint | FR-1..FR-8, NFR-5, NFR-6, NFR-7 |
| **Application layer** (`backend/`, `frontend/`) | Task CRUD + external sync-health reporting | FR-9, FR-10 |

Both subsystems share the same governance constraints: no hardcoded secrets (NFR-1), feature-branch-only git workflow (NFR-2), clean/tested code (NFR-3), and consistent formatting/typing/error-handling (NFR-4).

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


                           APPLICATION LAYER (FR-9, FR-10)
┌──────────────────┐   REST/JSON over HTTP   ┌───────────────────────┐
│  React Frontend   │ ───────────────────────▶│  Backend API          │
│  (task board,     │◀─────────────────────── │  (Express + TS)       │
│   sync-health view)│   JSON / structured     │  routes → services    │
└──────────────────┘   4xx/5xx errors         └──────────┬────────────┘
                                                            │
                                      ┌─────────────────────┼──────────────────────┐
                                      │ Prisma ORM          │ enqueue sync job      │
                                      ▼                     ▼                       │
                             ┌─────────────────┐  ┌──────────────────────┐         │
                             │  PostgreSQL      │  │  Job Queue            │         │
                             │  tasks,          │  │  per-provider lanes   │         │
                             │  sync_links,     │  │  (sync-github,        │         │
                             │  sync_attempts   │  │   sync-jira)          │         │
                             └─────────────────┘  └──────────┬────────────┘         │
                                      ▲                      │ write result         │
                                      │                      ▼                      │
                                      │              ┌───────────────┐              │
                                      └──────────────│  Sync Worker  │◀─────────────┘
                                                      └───────┬───────┘
                                                              │ via SyncProviderClient
                                              ┌───────────────┴────────────────┐
                                              ▼                                 ▼
                                    ┌───────────────────┐           ┌────────────────────┐
                                    │  GitHubProvider     │           │  JiraProvider        │
                                    │  (env: GITHUB_TOKEN)│           │  (env: JIRA_*_TOKEN) │
                                    └─────────┬──────────┘           └──────────┬──────────┘
                                              ▼                                 ▼
                                      GitHub REST API                    Jira REST API
```

Key interaction properties:

- **Frontend never calls GitHub/Jira directly.** All sync traffic is centralized through the
  backend so retries, auth, and logging live in one place (FR-10, NFR-1).
- **Task CRUD is synchronous; sync is asynchronous.** `POST`/`PATCH`/`DELETE` on `/api/tasks`
  commits to Postgres and returns immediately; any sync job is enqueued but never awaited by the
  request handler (FR-9, FR-10).
- **One queue per provider** so a Jira outage cannot block GitHub sync, and vice versa.
- **Provider adapters implement one shared interface** (`SyncProviderClient`) so worker code
  never depends on a concrete provider SDK — swapping/adding a provider does not change the
  queue, worker, or API contract.
- **Credentials flow only into the provider-adapter layer**, read once from environment
  variables at process start; no other layer (routes, services, queue, frontend, pipeline agents)
  ever sees a raw token (NFR-1).
- **The pipeline orchestrator never implements application code itself** — it only sequences
  agents and persists phase state; application logic is produced solely by the
  `implementation-agent` in Phase 5, against the contract fixed in this document.

## 3. Pipeline Layer Design (FR-1..FR-8, NFR-5, NFR-6, NFR-7)

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
`.claude/agents/`) — no agent reads another phase's working context directly; each reads only
the prior phase's committed artifact file, which is what makes the artifacts authoritative and
auditable (NFR-6).

### 3.2 State machine (FR-4, FR-5, NFR-5)

`docs/MDP-7/pipeline-state.json` is the single source of truth for pipeline progress:

```json
{
  "pipelineId": "MDP-7",
  "currentPhase": <int>,
  "status": "in-progress" | "completed" | "blocked",
  "phases": [
    { "id": <int>, "name": "<phase-name>", "agent": "<agent-id>",
      "artifact": "docs/MDP-7/0N-*.md",
      "status": "pending" | "in-progress" | "completed",
      "startedAt": "<ISO-8601>" | null, "completedAt": "<ISO-8601>" | null }
  ],
  "humanCheckpoints": [
    { "afterPhase": 3, "label": "Design approval before implementation begins",
      "status": "awaiting-response" | "approved" | "changes-requested" }
  ],
  "lastUpdated": "<ISO-8601>"
}
```

Transition rules:

- Each phase strictly follows `pending → in-progress → completed`; no phase may be marked
  `completed` before its artifact file exists and is non-empty (FR-4, AC-2).
- **The orchestrator — not the phase agent — writes the state transition.** A phase agent's
  sole job is to produce its artifact; it reports completion back to the orchestrator, which
  then updates `pipeline-state.json`. This separation means an artifact-write failure never
  produces a false `completed` state (NFR-5).
- Phases execute strictly in order (FR-5); the orchestrator refuses to start phase *N+1* while
  phase *N* is not `completed`.
- If the pipeline is interrupted mid-phase, `pipeline-state.json` reflects the last fully
  `completed` phase, never a partially-written one — resumption restarts the interrupted phase
  rather than assuming partial progress (edge case: pipeline interruption mid-phase).

### 3.3 Human-in-the-loop checkpoint (FR-6, NFR-7)

- Gate location: immediately after Phase 3 (design-review) commits `03-design-review.md`.
- Mechanism: `humanCheckpoints[0].status` starts at `"awaiting-response"`; the orchestrator
  MUST NOT invoke `implementation-planner-agent` (Phase 4) while that status is
  `awaiting-response`.
- No agent — including the design-review-agent itself — may set this status to `"approved"`.
  Only an explicit human action (reviewed outside the agent loop) flips it.
- On rejection (`"changes-requested"`), the orchestrator routes back to the architecture-agent
  (Phase 2) to revise this document and resubmits a fresh `03-design-review.md`, rather than
  silently advancing (edge case: human checkpoint rejection after Phase 3).

### 3.4 Verification and PR phases (FR-7, FR-8, AC-5, AC-6)

- Phase 7 (verification-agent) runs the automated unit/integration suites created in Phase 5
  and writes pass/fail results, coverage notes, and acceptance-criteria traceability to
  `docs/MDP-7/07-verification-report.md`. A failing suite blocks Phase 8 from starting.
- Phase 8 (pr-creator-agent) authenticates to the git remote using a token read from the
  environment (e.g. `GITHUB_TOKEN`) at run time — never a value hardcoded in `.claude/agents/`
  or any pipeline script (NFR-1) — and writes a structured title/description/test-plan summary
  to `docs/MDP-7/08-pr-summary.md`, opened from a feature branch per NFR-2.

## 4. Application Layer — Data Model (FR-9, FR-10)

### Enums

| Enum | Values |
|---|---|
| `TaskStatus` | `Backlog` (default), `InProgress`, `InReview`, `Done` |
| `TaskPriority` | `Low`, `Medium` (default), `High` |
| `SyncProvider` | `github`, `jira` |
| `SyncResult` | `ok`, `failed` |

Enum values are validated at the API boundary; an invalid value is rejected with a `400` and a
structured error body — never silently coerced to a default (NFR-3, NFR-4).

### `Task`

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | primary key |
| `title` | string | required, non-empty after trim |
| `description` | string, nullable | optional |
| `status` | `TaskStatus` | default `Backlog` |
| `priority` | `TaskPriority` | default `Medium` |
| `assignee` | string, nullable | optional |
| `dueDate` | datetime, nullable | optional |
| `labels` | string[] | default `[]` |
| `createdAt` | datetime | set on create |
| `updatedAt` | datetime | set on every write; deterministic last-write-wins tiebreaker for concurrent `PATCH` requests |

### `SyncLink` (current sync state, one row per task/provider pair)

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | primary key |
| `taskId` | string (UUID) | intentionally **not** an enforced FK to `Task` (see rationale) |
| `provider` | `SyncProvider` | |
| `externalKeyOrUrl` | string, nullable | linked GitHub issue URL / Jira issue key, once known |
| `lastSyncedAt` | datetime, nullable | timestamp of the most recent attempt |
| `lastStatus` | `SyncResult`, nullable | `null` until the first attempt resolves → read as "pending" |
| `lastError` | string, nullable | human-readable failure reason only — never a credential value (NFR-1) |
| unique constraint | `(taskId, provider)` | one current-state row per task/provider |

### `SyncAttempt` (append-only audit trail)

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | primary key |
| `taskId` | string (UUID) | intentionally **not** an enforced FK to `Task` |
| `provider` | `SyncProvider` | |
| `timestamp` | datetime | default now |
| `result` | `SyncResult` | |
| `detail` | string, nullable | success detail (external key/url) or failure reason — never a credential (NFR-1) |
| index | `(taskId)` | fast lookup of a task's sync history |

**Why `taskId` is a plain column, not an enforced FK, on `SyncLink`/`SyncAttempt`:** deleting a
task should still close its linked external issue (delete-closes-linked-issue), and that close
job's result must be writable to `SyncLink`/`SyncAttempt` *after* the `Task` row is gone. A
restrictive FK would reject that write; `ON DELETE CASCADE` would erase the audit trail the
moment the task is deleted, undermining the sync-health accounting in FR-10 and the
auditability intent of NFR-6. An unenforced reference lets the close result land correctly in
both tables without either failure mode.

**Why "pending" is derived, not stored:** a task with no `SyncLink` row yet for a given provider
(never synced) and a task whose only `SyncLink` has `lastStatus = null` (job enqueued, no result
yet) are both "pending." The sync-health service computes this at read time as
`expected (existing tasks × configured providers) − rows with a non-null lastStatus`, scoped to
currently-existing tasks, so a deleted task's historical (already-terminal) `SyncLink` row never
skews the pending count for tasks that still exist.

## 5. Application Layer — Backend API (FR-9, FR-10)

Base path: `/api`. All responses are JSON; every error response uses a structured body
`{ "error": "<machine_code>", "message": "<human text>" }` and never includes a stack trace
(NFR-3, NFR-4).

| Method | Path | Request | Success | Errors |
|---|---|---|---|---|
| `GET` | `/tasks` | query params `status`, `assignee`, `priority` (combinable, optional) | `200` `{ tasks: Task[] }` (empty array if no match) | `400` invalid enum filter value |
| `POST` | `/tasks` | Task fields; `status`/`priority` optional (defaulted) | `201` created `Task` | `400` structured validation error (missing/empty title, invalid enum) |
| `GET` | `/tasks/:id` | — | `200` `Task` + `syncLinks[]` summary (§5.1) | `404` unknown id; `400` malformed id |
| `PATCH` | `/tasks/:id` | partial Task body | `200` updated `Task` | `404` unknown id; `400` invalid partial body/enum or malformed id |
| `DELETE` | `/tasks/:id` | — | `204` no content | `404` unknown id; `400` malformed id; idempotent on repeat delete |
| `GET` | `/sync-health` | optional `provider` filter | `200` `{ counts: { synced, pending, failed }, byProvider: { github: {...}, jira: {...} }, failing: [...] }` | — |

### 5.1 Sync-related response shape

- `GET /tasks` list items include a lightweight `syncStatus[]`: `{ provider, status }[]` so a
  board/list view can render per-provider badges without N extra requests.
- `GET /tasks/:id` includes the full `syncLinks[]` (`externalKeyOrUrl`, `lastSyncedAt`,
  `lastStatus`, `lastError`) for the detail view.
- Both are read-time projections of `SyncLink` — no duplicated stored state.

### 5.2 Validation rules enforced at the API boundary (NFR-3, NFR-4)

- `title`: required; rejected if empty or whitespace-only.
- `status`, `priority`: must be one of the enum values in §4; unknown values rejected, never
  coerced.
- `:id` path params: validated as well-formed (e.g. UUID shape) before reaching the database —
  malformed ids short-circuit to `400` rather than surfacing a `500`.
- Any uncaught error is converted by centralized error-handling middleware into the structured
  4xx/5xx body above; no stack trace or internal detail reaches the client.

## 6. Application Layer — Sync Pipeline (FR-10)

1. A task mutation that affects a mapped field (create, delete, or an update to a sync-relevant
   field such as `status`/`priority`/`assignee`) commits to Postgres first.
2. On commit, the service layer enqueues one job per configured provider onto that provider's
   queue (`sync-github`, `sync-jira`) — never awaited by the HTTP request. The job payload
   carries a snapshot of the task's mapped fields captured at enqueue time, so a `close` job for
   a just-deleted task does not need to re-read a `Task` row that may already be gone.
3. Each provider's worker pulls jobs from its own queue and calls the matching
   `SyncProviderClient` adapter:
   - **create** — no existing `SyncLink.externalKeyOrUrl` for that provider → create the
     external issue, store the returned key/url.
   - **update** — existing link → update the issue's mapped fields.
   - **close** (task deleted) — existing link → transition/close the external issue; the
     external item is never hard-deleted.
4. The job result (success or failure) is written as an immutable `SyncAttempt` row, and
   `SyncLink` is upserted with `lastStatus`/`lastError`/`lastSyncedAt` — this write happens
   regardless of whether the owning `Task` row still exists.
5. On failure, the queue applies a bounded retry policy with exponential backoff (fixed attempt
   cap) rather than a tight retry loop, so a provider outage cannot exhaust its own rate limits.
   Once attempts are exhausted, the terminal `failed` state is already recorded and visible via
   `/api/sync-health` — never silently dropped (per the requirement that sync failures surface
   via sync-health rather than failing silently or blocking unrelated task operations).
6. **Partial provider configuration:** at worker start, each provider adapter checks whether its
   required env vars are present. If a provider's credentials are absent, that provider's
   queue/worker does not start (or immediately short-circuits jobs to a `pending`/"unavailable"
   outcome) and never crashes the process; the other, fully-configured provider continues to
   sync normally.

## 7. Governance / NFR Traceability

| Requirement | Architectural mechanism |
|---|---|
| NFR-1 — no hardcoded secrets | `GITHUB_TOKEN`, `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `DATABASE_URL`, and the queue/broker connection string are read exclusively from process environment variables at startup (via a git-ignored `.env`, with `.env.example` listing only variable *names*). No source file, fixture, pipeline script, or committed artifact contains a literal credential value. Error bodies, `SyncLink.lastError`, and `SyncAttempt.detail` carry only human-readable failure reasons, never a token/header value. |
| NFR-2 — git workflow | All phases, including this one, operate on the feature branch (`feature/mdp-7-sdlc-pipeline`); Phase 8's pr-creator-agent is the only phase that opens a PR, using conventional commit prefixes and never committing directly to `main`/`master`. |
| NFR-3 / NFR-4 — code quality & consistency | Backend business logic is isolated into a service layer (`taskService`, `syncHealthService`) and a provider-interface layer (`SyncProviderClient`), independent of Express routing and queue transport, so each is unit-testable with the database/queue/providers mocked. Centralized validation and error-handling middleware (§5.2) keeps error shape and type safety consistent across all routes; the same validation contract is what the frontend forms rely on. |
| NFR-5 — workflow integrity | `pipeline-state.json` transitions are written only by the orchestrator, only after an artifact is confirmed written and non-empty (§3.2) — never by a phase agent asserting its own completion. |
| NFR-6 — auditability | Every phase leaves a durable Markdown artifact under `docs/MDP-7/`, and every sync attempt leaves an immutable `SyncAttempt` row — both independent of chat/session history. |
| NFR-7 — human oversight | The Phase-3→4 gate (§3.3) cannot be bypassed by any agent; only an explicit human action records approval. |

## 8. Acceptance Criteria Traceability

| AC | Satisfied by |
|---|---|
| AC-1 | §3.1 phase-to-agent-to-artifact mapping |
| AC-2 | §3.2 state machine transition rules |
| AC-3 | §7 NFR-1 row; §4/§5 note no credential ever enters data model or API payloads |
| AC-4 | §7 NFR-2 row |
| AC-5 | §3.4 Phase 7 verification gating |
| AC-6 | §3.4 Phase 8 PR summary contract |

## 9. Configuration Surface (names only — no values; ties NFR-1)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `GITHUB_TOKEN` | GitHub provider adapter auth; absence → GitHub sync reports unavailable/pending, never a crash |
| `JIRA_API_TOKEN`, `JIRA_BASE_URL` | Jira provider adapter auth; absence → Jira sync reports unavailable/pending, never a crash |
| `QUEUE_URL` | Job queue backing store connection (e.g. Redis) |
| `GITHUB_REPO`, `JIRA_PROJECT_KEY` | Fixed target repo/project for synced issues (values decided at implementation time — never fabricated here) |

All of the above are supplied via environment variables / a local, git-ignored `.env`; only
variable *names*, never values, appear in `.env.example` or this document.

## 10. Open Design Questions

None blocking. Two decisions are deferred to implementation time without affecting the contract
fixed here: (1) the exact queue/broker technology (any implementation satisfying "per-provider
queue + bounded retry with backoff" is conformant), and (2) the precise Task-field-to-issue-field
mapping per provider (constrained to the shared `SyncProviderClient` interface and the
`SyncLink`/`SyncAttempt` shapes above). Both are implementation-time choices within this
document's contract, not architectural gaps.
