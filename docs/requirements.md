# Requirements: Task Manager Application with SDLC Sync

**Source:** Jira MDP-7 ("Build Task Manager Application with Agentic SDLC Sync")
**Status:** Draft — under review
**Last updated:** 2026-11-02

## 1. Overview

An internal team task management application. Tasks created and managed in the
app automatically sync one-way to Jira and GitHub, so the team's SDLC
documentation and issue trackers stay up to date without manual duplication.

## 2. Users & Scope

- **Audience:** Single internal team (not multi-tenant). All users belong to
  the same org/workspace.
- **Out of scope for v1:** Multi-tenant isolation, external/customer-facing
  access.

## 3. Core Features (MVP)

### 3.1 Task CRUD
- Create, read, update, delete tasks.
- Fields: title, description, status, priority, assignee, due date, labels.
- Status workflow (e.g., Backlog → In Progress → In Review → Done).
- Assign tasks to team members; filter/search by status, assignee, priority.

### 3.2 SDLC Sync (Jira & GitHub) — one-way, app → external
- When a task is created/updated in the app, the app creates/updates a
  corresponding Jira issue and/or GitHub issue.
- Jira and GitHub remain **read-only mirrors** of app state for this
  direction — the app is the source of truth; changes made directly in Jira
  or GitHub are **not** pulled back in v1.
- Sync triggers: task creation, status change, field updates (configurable
  which fields map to which Jira/GitHub fields).
- Sync should be resilient to transient API failures (retry with backoff;
  failed syncs are visible/flagged in the app, not silently dropped).
- Mapping configuration: which app fields map to which Jira fields (project
  key, issue type, custom fields) and GitHub fields (repo, labels).
- **Sync targets (MVP):** one fixed Jira project and one fixed GitHub repo,
  configured for the whole app — not configurable per task/project in v1.
- **Field mapping (MVP):** direct 1:1 mapping for `priority`, `status`, and
  `assignee` (no value translation layer in v1).
- **Delete behavior:** deleting a task in the app closes the linked Jira
  issue and closes the linked GitHub issue (does not delete them).

### 3.3 Sync-Health Dashboard
- Basic dashboard view (alongside the task board) showing sync status
  across tasks: counts of synced / pending / failed, and a list of
  currently-failing syncs with last error.

## 4. Non-Functional Requirements

- **Reliability:** Sync failures must not block task operations in the app;
  sync happens asynchronously.
- **Auditability:** Every sync action (success/failure) should be logged with
  timestamp and target issue link.
- **Performance:** Task list/board views should load quickly for a single
  team's typical volume (hundreds, not millions, of tasks).

## 5. Tech Stack (confirmed)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript (Vite), Tailwind CSS | Fast dev loop, widely known, good component ecosystem |
| Backend | Node.js + Express, TypeScript | Same language as frontend; simple REST API |
| Database | PostgreSQL + Prisma ORM | Relational fit for tasks/users/sync-logs; strong typing |
| Background jobs | BullMQ + Redis | Needed for async, retrying sync to Jira/GitHub |
| Auth | OAuth2 / SSO (e.g., org identity provider) | Internal team tool — avoid building custom auth |
| External APIs | Jira REST API v3, GitHub REST API | Matches MDP-7's sync target |
| Deployment | Containerized (Docker), internal/cloud infra | Portable, standard for internal tools |

## 6. Open Questions

None outstanding — all MVP-scope questions resolved (see sections 3.2/3.3).
New questions will be added here as they come up (e.g., which specific Jira
project key / GitHub repo to point at, once that's decided operationally).

## 7. Future / Phase 2 Ideas (not in MVP)

- Two-way sync (pulling updates made directly in Jira/GitHub back into the app).
- Multi-tenant support.
- Auto-generated changelog/requirements docs from completed tasks.
