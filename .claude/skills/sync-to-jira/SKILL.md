---
name: sync-to-jira
description: Use when a Task Manager task needs to be pushed to Jira as a new or updated issue. Covers field mapping and one-way sync rules for MDP-7.
---

# Sync to Jira

One-way sync: Task Manager app → Jira. Jira is never the source of truth in
v1 (see `docs/requirements.md` section 3.2).

1. Read the task's current fields (title, description, status, priority,
   assignee, labels, due date).
2. Map to Jira fields per `docs/artifacts/MDP-7/task-breakdown.json` field
   mapping (project key, issue type, custom fields) — if no mapping exists
   yet for a field, stop and flag it rather than guessing.
3. Use `mcp__jira__jira_post` (create) or `mcp__jira__jira_put` (update) via
   `/rest/api/3/issue`.
4. Record the result (success/failure, Jira issue key, timestamp) on the
   task's entry in `docs/artifacts/MDP-7/task-breakdown.json` and reflect it
   in `docs/artifacts/MDP-7/phase-04-implementation-manifest.md`. Do not
   write it into `jira_snapshot.json` — that file is the raw inbound
   snapshot of the MDP-7 planning issue, not an outbound sync log.
5. On failure, do not silently drop it — surface it per the backend's retry
   policy.
