# Phase 03: Review Feedback & Approval Checklist (MDP-7)

**Reviews:** `phase-01-requirements.md`, `phase-02-architecture.md`,
`phase-04-implementation-manifest.md`
**Final status:** Approved (third pass) — T-1, T-2, T-3, T-6, T-8 implementation + tests approved for hand-off to pr-agent.

## Review Round 1 — Changes Requested

| # | Finding | Routed to | Resolution |
|---|---|---|---|
| 1 | `SyncAttempt.task_id`'s unenforced-reference fix (no FK, so audit writes survive a deleted `Task` row) was not mirrored onto `SyncLink.task_id`, despite the same post-delete upsert requirement in the sync pipeline's step 4. | architecture-agent | Applied the identical fix to `SyncLink.task_id` in `phase-02-architecture.md` (Data Model + Sync Pipeline step 4). |
| 2 | Test coverage wording (TC-18 / Gaps section) had gone stale relative to the architecture fix above — it referenced an "open architecture question" that was no longer open. | testing-agent | Updated wording to state the design question is resolved and the case is implementable, blocked only on config/no-implementation gates (see Test Coverage Checklist below). |

## Review Round 2 — Approved

Checked against `phase-01-requirements.md` and `phase-02-architecture.md`:

- [x] No scope drift — no two-way sync, no multi-tenancy, no features beyond
  requirements §3/§4.
- [x] No fabricated identifiers — `JIRA_PROJECT_KEY`, `GITHUB_REPO`, and the
  SSO provider remain explicitly TBD everywhere they're referenced.
- [x] Cross-references consistent across `phase-01`, `phase-02`,
  `phase-04`, and `jira_snapshot.json`.
- [x] Sync stays async; task requests never block on Jira/GitHub calls.
- [x] Failures surface (never silently dropped) — `SyncLink.last_status`,
  `/api/sync-health`.
- [x] Delete flow closes (never deletes) linked Jira/GitHub issues per
  requirements §3.2.
- [x] `SyncAttempt`/`SyncLink` audit writes are provably safe after a
  `Task` row is deleted (Round 1 fix, confirmed applied to both tables).
- [x] `phase-04-implementation-manifest.md` task statuses match reality —
  no task marked `ready` that depends on an unresolved config value.

## Test Coverage Checklist

Derived from `phase-01-requirements.md` §3/§4 and `phase-02-architecture.md`.
T-1, T-2, T-3, T-6, T-8 are implemented and in `in_review`
(`phase-04-implementation-manifest.md`) — the cases below for those tasks
have now actually been executed (not "planned"); results recorded per case.
T-4/T-5/T-9 remain `blocked_on_config`, so their cases stay blocked except
where noted.

### Test Setup

- **Backend:** `vitest` + `supertest`, added as dev dependencies
  (`backend/package.json` `"test": "vitest run"`, config in
  `backend/vitest.config.ts`). Tests live in `backend/src/__tests__/`.
  Neither a real Postgres (`DATABASE_URL`) nor Redis (`REDIS_URL`) is
  available in this environment, so routes/services are tested against
  `createApp()` (via `supertest`) and the worker's `processSyncJob` with
  `@prisma/client`'s call sites mocked at the `../db` module boundary
  (`vi.mock('../db', ...)`), and `enqueueSyncJob`/BullMQ mocked at
  `../queue/queues`. This is a pragmatic substitute for a real test DB, not
  a design decision — if/when a disposable test Postgres becomes available
  in CI, these can be upgraded to integration tests against it.
  `backend/tsconfig.json` now excludes `src/__tests__` so `vitest`/
  `supertest` don't end up in the production `dist/` build; `npm run build`
  and `npm run typecheck` were re-run clean after the change.
  One exception: `backend/src/__tests__/workers.failure.test.ts`
  deliberately does **not** mock the Jira/GitHub provider clients — it runs
  the real `jiraProvider`/`githubProvider` stub implementations (which
  today always return a failure, since `JIRA_PROJECT_KEY`/`GITHUB_REPO` are
  unset) to exercise the actual failure-surfacing code path end to end.
