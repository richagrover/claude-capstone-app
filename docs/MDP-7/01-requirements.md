# MDP-7: Requirements Specification

**Phase:** 01 - Requirements Analysis
**Source:** `docs/MDP-7/story.json`
**Story:** Build Task Manager Application with Agentic SDLC Sync
**Status:** Parking lot | **Priority:** Medium | **Reporter:** richa grover

## 1. Overview

MDP-7 has two intertwined deliverables:

1. **Product scope** — an enterprise-grade Task Manager application (task CRUD, status/priority
   tracking, and sync-health reporting against external providers such as GitHub/Jira).
2. **Process scope** — the delivery of that product must itself be executed through a modular,
   agent-based SDLC pipeline (`.claude/agents/`) of 8 sequential phases, each phase gated by
   persisted state and governance rules (no hardcoded secrets, no direct commits to `main`,
   mandatory test verification, clean PR output).

The product functional requirements below are derived from the story's scope line ("Modular
Agent-based Architecture", task manager with SDLC sync) since no separate product-requirements
document exists. They are informed by precedent in this repository's git history (a prior
Express/Prisma backend and React/Vite frontend implementation with task CRUD, filtering, and
sync-health reporting), used here only as a shape/inspiration reference, not as a restored
implementation.

## 2. Functional Requirements — Task Manager Application

### FR-1: Task data model
- FR-1.1: A Task has: `id` (unique identifier), `title` (required, non-empty string), `description`
  (optional string), `status` (enum, e.g. `Backlog`, `InProgress`, `InReview`, `Done`), `priority`
  (enum, e.g. `Low`, `Medium`, `High`), optional `assignee`, optional `dueDate`, optional `labels`
  (list of strings), `createdAt`, `updatedAt`.
- FR-1.2: `status` and `priority` must default to a sensible value (`Backlog` / `Medium`) when not
  supplied on create.

### FR-2: Task CRUD API
- FR-2.1: Create a task (`POST /api/tasks`) with server-side validation of required fields and enum
  values; invalid input is rejected with a 4xx error and a structured error body (no stack traces
  leaked to the client).
- FR-2.2: List tasks (`GET /api/tasks`) with optional filtering by `status`, `assignee`, and
  `priority` query parameters, combinable.
- FR-2.3: Retrieve a single task by id (`GET /api/tasks/:id`); returns 404 with a structured error
  when the id does not exist.
- FR-2.4: Update a task (`PATCH /api/tasks/:id`) with partial-body validation; returns 404 for an
  unknown id.
- FR-2.5: Delete a task (`DELETE /api/tasks/:id`); returns 404 for an unknown id and succeeds
  idempotently otherwise (no error if already deleted, per the agreed delete semantics).

### FR-3: Task list / filter UI
- FR-3.1: The frontend displays the task list with visible status and priority indicators.
- FR-3.2: The frontend supports filtering the visible list by status, assignee, and/or priority,
  mirroring the backend's filter parameters.
- FR-3.3: The frontend supports creating, editing, and deleting a task through forms/dialogs that
  surface validation errors returned by the API.

### FR-4: External provider sync (GitHub / Jira)
- FR-4.1: A task may be linked to an external tracking item (a "sync link") in one or more
  providers (GitHub issue, Jira issue), identified by provider name and external id/key.
- FR-4.2: Sync operations (create/update the linked external item from task state) are processed
  asynchronously (e.g. via a queue/worker) rather than blocking the API request that triggered them.
- FR-4.3: Each sync attempt records its outcome (`ok` / `failed`), a timestamp, and, on failure, an
  error reason — without ever persisting or logging the credentials used to perform the sync
  (see NFR-2).
- FR-4.4: Provider integration is abstracted behind a common interface so GitHub and Jira providers
  are interchangeable/pluggable, and additional providers can be added without changing task-level
  logic.

### FR-5: Sync-health reporting
- FR-5.1: A sync-health endpoint/view (`GET /api/sync-health` or equivalent) reports, per provider:
  counts of tasks synced successfully, tasks with failed sync, and tasks pending sync.
