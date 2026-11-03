# Phase 02: System Design, API Specs & Sync Logic (MDP-7)

**Derived from:** `phase-01-requirements.md` (sections 3 and 5)
**Status:** Approved — see `phase-03-design-review.md`

## Architecture

```
React (Vite) UI  --REST-->  Express API  --Prisma-->  PostgreSQL
                                  |
                                  v
                          BullMQ job queue (Redis)
                                  |
                      ┌───────────┴───────────┐
                      v                       v
                 Jira REST API v3       GitHub REST API
```

- UI never talks to Jira/GitHub directly — all sync goes through the backend
  so retries/logging are centralized.
- Sync jobs are enqueued on task create/update/status-change and processed
  asynchronously; task requests never block on an external API call.

## REST API Surface (v1)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/tasks` | list, supports `?status=&assignee=&priority=` filters; each item includes a lightweight `syncStatus[]` summary (`{ provider: 'jira'\|'github', status: 'synced'\|'pending'\|'failed' }`), derived from `SyncLink`, so the board/list view (T-2) can render per-task sync badges (T-6) without an extra request per task |
| POST | `/api/tasks` | create; enqueues sync job on success |
| GET | `/api/tasks/:id` | fetch one, includes full `syncLinks[]` (with `external_key_or_url`, `last_synced_at`, `last_status`, `last_error`) — the detail view backing T-6's "show `last_error` and link to the external issue" behavior |
| PATCH | `/api/tasks/:id` | partial update; enqueues sync job if a mapped field changed |
| DELETE | `/api/tasks/:id` | deletes task; enqueues a "close linked issues" job (does not delete Jira/GitHub issues) |
| GET | `/api/sync-health` | counts of synced/pending/failed + list of currently-failing syncs (backs section 3.3 dashboard) |

Request/response bodies carry the Task fields listed in the data model below.
`PATCH` accepts a partial object; only mapped fields (`priority`, `status`,
`assignee`) trigger a sync job — other field changes (e.g. `description`)
are v1-local only per the direct-mapping decision in `phase-01-requirements.md` §3.2.

`syncStatus[]` (on the list endpoint) and `syncLinks[]` (on the single-task
endpoint) are both read-time projections of the `SyncLink` table — no new
stored field, just different levels of detail for the two UI surfaces
(T-6's board badge needs only current status per provider; T-6's detail/
failed view needs `last_error` and the external link too).

## Data Model (finalized for v1)

- **Task**: `id` (uuid), `title` (string), `description` (text, nullable),
  `status` (enum: Backlog/In Progress/In Review/Done), `priority` (enum:
  Low/Medium/High), `assignee` (user id, nullable), `due_date` (date,
  nullable), `labels` (string[]), `created_at`, `updated_at`
- **SyncLink**: `task_id` (plain uuid column, **no FK constraint to Task** —
  unenforced reference, not a Prisma relation), `provider` (`jira` |
  `github`), `external_key_or_url` (string), `last_synced_at` (timestamp),
  `last_status` (`ok` | `failed`), `last_error` (text, nullable) — one row
  per (task, provider); upserted on each sync attempt, including the
  close-linked-issue job's result after the owning `Task` row has already
  been deleted. `task_id` is deliberately not a foreign key for the same
  reason as `SyncAttempt.task_id` below: a restrictive FK would block
  deleting any previously-synced task outright (contradicting
  `phase-01-requirements.md` §3.2's delete-closes-linked-issues flow), and
  `ON DELETE CASCADE` would wipe the row before the close job can upsert its
  result into it
- **SyncAttempt** (append-only audit trail): `id`, `task_id` (plain uuid
  column, **no FK constraint to Task** — unenforced reference, not a Prisma
  relation), `provider`, `timestamp`, `result` (`ok` | `failed`), `detail`
  (text) — backs the sync-health dashboard and is the system of record for
  per-sync audit history (requirements §4 Auditability) once implemented.
  `task_id` is deliberately not a foreign key so that a `SyncAttempt` row can
  always be written after the owning `Task` row is deleted (e.g. the
  close-linked-issue job's result for a just-deleted task) without either
  failing an insert (as a restrictive FK would) or silently losing the audit
  row to `ON DELETE CASCADE` — required by T-9's acceptance criterion
  ("Attempt recorded in SyncAttempt even if the task row is already gone")
  and `phase-01-requirements.md` §4 Auditability ("every sync action...
  logged")

## Sync Pipeline (end-to-end)

1. Task mutation (create/update/delete) commits to Postgres.
2. If the mutation touched a mapped field (or is a create/delete), a job is
   enqueued on BullMQ (`sync:jira`, `sync:github` — independent queues so one
   provider's outage doesn't block the other).
3. Job handler calls the provider's REST API using the fixed project
   key / repo from config (see Config section).
   - **Create:** no existing `SyncLink` for that provider → create issue →
     upsert `SyncLink` with the returned key/url.
   - **Update:** existing `SyncLink` → update the issue's mapped fields.
   - **Delete:** existing `SyncLink` → **close** the issue (transition to a
     closed/done state) — never delete the external issue.
4. Job result (success or failure) is written to `SyncAttempt` and upserted
   into `SyncLink.last_status`/`last_error`. For the delete flow this upsert
   happens after the Task row's delete has already committed (step 1), which
   is why both `SyncAttempt.task_id` and `SyncLink.task_id` are unenforced
   references rather than FKs — the upsert must always succeed.
5. On failure, BullMQ retries with exponential backoff (fixed attempt cap);
   after the cap is exhausted the failure stays visible via
   `SyncLink.last_status = 'failed'` and surfaces on `/api/sync-health` —
   never dropped silently (`phase-01-requirements.md` §4, Auditability).

## Sync-Health Dashboard (§3.3)

Backed by `GET /api/sync-health`, computed from `SyncLink` (not re-querying
Jira/GitHub live):
- Counts: synced / pending (job queued, no result yet) / failed.
- List of tasks with `last_status = 'failed'`, each with `last_error` and a
  link to the task.

## Auth

OAuth2/SSO against the org identity provider (`phase-01-requirements.md`
section 5). No local password storage.

## Config (values TBD — do not fabricate real identifiers)

| Var | Purpose |
|---|---|
| `JIRA_PROJECT_KEY` | fixed target project for all synced issues (TBD — not the same thing as Jira project `MDP` that the MDP-7 planning issue itself lives in; see `jira_snapshot.json` notes) |
| `GITHUB_REPO` | fixed target repo, `owner/name` (TBD) |
| `JIRA_API_TOKEN`, `JIRA_BASE_URL` | Jira API auth |
| `GITHUB_TOKEN` | GitHub API auth |
| `DATABASE_URL` | Postgres connection (Prisma) |
| `REDIS_URL` | BullMQ connection |
| OAuth2/SSO client id/secret/issuer | provider-specific, TBD pending which SSO provider the team uses |

## Open Design Questions

None currently — all MVP design decisions trace back to resolved items in
`phase-01-requirements.md`. New ones go here, not into the requirements
baseline, unless they turn out to be scope questions rather than design
questions.
