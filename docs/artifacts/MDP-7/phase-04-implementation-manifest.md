# Phase 04: Implementation Manifest (MDP-7)

**Machine-readable companion:** `task-breakdown.json` (same tasks, same
field names — keep both in sync; this file is the human-readable view).
**Derived from:** `phase-02-architecture.md`
**Status:** Planned — no application code exists yet (no `src/`, no
`package.json`); this manifest is planning-only until dev-agent starts
implementation.

## Tasks

### T-1 — Task CRUD API (`backend`, ready)
**Requirement:** `phase-01-requirements.md` §3.1 · **Depends on:** none
- Prisma schema for Task per `phase-02-architecture.md` Data Model
- `GET /api/tasks` (filters: status, assignee, priority)
- `POST /api/tasks`
- `GET /api/tasks/:id` (include `syncLinks[]`)
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`

Acceptance criteria:
- All CRUD endpoints match `phase-02-architecture.md` REST API Surface table
- `PATCH` only enqueues a sync job when a mapped field (priority/status/assignee) changes

### T-2 — Task board/list UI (`frontend`, ready)
**Requirement:** §3.1 · **Depends on:** T-1
- Task list/board view with status columns
- Filter by status/assignee/priority
- Create/edit task form (fields per data model)

Acceptance criteria:
- Board reflects live task state from T-1 API
- Filtering works without full page reload

### T-3 — Async sync job queue (BullMQ/Redis) (`backend`, ready)
**Requirement:** §3.2 · **Depends on:** T-1
- Separate queues: `sync:jira`, `sync:github`
- Retry policy: exponential backoff, fixed attempt cap
- `SyncAttempt` + `SyncLink` persistence on every job result

Acceptance criteria:
- Task API requests never block on job execution
- A failing job does not block other queued jobs

### T-4 — Jira sync integration (`backend`, **blocked_on_config**)
**Requirement:** §3.2 · **Depends on:** T-3
- Create issue in fixed `JIRA_PROJECT_KEY` on task create
- Update mapped fields (priority/status/assignee) on task update
- Close issue (not delete) on task delete

Acceptance criteria:
- Uses `field_mapping.jira` below, no translation layer
- Delete flow closes rather than deletes the Jira issue

Blocked reason: `JIRA_PROJECT_KEY` is still TBD (see
`field_mapping.jira.project_key`). Note: this is a different value from
Jira project `MDP` that the MDP-7 planning issue itself lives in — see
`jira_snapshot.json`.

### T-5 — GitHub sync integration (`backend`, **blocked_on_config**)
**Requirement:** §3.2 · **Depends on:** T-3
- Create issue in fixed `GITHUB_REPO` on task create
- Update mapped fields on task update
- Close issue (not delete) on task delete

Acceptance criteria:
- Uses `field_mapping.github` below, no translation layer
- Delete flow closes rather than deletes the GitHub issue

Blocked reason: `GITHUB_REPO` is still TBD (see `field_mapping.github.repo`).

### T-6 — Sync status UI (synced/pending/failed) (`frontend`, ready)
**Requirement:** §3.2 · **Depends on:** T-1, T-3
- Per-task sync badge (synced/pending/failed) from `syncLinks[]`
- Failed state shows `last_error` and links to the external issue if present

Acceptance criteria:
- A failed sync is visibly distinct from a pending/synced one

### T-7 — OAuth2/SSO auth (`backend`, **blocked_on_config**)
**Requirement:** §5 · **Depends on:** none
- Wire OAuth2/SSO middleware
- Session/token handling for the API

Acceptance criteria:
- No local password storage

Blocked reason: SSO provider not yet identified (see
`phase-02-architecture.md` Config section).

### T-8 — Sync-health dashboard (`frontend`, ready)
**Requirement:** §3.3 · **Depends on:** T-3
- `GET /api/sync-health` endpoint (backend, counts + failing list)
- Dashboard view consuming that endpoint

Acceptance criteria:
- Counts match `phase-02-architecture.md` Sync-Health Dashboard section
- Failing syncs list shows `last_error` per task

### T-9 — Close linked Jira/GitHub issue on task delete (`backend`, **blocked_on_config**)
**Requirement:** §3.2 · **Depends on:** T-4, T-5
- Delete handler enqueues close-issue job per provider with an existing `SyncLink`

Acceptance criteria:
- External issue is closed, never deleted
- Attempt recorded in `SyncAttempt` even if the task row is already gone

Blocked reason: depends on T-4/T-5, which are blocked on sync target config.

## Field Mapping

### Jira
- Status: resolved for MVP — fixed project, direct field mapping
- Project key: **TBD** — fixed Jira project key to be set when environment is configured (not `MDP`; see `jira_snapshot.json`)
- Issue type: `Task`
- Fields: `priority` → `priority`, `status` → `status`, `assignee` → `assignee`
- Delete behavior: close linked issue (do not delete)

### GitHub
- Status: resolved for MVP — fixed repo, direct field mapping
- Repo: **TBD** — fixed GitHub repo (`owner/name`) to be set when environment is configured
- Fields: `priority` → priority (label or field, per repo's GitHub config), `status` → status (label or project-board column), `assignee` → `assignee`
- Delete behavior: close linked issue (do not delete)
