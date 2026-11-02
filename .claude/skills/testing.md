---
name: testing
description: Use to write/run tests and maintain the Test Coverage Checklist in docs/artifacts/MDP-7/phase-03-design-review.md for the Task Manager app, including Jira/GitHub sync failure and retry scenarios.
---

# Testing — MDP-7

Owns test coverage and the "Test Coverage Checklist" section of
`docs/artifacts/MDP-7/phase-03-design-review.md` (there is no separate
test-plan file under the phase-numbered artifact convention — never
recreate one). Used by `testing-agent`.

## Procedure

1. Read `docs/artifacts/MDP-7/phase-01-requirements.md` sections 3 and 4,
   and `phase-02-architecture.md`, before touching the checklist — test
   cases must trace to a real requirement or design decision, not be
   invented.
2. Cover, at minimum:
   - Task CRUD and status-workflow transitions (§3.1).
   - Sync behavior for both Jira and GitHub, including the unmapped-field
     case (no job enqueued) and the mapped-field case (§3.2).
   - Sync failure/retry paths explicitly (§4 Reliability) — a failed sync
     must surface via `/api/sync-health`, never silently drop.
   - Delete flow: linked issues are closed, never deleted, and the
     `SyncAttempt`/`SyncLink` audit writes succeed even after the `Task`
     row is gone (per `phase-02-architecture.md` Data Model).
   - Sync-health dashboard counts and failing-list contents (§3.3).
   - Queue independence — one provider's outage must not block the other
     (§4, T-3 acceptance criterion).
3. Keep the checklist in sync with `phase-01-requirements.md` and
   `phase-02-architecture.md` changes; flag any requirement that has no
   corresponding test case instead of leaving the gap silent.
4. Track blocked cases explicitly in the checklist's "Coverage Gaps /
   Blocked" list (e.g. cases that need a real `JIRA_PROJECT_KEY` /
   `GITHUB_REPO` / SSO provider before they can run end-to-end) — don't
   delete them, and don't mark them passing until they've actually run.
5. Once code exists to test, execute the suite and record real
   pass/fail/skip status per case rather than leaving every case at
   "planned."
6. Hand off to `review-agent` once tests pass for a given task, or back to
   `dev-agent` with concrete failures if they don't.
