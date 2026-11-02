---
name: sync-to-github
description: Use when a Task Manager task needs to be pushed to GitHub as a new or updated issue. Covers field mapping and one-way sync rules for MDP-7.
---

# Sync to GitHub

One-way sync: Task Manager app → GitHub. GitHub is never the source of truth
in v1 (see `docs/requirements.md` section 3.2).

1. Read the task's current fields (title, description, status, priority,
   assignee, labels).
2. Map to the target repo/labels per `docs/artifacts/MDP-7/task-breakdown.json`
   — if the repo target isn't configured for this task, stop and flag it.
3. Use `mcp__github__create_issue` (create) or `mcp__github__update_issue`
   (update); use `mcp__github__add_issue_comment` for status-change notes.
4. Record the result (success/failure, issue URL, timestamp) on the task's
   entry in `docs/artifacts/MDP-7/task-breakdown.json` and reflect it in
   `docs/artifacts/MDP-7/phase-04-implementation-manifest.md`.
5. On failure, do not silently drop it — surface it per the backend's retry
   policy.