- FR-5.2: The frontend exposes a sync-health view summarizing the above counts so an operator can
  see integration health at a glance.
- FR-5.3: "Pending" sync count must correctly reflect tasks that have never been synced or whose
  last attempt is still in-flight, distinct from "failed".

## 3. Acceptance Criteria Restated as Testable Requirements (AC-1..AC-6)

| ID | Requirement | Test / verification method |
|----|-------------|-----------------------------|
| AC-1 | All 8 SDLC pipeline phases defined under `.claude/agents/` map 1:1 to an artifact file under `docs/MDP-7/` (e.g. phase 01 → `01-requirements.md`, phase 02 → `02-architecture.md`, ... through phase 08). No phase may be skipped or left without a corresponding artifact. | Verification phase confirms, for each of the 8 phases, that the agent definition exists AND the matching `docs/MDP-7/0N-*.md` artifact exists and is non-empty. |
| AC-2 | Every pipeline phase transition (start, in-progress, complete, blocked) is persisted to `docs/MDP-7/pipeline-state.json`, including which phase is active/last-completed, so the pipeline can be resumed or audited. | Inspect `pipeline-state.json` after each phase; confirm it was updated with a new transition entry/timestamp before the next phase begins. |
| AC-3 | No source file, config file, or generated artifact in this repository contains a hardcoded secret, API token, password, or credential. Secrets are supplied only via environment variables (e.g. `GITHUB_TOKEN`, Jira API token) at runtime. | Static scan (e.g. grep for token-like patterns, review of `.env.example` vs `.env`) during the verification phase; code review checklist item. |
| AC-4 | No commit lands directly on `main`/`master`. All work happens on a feature branch (e.g. `feature/mdp-7-*`) and reaches `main` only via Pull Request. | `git log` / branch-protection check confirming the active branch is a feature branch and the PR-creation phase opens a PR rather than pushing to `main`. |
| AC-5 | After the implementation phase completes, the full test suite (unit + integration) is executed, and its results (pass/fail counts, coverage if available, failures with detail) are written to `docs/MDP-7/07-verification-report.md`. | Confirm `07-verification-report.md` exists, is dated after the implementation artifact, and contains actual test run output, not a placeholder. |
| AC-6 | The final pipeline phase produces a clean, human-readable Pull Request summary (what changed, why, how it was tested, links to artifacts) suitable for a reviewer, with no leftover debug output or TODOs. | Review the PR description produced by the final phase against a clean-summary checklist (summary, test plan, no secrets, no noise). |

## 4. Non-Functional Requirements / Constraints

### NFR-1: Pipeline governance (process)
- NFR-1.1: The 8 pipeline phases execute sequentially; a later phase must not begin before its
  predecessor's artifact and state transition are recorded (ties to AC-1/AC-2).
- NFR-1.2: Human-in-the-loop validation checkpoints must be respected before advancing past
  critical stages (e.g. architecture sign-off, pre-PR review) — the pipeline must not silently
  auto-advance past a checkpoint awaiting approval.

### NFR-2: Security & secrets (ties to AC-3)
- NFR-2.1: Hardcoding API keys, passwords, or tokens in source code, config, or committed artifacts
  is strictly forbidden.
- NFR-2.2: Secrets are read from environment variables / secure local configuration only
  (e.g. `GITHUB_TOKEN`, Jira credentials), never written into logs, artifacts, or shared repos.
- NFR-2.3: Error messages and sync-health output must not leak credential values, even on failure.

### NFR-3: Branching & version control (ties to AC-4)
- NFR-3.1: No direct commits to `main`/`master`; all changes flow through feature branches.
- NFR-3.2: Commit messages follow conventional format (`feat:`, `fix:`, `refactor:`, etc.).
- NFR-3.3: Feature branches are kept up to date with the latest `main` before PR merge.

### NFR-4: Code quality & testing
- NFR-4.1: Business logic (task CRUD, filtering, sync orchestration, sync-health aggregation) must
  be covered by unit and integration tests.
- NFR-4.2: No hardcoded "magic" values or unhandled exceptions; consistent formatting, type safety,
  and error handling across backend and frontend.
