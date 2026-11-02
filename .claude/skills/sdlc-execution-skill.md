---
name: sdlc-execution-skill
description: Use to generate/update the phase-numbered SDLC artifacts under docs/artifacts/MDP-7/ (phase-01..04, jira_snapshot.json) from docs/requirements.md, and to execute the one-way Jira/GitHub sync for a Task Manager task (create, update, or close an issue) per MDP-7's fixed field mapping. Covers what used to be three separate skills (generate-artifacts, sync-to-jira, sync-to-github).
---

# SDLC Execution — MDP-7

Two responsibilities that share the same artifact set: keeping
`docs/artifacts/MDP-7/` consistent with `docs/requirements.md`, and
executing the app → Jira/GitHub one-way sync. Used by `architecture-agent`,
`dev-agent`, `review-agent`, and `pr-agent` at their respective pipeline
stages.

Non-standard file names (`design.md`, `test-plan.md`, `sync-log.json`) are
retired under the strict phase-numbered convention — never recreate them.

## Part 1 — Artifact Generation

1. Read `docs/requirements.md` fully before touching any artifact — it is
   the source of truth for scope.
2. `jira_snapshot.json` — raw Jira issue data for MDP-7, pulled live via
   `mcp__jira__jira_get`. Refresh when the live issue changes; never
   fabricate a value that wasn't actually returned by the API. This file is
   inbound-only (what Jira says about the MDP-7 planning issue) — it is not
   where outbound sync attempts get logged (see Part 2).
3. `phase-01-requirements.md` — baseline snapshot of `docs/requirements.md`
   (owned day-to-day by the `Buisness-analyst` skill); regenerate when
   requirements change materially.
4. `phase-02-architecture.md` — system design, API specs, and sync logic
   derived from requirements §5 (stack) and §3 (features); update when the
   stack or feature scope changes. Do not fabricate real config values
   (`JIRA_PROJECT_KEY`, `GITHUB_REPO`, SSO provider) — mark them TBD until
   the user supplies them.
5. `phase-03-design-review.md` — review rounds/approval checklist plus the
   Test Coverage Checklist (owned day-to-day by the `testing` skill); keep
   its cross-references to `phase-01`/`phase-02` current.
6. `phase-04-implementation-manifest.md` — human-readable task breakdown,
   kept in sync with the machine-readable `task-breakdown.json` (same task
   IDs, same `status`/`blocked_reason`/dependency fields in both; update
   both together, never just one).
7. Never introduce scope into an artifact that isn't in
   `docs/requirements.md` — add it to the requirements "Open Questions"
   section first (see `Buisness-analyst`).

## Part 2 — One-Way Sync Execution (app → Jira/GitHub)

Jira and GitHub are never the source of truth in v1
(`docs/requirements.md` §3.2) — this is strictly outbound.

1. Read the task's current fields (title, description, status, priority,
   assignee, labels, due date) from the app's task record.
2. Map to the target per `docs/artifacts/MDP-7/task-breakdown.json`
   `field_mapping` (Jira: project key, issue type, custom fields; GitHub:
   repo, labels) — direct 1:1 mapping only, no translation layer. If a
   field has no mapping yet, stop and flag it rather than guessing.
3. If the target config (`JIRA_PROJECT_KEY` / `GITHUB_REPO`) is still TBD,
   stop — do not invent a project key or repo. Leave the task
   `blocked_on_config`.
4. Execute:
   - **Create:** `mcp__jira__jira_post` (`/rest/api/3/issue`) or
     `mcp__github__create_issue`.
   - **Update:** `mcp__jira__jira_put` or `mcp__github__update_issue`; use
     `mcp__github__add_issue_comment` for status-change notes.
   - **Delete (app-side):** close the linked issue — never delete it
     (`docs/requirements.md` §3.2 delete behavior).
5. Record the result (success/failure, external key/URL, timestamp) on the
   relevant task's entry in `docs/artifacts/MDP-7/task-breakdown.json`, and
   reflect the same status in `phase-04-implementation-manifest.md`. There
   is no separate sync-log file under this convention — do not recreate
   one.
6. On failure, do not silently drop it — surface it per the backend's retry
   policy (`phase-02-architecture.md` Sync Pipeline), and keep the task's
   recorded status as failed/retrying rather than clearing it.