- **Frontend:** `vitest` + `@testing-library/react` + `@testing-library/
  jest-dom` + `@testing-library/user-event` + `jsdom`, added as dev
  dependencies (`frontend/package.json` `"test": "vitest run"`, config in
  `frontend/vitest.config.ts`). Tests live in `frontend/src/__tests__/`.
  `../api/client` is mocked per-test (`vi.mock('../api/client', ...)`) so
  component tests don't need a running backend. `frontend/src/__tests__/
  setup.ts` registers Testing Library's DOM cleanup via `afterEach` (the
  vitest config doesn't enable `globals: true`, so this has to be wired up
  explicitly — without it, DOM leaked across tests within a file).
- Both suites were executed with `npm test` in `backend/` and `frontend/`
  respectively. All totals below are from that run.

### Task CRUD (T-1, T-2)

| ID | Case | Expected | Result |
|---|---|---|---|
| TC-1 | Create task with all fields | Persisted; `GET /api/tasks/:id` returns it | **Pass** — `backend/src/__tests__/tasks.routes.test.ts` |
| TC-2 | Create task missing required field (title) | 400, no row created | **Pass** — `tasks.routes.test.ts` |
| TC-3 | Update task fields | Change saved; `updated_at` advances | **Pass** — `tasks.routes.test.ts` |
| TC-4 | Delete task | Task row removed (see TC-15/TC-16 for linked-issue behavior) | **Pass** — `tasks.routes.test.ts` |
| TC-5 | Status transition through full workflow (Backlog→In Progress→In Review→Done) | Each transition succeeds | **Pass** — `tasks.routes.test.ts` |
| TC-6 | Invalid status transition (if workflow is enforced) | Rejected | **Pass, but flags a design gap** — `tasks.routes.test.ts` confirms the *actual* behavior: a direct Backlog→Done jump currently succeeds (200). Neither `phase-01-requirements.md` §3.1 nor this doc's architecture section mandates sequential transition enforcement; this case has always been hedged ("if workflow is enforced"). Recorded as a resolved test (current behavior verified), but the underlying design question — should transitions be order-enforced? — is unresolved. Moved into Coverage Gaps below for architecture-agent/requirements-agent, not routed to dev-agent as a bug. |
| TC-7 | Filter list by status/assignee/priority | Only matching tasks returned | **Pass** — `tasks.routes.test.ts` (plus an extra case: invalid enum filter value → 400) |

### Sync — Jira (T-3, T-4)

| ID | Case | Expected | Result |
|---|---|---|---|
| TC-8 | Task create | Jira issue created in fixed `JIRA_PROJECT_KEY`; `SyncLink` row created with `ok` | **Blocked** (T-4, `JIRA_PROJECT_KEY` unset) — worker-level create mechanics (no-existing-link → `createIssue` called → `SyncLink` upserted with `ok`) covered generically with a mocked `SyncProviderClient` in `backend/src/__tests__/workers.success.test.ts`; the real-Jira-with-fixed-project-key portion is still blocked. |
| TC-9 | Update a mapped field (priority/status/assignee) | Jira issue updated to match; no translation applied | **Blocked** (T-4) — worker-level update mechanics (existing link → `updateIssue`, not `createIssue`) covered via mock in `workers.success.test.ts`; "no translation applied" and the real Jira call are still blocked. The taskService-level trigger (a mapped-field PATCH enqueues a job) is covered in `backend/src/__tests__/taskService.test.ts`. |
| TC-10 | Update an unmapped field (e.g. description) | No sync job enqueued | **Pass** — `taskService.test.ts` |
| TC-11 | Jira API returns error on create/update | Retried with backoff; after cap exhausted, `SyncLink.last_status = failed` with `last_error`, visible via `/api/sync-health` | **Partial — Pass on the failure-surfacing half** — `backend/src/__tests__/workers.failure.test.ts` runs the real (unmocked) `jiraProvider` stub, which fails every call today, and confirms: `SyncAttempt` written with `result: 'failed'`, `SyncLink.last_status = 'failed'` with `last_error` set, and `processSyncJob` re-throws (the mechanism BullMQ's `attempts`/`backoff` config relies on to retry). `/api/sync-health` surfacing this is covered by TC-20. **Still blocked:** actually exercising BullMQ's exponential-backoff retry timing (needs a real Redis) and the success path with a real Jira issue (needs `JIRA_PROJECT_KEY`). |

### Sync — GitHub (T-3, T-5)

| ID | Case | Expected | Result |
|---|---|---|---|
| TC-12 | Task create | GitHub issue created in fixed `GITHUB_REPO`; `SyncLink` row created with `ok` | **Blocked** (T-5, `GITHUB_REPO` unset) — same worker-mechanics coverage note as TC-8, provider-agnostic (`workers.success.test.ts`). |
| TC-13 | Update a mapped field | GitHub issue updated; no translation applied | **Blocked** (T-5) — same note as TC-9. |
| TC-14 | GitHub API returns error on create/update | Same retry/visibility guarantee as TC-11 — GitHub must not get a weaker guarantee than Jira | **Partial — Pass on the failure-surfacing half** — `workers.failure.test.ts` runs the real (unmocked) `githubProvider` stub and confirms the identical guarantee as TC-11 (same `SyncAttempt`/`SyncLink`/re-throw assertions, confirming GitHub does **not** get a weaker guarantee). Same remaining blockers as TC-11. |

### Delete Flow (T-9)

| ID | Case | Expected | Result |
|---|---|---|---|
| TC-15 | Delete task with an existing Jira `SyncLink` | Jira issue **closed**, not deleted; `SyncAttempt` recorded | **Blocked** (T-9/T-4) — worker-level close mechanics (existing link with a key → `closeIssue` called, never a delete-equivalent call) covered via mock in `workers.success.test.ts`; the real Jira close call is still blocked. |
| TC-16 | Delete task with an existing GitHub `SyncLink` | GitHub issue **closed**, not deleted; `SyncAttempt` recorded | **Blocked** (T-9/T-5) — same note as TC-15, provider-agnostic mechanics covered. |
| TC-17 | Delete task with no `SyncLink` (never synced) | No close job enqueued; task row removed cleanly | **Pass, with an updated expectation** — actual behavior differs from the wording above: `deleteTask` (`backend/src/services/taskService.ts`) always enqueues a close job regardless of whether a `SyncLink` exists (confirmed in `taskService.test.ts`); the worker (`processSyncJob`) then no-ops when there's no existing link with a key — no provider call is made, and it records a successful no-op (`workers.success.test.ts`, case "TC-17 worker-side half"). Net effect matches intent (task row removed cleanly, no spurious external close call) via a different mechanism than originally described. Expected-behavior wording above should be read as "no *external* close call is made," not "no job is enqueued." |
| TC-18 | Close-issue job executes after the `Task` row is already gone (normal async case) | `SyncAttempt` insert and `SyncLink` upsert both still succeed for the now-deleted `task_id` — implementable now that both are unenforced references (Round 1 fix); blocked only on config/no-implementation, not on design | **Partial — Pass on the mechanism** — `workers.success.test.ts` and `workers.failure.test.ts` write `SyncAttempt`/`SyncLink` rows keyed only by `taskId` (a plain string, never re-querying `Task`), so the write path is provably independent of whether the `Task` row still exists; this is the architectural guarantee TC-18 is actually checking. **Still blocked:** an end-to-end run where the `Task` row is deleted in a real Postgres and the job genuinely runs afterward (needs T-9 config-unblock + real DB). |

### Sync-Health Dashboard (T-8)

| ID | Case | Expected | Result |
|---|---|---|---|
| TC-19 | Mix of synced/pending/failed tasks | `/api/sync-health` counts match actual `SyncLink` states | **Pass** — `backend/src/__tests__/syncHealthService.test.ts`, including a case with a `SyncLink` row belonging to an already-deleted task, which exercises dev-agent's fix to `backend/src/services/syncHealthService.ts` directly: pending is now correctly scoped to currently-existing tasks only (test asserts `pending === 3`, not the pre-fix formula's `2` — see in-test comment for the full math). |
| TC-20 | A failed sync appears in the failing list | Includes `last_error` and a link back to the task | **Pass** — `syncHealthService.test.ts` |

### Non-Functional (requirements §4)

| ID | Case | Expected | Result |
|---|---|---|---|
| TC-21 | Create/update task while Jira/GitHub API is slow/down | Task request completes immediately; sync happens async | **Pass** — `taskService.test.ts` demonstrates `createTask`'s returned promise resolves before a deliberately-delayed sync job has executed (asserts `jobExecuted === false` immediately after `createTask` resolves, `=== true` only after an additional wait). |
| TC-22 | Every sync attempt, success or failure | Recorded with timestamp + target link | **Pass** — success case in `workers.success.test.ts` (create/update/close, each via mocked `SyncProviderClient`), failure case in `workers.failure.test.ts` (real stub providers) — both assert exactly one `SyncAttempt.create` and one `SyncLink.upsert` per job result. |
| TC-23 | One sync queue failing/backed up while the other is healthy | Healthy queue keeps processing — one provider's outage never blocks the other | **Pass (at the job-processor level)** — `workers.success.test.ts` processes a failing jira job and a succeeding github job concurrently (`Promise.allSettled`); jira's promise rejects (triggering its own retry) while github's fulfills, and both get independent, correct `SyncAttempt` writes. This verifies the per-job independence the architecture's separate-queues design relies on. **Not covered:** an actual Redis-backed queue outage (no Redis available in this sandbox) — the structural guarantee (separate `Queue` instances per provider, `backend/src/queue/queues.ts`) is a static code fact, not something this test suite re-verifies at the BullMQ/Redis level. |
| TC-24 | Task list/board with a few hundred tasks | Loads without noticeable delay | **Not covered** — this is a load/performance characteristic, not a unit-testable behavior, and requires a populated real Postgres instance and timing measurement (e.g. a k6/Artillery script against a seeded DB) that doesn't exist in this sandbox. Left in Coverage Gaps. |

### Auth (T-7)

| ID | Case | Expected | Result |
|---|---|---|---|
| TC-25 | Access API without a valid OAuth2/SSO session | 401 | Not run — T-7 blocked on SSO provider selection; no auth middleware exists to test. |
| TC-26 | Access API with a valid session | Request succeeds | Not run — same blocker. |

### Coverage Gaps / Blocked

- **TC-8, TC-9, TC-12, TC-13, TC-15, TC-16** cannot run end-to-end against
  real Jira/GitHub until `JIRA_PROJECT_KEY`/`GITHUB_REPO` are set
  (`phase-04` tasks T-4/T-5/T-9 are `blocked_on_config`). Their underlying
  worker/queue *mechanics* (create vs. update vs. close branching, correct
  provider-client calls, `SyncLink`/`SyncAttempt` writes) are now covered
  via a mocked `SyncProviderClient` in `backend/src/__tests__/
  workers.success.test.ts` — only the "real external call against a fixed
  project/repo" portion remains blocked.
- **TC-11, TC-14** are now partially covered (see tables above) — the
  failure-surfacing/retry-trigger guarantee runs today against the real
  (always-failing) provider stubs; only the actual BullMQ backoff-retry
  timing and the real-API success path remain blocked.
- **TC-18** mechanism (unenforced-reference writes surviving a deleted
  `Task` row) is covered; a true end-to-end run still needs a real DB plus
  T-9 unblocked.
- **TC-23** is no longer blocked — covered at the job-processor level with
  mocked provider clients (see table above). Only a real Redis-backed queue
  outage remains unexercised, which is a structural/code-review fact
  (separate queues per provider) rather than something this suite re-tests.
- **TC-24** is not automatable as a unit test in this environment — needs a
  seeded real Postgres instance and a load-testing tool. Tracked here, not
  silently dropped.
- **TC-6**: the checklist's "if workflow is enforced" hedge is resolved by
  this pass's test run — it is **not** enforced today, and neither
  `phase-01-requirements.md` nor `phase-02-architecture.md` states it must
  be. This is a genuine open design question (should Backlog→Done skip
  In Progress/In Review be rejected?) that should be either explicitly
  accepted as current behavior or routed to architecture-agent for a
  decision, not left ambiguous.
- **TC-17**'s expected-behavior wording ("No close job enqueued") does not
  match the actual implementation ("a close job is always enqueued; the
  worker no-ops when there's no `SyncLink`"). Net observable behavior
  satisfies the requirement's intent (verified, see table above); the
  wording in this checklist has been updated accordingly rather than
  treated as a dev bug.
- TC-25/TC-26 blocked on SSO provider selection (T-7).

## Review Round 3 - Approved (implementation + test results review)

Reviewed by design-review-agent against phase-01-requirements.md and
phase-02-architecture.md, now that T-1/T-2/T-3/T-6/T-8 are implemented
(in_review) and testing-agent's suite (40/40 passing: 25 backend, 15
frontend) has populated the Test Coverage Checklist above with real
pass/fail/partial/blocked results. Code reviewed: backend/src/{app,
routes/tasks, routes/syncHealth, services/taskService,
services/syncHealthService}.ts, prisma/schema.prisma,
queue/{queues, queueNames, workers, types, providerInterface,
providers/jiraProvider, providers/githubProvider}.ts, and
frontend/src/{pages/BoardPage, pages/SyncHealthPage, components/TaskBoard,
components/SyncBadgeRow, components/FilterBar, components/TaskForm,
components/TaskSyncDetailModal}.tsx. npm run build / npm run typecheck
re-verified clean in both backend/ and frontend/; both test suites
re-run and confirmed 25/25 (backend) + 15/15 (frontend) passing.

### Scope and consistency

| # | Check | Result |
|---|---|---|
| 1 | No two-way sync - UI only calls the backend REST API (frontend/src/api/client.ts); nothing in frontend/src or backend/src reads from or writes to Jira/GitHub except the one-way createIssue/updateIssue/closeIssue calls in queue/workers.ts. | Pass |
| 2 | No multi-tenant isolation added (no org/workspace scoping anywhere in the schema or routes) - matches requirements section 2 out-of-scope note. | Pass |
| 3 | No auth implemented beyond scope - no middleware, no session handling anywhere; consistent with T-7 remaining blocked_on_config, not silently half-built. | Pass |
| 4 | Tech stack matches section 5 exactly: Express + TypeScript, Prisma + Postgres (schema only, no live DB in this env), BullMQ (queue/queues.ts), React + Vite + Tailwind. | Pass |
| 5 | REST surface matches phase-02-architecture.md's table exactly (GET/POST /api/tasks, GET/PATCH/DELETE /api/tasks/:id, GET /api/sync-health), including syncStatus[] on the list endpoint and syncLinks[] on the detail endpoint. | Pass |
| 6 | Data model matches phase-02-architecture.md - SyncLink/SyncAttempt.taskId are plain uuid columns, no Prisma relation/FK, exactly per the documented delete-survives-upsert rationale. | Pass |

### Correctness

| # | Check | Result |
|---|---|---|
| 7 | Sync stays async - taskService.createTask/updateTask/deleteTask only await enqueueSyncJob(...), which just calls Queue.add (fast, no job execution wait); confirmed by TC-21's own assertion that createTask resolves before a deliberately-delayed job executes. | Pass |
| 8 | Failures surface, never dropped - queue/workers.ts always writes SyncAttempt and upserts SyncLink.last_status/last_error on both success and failure before re-throwing (so BullMQ's retry doesn't lose the interim record), and /api/sync-health reads directly from SyncLink. | Pass |
| 9 | Delete flow closes, never deletes - providerInterface.ts's SyncProviderClient has no delete-equivalent method at all (only createIssue/updateIssue/closeIssue), so there is no code path that could call a delete API even by mistake; taskService.deleteTask deletes only the local Task row and enqueues a close operation. | Pass |
| 10 | deleteTask always enqueues a close job to both provider queues (mirrors createTask's "always enqueue both" symmetry); processSyncJob looks up the per-provider SyncLink itself and no-ops (ok:true, empty externalKeyOrUrl, no provider call) when none exists. Net effect: no external close call for a never-synced task, task row removed either way - satisfies requirements section 3.2's delete-closes-linked-issues intent via a provider-decides-at-job-time design, consistent with how create/update already push the "does a link exist" check into the worker rather than the service layer. | Pass - accepted as-is, not routed back (see TC-17 decision below) |

### TC-6 (status transitions not sequentially enforced) - decision: accept as-is

Requirements section 3.1 says only "Status workflow (e.g., Backlog -> In
Progress -> In Review -> Done)" - this defines the set of states, not a
transition graph, and nowhere states transitions must be sequential or
that non-adjacent jumps must be rejected. phase-02-architecture.md doesn't
mandate enforcement either. A direct Backlog->Done jump succeeding is
therefore in-scope, requirement-compliant behavior, not a bug - agreeing
with testing-agent's framing. Not routed back to dev-agent. Logged here as
an open product/design question for a future phase (should transitions be
gated?) - belongs with architecture-agent/requirements-agent if and when
it's prioritized, not a blocker for T-1/T-2 approval now.

### TC-17 (delete always enqueues a close job; worker no-ops) - decision: accept as-is

Reviewed independently of testing-agent's framing (see Correctness #10
above): this is a reasonable, consistent implementation choice - not a
deviation from architecture, since the architecture doc's "existing
SyncLink -> close" branching was always going to have to live somewhere,
and putting it in the worker (which already does the identical
create-vs-update branching by provider) rather than duplicating the same
existing-link lookup in taskService.deleteTask keeps the "does a link
exist per provider" check in exactly one place. Net observable behavior
(no spurious external close call, task row removed cleanly) satisfies
requirements section 3.2. Not routed back to dev-agent. The checklist's
updated wording is accurate.

### Mocking approach sanity check

Prisma mocked at the ../db module boundary and BullMQ at
../queue/queues is a reasonable substitute for integration tests against
a real Postgres/Redis, given neither is available in this sandbox - it
exercises the real route handlers, real taskService/syncHealthService
logic, and the real processSyncJob worker body, only swapping out the two
external I/O boundaries. This does not mask application logic; it would
only fail to catch a genuine Prisma-query-shape bug (e.g. a typo in a
where clause) that a real DB would reject - an accepted tradeoff for this
environment, not a concern specific to this change. The one
unmocked-provider exception (workers.failure.test.ts running the real
jiraProvider/githubProvider stubs) is safe rather than a shortcut that
hides something: those stub modules make no network calls at all - they
only read process.env.JIRA_PROJECT_KEY/GITHUB_REPO and return a
deterministic, explicit failure object when unset (confirmed by reading
backend/src/queue/providers/jiraProvider.ts and githubProvider.ts
directly) - so running them "for real" is exercising production code with
no hidden external dependency, which is exactly the point of that test
(TC-11/TC-14's failure-surfacing guarantee).

### Approval

- [x] T-1 (Task CRUD API) - Approved, ready for pr-agent.
- [x] T-2 (Task board/list UI) - Approved, ready for pr-agent.
- [x] T-3 (Async sync job queue) - Approved, ready for pr-agent.
- [x] T-6 (Sync status UI) - Approved, ready for pr-agent.
- [x] T-8 (Sync-health dashboard) - Approved, ready for pr-agent.

No findings required routing back to dev-agent this round. T-4/T-5/T-7/T-9
remain correctly blocked_on_config in task-breakdown.json and are out of
scope for this review round.