- NFR-4.3: All local changes must be tested and verified before a PR is opened (ties to AC-5/AC-6).

### NFR-5: Reliability of external sync
- NFR-5.1: A failure to reach an external provider (GitHub/Jira) must not corrupt task state or
  crash the application; it is recorded as a failed sync attempt and is retryable.
- NFR-5.2: Sync processing must be decoupled (queued/asynchronous) so provider latency/outages do
  not block task CRUD operations.

## 5. Dependencies

- D-1: `.claude/agents/` definitions for each of the 8 SDLC phases must exist and be addressable by
  the orchestrator (requirements, architecture, design-review, implementation, code-review,
  testing/verification, PR-creation, and the orchestrator itself or an equivalent 8th phase).
- D-2: `docs/MDP-7/pipeline-state.json` must exist (created/initialized) before phase transitions
  can be persisted.
- D-3: External provider credentials (GitHub token, Jira API token) must be available via
  environment variables at runtime for FR-4 sync features to function; their absence should
  degrade gracefully (sync marked pending/unavailable) rather than crash the app.
- D-4: A backend persistence layer (database) is required to store tasks and sync-link/sync-attempt
  records durably across restarts.
- D-5: A queue/worker mechanism (or equivalent async processing) is required to satisfy FR-4.2's
  decoupling requirement.
- D-6: Git remote / PR tooling (e.g. GitHub) must be reachable and authenticated via a non-hardcoded
  token for the final PR-creation phase (AC-6).

## 6. Edge Cases

### Task CRUD
- EC-1: Creating a task with an empty/whitespace-only title must be rejected (FR-2.1).
- EC-2: Creating/updating a task with an invalid `status` or `priority` enum value must be
  rejected with a clear validation error, not silently coerced.
- EC-3: Requesting, updating, or deleting a task by a non-existent or malformed id must return 404
  (or 400 for malformed id), never a 500.
- EC-4: Filtering by a combination of query parameters that matches zero tasks must return an
  empty list, not an error.
- EC-5: Concurrent updates to the same task (e.g. two PATCH requests racing) must not corrupt data;
  last-write-wins semantics (via `updatedAt`) are acceptable but must be deterministic.

### Sync / sync-health
- EC-6: A task deleted locally while it still has an in-flight or previously-successful sync link
  must not leave the external provider or the sync-health counts in an inconsistent state (e.g. the
  "delete-closes-linked-issue" flow, or an explicit decision to leave the external item untouched,
  must be defined and tested).
- EC-7: A provider outage or auth failure during sync must increment the "failed" count, record a
  reason, and must not retry in a tight loop that could exhaust rate limits.
- EC-8: A task with no sync link at all must be counted as "pending", not "failed".
- EC-9: Partial provider configuration (e.g. GitHub token present, Jira token absent) must allow
  GitHub sync to proceed while Jira sync is reported as unavailable/pending, rather than failing
  both.

### Pipeline / governance
- EC-10: If a phase's artifact generation fails partway through, `pipeline-state.json` must reflect
  the phase as incomplete/blocked, not falsely marked complete (ties to AC-2).
- EC-11: If a secret is accidentally introduced in a diff, the pipeline's quality/security checks
  must catch it before the PR-creation phase runs (ties to AC-3/AC-6).
- EC-12: An attempt to commit directly to `main` (e.g. due to a misconfigured branch) must be
  detectable/blocked before it reaches the remote (ties to AC-4).
- EC-13: If the test suite fails during the verification phase, `07-verification-report.md` must
  record the failure explicitly (not be skipped or show a false "all passed"), and the pipeline
  should not advance to PR-creation on a failing suite without explicit human override.

## 7. Traceability Summary

| Area | Covered by |
|------|-----------|
| Task manager product scope | FR-1 .. FR-5 |
| Governance acceptance criteria | AC-1 .. AC-6 (Section 3) |
| Security/branching/testing constraints | NFR-1 .. NFR-5 |
| Build-time dependencies | D-1 .. D-6 |
| Risk areas | EC-1 .. EC-13 |
