# Phase 03: Review Feedback & Approval Checklist (MDP-7)

**Reviews:** `phase-01-requirements.md`, `phase-02-architecture.md`,
`phase-04-implementation-manifest.md`
**Final status:** Approved (second pass)

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
No implementation exists yet, so no case below has been executed — this is
coverage-at-design-time, re-verified each time `phase-02-architecture.md` or
`phase-04-implementation-manifest.md` changes.

### Task CRUD (T-1, T-2)

| ID | Case | Expected |
|---|---|---|
| TC-1 | Create task with all fields | Persisted; `GET /api/tasks/:id` returns it |
| TC-2 | Create task missing required field (title) | 400, no row created |
| TC-3 | Update task fields | Change saved; `updated_at` advances |
| TC-4 | Delete task | Task row removed (see TC-15/TC-16 for linked-issue behavior) |
| TC-5 | Status transition through full workflow (Backlog→In Progress→In Review→Done) | Each transition succeeds |
| TC-6 | Invalid status transition (if workflow is enforced) | Rejected |
| TC-7 | Filter list by status/assignee/priority | Only matching tasks returned |

### Sync — Jira (T-3, T-4)

| ID | Case | Expected |
|---|---|---|
| TC-8 | Task create | Jira issue created in fixed `JIRA_PROJECT_KEY`; `SyncLink` row created with `ok` |
| TC-9 | Update a mapped field (priority/status/assignee) | Jira issue updated to match; no translation applied |
| TC-10 | Update an unmapped field (e.g. description) | No sync job enqueued |
| TC-11 | Jira API returns error on create/update | Retried with backoff; after cap exhausted, `SyncLink.last_status = failed` with `last_error`, visible via `/api/sync-health` |

### Sync — GitHub (T-3, T-5)

| ID | Case | Expected |
|---|---|---|
| TC-12 | Task create | GitHub issue created in fixed `GITHUB_REPO`; `SyncLink` row created with `ok` |
| TC-13 | Update a mapped field | GitHub issue updated; no translation applied |
| TC-14 | GitHub API returns error on create/update | Same retry/visibility guarantee as TC-11 — GitHub must not get a weaker guarantee than Jira |

### Delete Flow (T-9)

| ID | Case | Expected |
|---|---|---|
| TC-15 | Delete task with an existing Jira `SyncLink` | Jira issue **closed**, not deleted; `SyncAttempt` recorded |
| TC-16 | Delete task with an existing GitHub `SyncLink` | GitHub issue **closed**, not deleted; `SyncAttempt` recorded |
| TC-17 | Delete task with no `SyncLink` (never synced) | No close job enqueued; task row removed cleanly |
| TC-18 | Close-issue job executes after the `Task` row is already gone (normal async case) | `SyncAttempt` insert and `SyncLink` upsert both still succeed for the now-deleted `task_id` — implementable now that both are unenforced references (Round 1 fix); blocked only on config/no-implementation, not on design |

### Sync-Health Dashboard (T-8)

| ID | Case | Expected |
|---|---|---|
| TC-19 | Mix of synced/pending/failed tasks | `/api/sync-health` counts match actual `SyncLink` states |
| TC-20 | A failed sync appears in the failing list | Includes `last_error` and a link back to the task |

### Non-Functional (requirements §4)

| ID | Case | Expected |
|---|---|---|
| TC-21 | Create/update task while Jira/GitHub API is slow/down | Task request completes immediately; sync happens async |
| TC-22 | Every sync attempt, success or failure | Recorded with timestamp + target link |
| TC-23 | One sync queue failing/backed up while the other is healthy | Healthy queue keeps processing — one provider's outage never blocks the other |
| TC-24 | Task list/board with a few hundred tasks | Loads without noticeable delay |

### Auth (T-7)

| ID | Case | Expected |
|---|---|---|
| TC-25 | Access API without a valid OAuth2/SSO session | 401 |
| TC-26 | Access API with a valid session | Request succeeds |

### Coverage Gaps / Blocked

- TC-8, TC-9, TC-11, TC-12, TC-13, TC-14, TC-15, TC-16, TC-18, TC-23 cannot
  run end-to-end against real Jira/GitHub (or a real queue outage) until
  `JIRA_PROJECT_KEY`/`GITHUB_REPO` are set (`phase-04` tasks T-4/T-5 are
  `blocked_on_config`) — coverable with mocked provider APIs meanwhile.
- TC-25/TC-26 blocked on SSO provider selection (T-7).
