# Phase 01 — Requirements Analysis

**Story Key:** MDP-7
**Title:** Build Task Manager Application with Agentic SDLC Sync
**Issue Type:** Idea
**Status:** Parking lot
**Priority:** Medium
**Reporter:** richa grover
**Created:** 2026-10-26T14:40:22.282+0530
**Run:** 2 (re-run of a previously completed pipeline — see §9)

## 1. Overview

As an engineering team, we want to establish a secure, modular, and automated SDLC workflow
using structured agents and strict quality rules, so that we can streamline software delivery
and maintain repository integrity. The system comprises two coupled deliverables:

1. An enterprise-grade **Task Manager Application** (backend + frontend) — already implemented
   in `backend/` and `frontend/` from the previous pipeline run, and re-verified against this
   document (see §9).
2. An **Agentic SDLC pipeline** — a modular, agent-based automation layer (`.claude/` structure)
   that drives the application's development lifecycle through 8 sequential phases, persisting
   state and producing a documentation artifact for each phase.

## 2. Scope

- Modular agent-based architecture under `.claude/` (agents, skills, hooks) that implements each
  SDLC phase as a discrete, independently invokable unit.
- Execution strategy composed of 8 sequential pipeline phases, executed in strict order, with
  state persisted between phases and a human checkpoint before implementation begins.
- For this re-run: re-validating that the existing `backend/`/`frontend/` implementation still
  satisfies every requirement below, and closing out previously disclosed, low-severity gaps
  where the team elects to (see §9) — not a ground-up rebuild.

## 3. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | The pipeline MUST define exactly 8 sequential SDLC phases, each mapped 1:1 to an agent definition under `.claude/agents/` and an artifact file under `docs/MDP-7/`: (1) requirements-analysis → `01-requirements.md`, (2) architecture-design → `02-architecture.md`, (3) design-review → `03-design-review.md`, (4) implementation-planning → `04-impl-plan.md`, (5) code-implementation → `05-implementation-summary.md`, (6) code-review → `06-code-review.md`, (7) verification-testing → `07-verification-report.md`, (8) pr-creation → `08-pr-summary.md`. |
| FR-2 | Each phase MUST be executed by its dedicated agent (requirements-agent, architecture-agent, design-review-agent, implementation-planner-agent, implementation-agent, code-review-agent, verification-agent, pr-creator-agent). |
| FR-3 | The orchestrator MUST parse the raw Jira/user-story input (`docs/MDP-7/story.json`) and extract functional requirements, system constraints (NFRs), and acceptance criteria as the output of Phase 1. |
| FR-4 | Pipeline state (current phase, phase status, timestamps) MUST be tracked and persisted in `docs/MDP-7/pipeline-state.json`, with each phase transition recorded (`pending` → `in-progress` → `completed`). |
| FR-5 | The pipeline MUST execute phases strictly in sequence, from requirements analysis through PR creation, without skipping mandatory checkpoints. |
| FR-6 | A human-in-the-loop validation checkpoint MUST occur after Phase 3 (design review), labeled "Design approval before implementation begins", blocking progression to Phase 4 until explicitly approved. |
| FR-7 | After the code-implementation phase, automated test suites MUST be executed, and verification output MUST be written to `docs/MDP-7/07-verification-report.md`. |
| FR-8 | The final phase MUST produce a clean, structured Pull Request summary (title, description, test plan) written to `docs/MDP-7/08-pr-summary.md`. |
| FR-9 | The Task Manager Application MUST support core task-management operations (create, read, update, delete, and status/sync tracking) exposed via a backend API (`backend/src/routes/tasks.ts`, `backend/src/services/taskService.ts`) and consumed by a frontend client (`frontend/src/components/TaskBoard.tsx`, `frontend/src/hooks/useTasks.ts`). List/read operations MUST support pagination via `limit`/`offset` query parameters, clamped server-side to a bounded range (currently `[1, 200]`, default `50`). |
| FR-10 | The application MUST support synchronization of task state with external SDLC systems (GitHub and Jira, via `backend/src/queue/providers/`) through an asynchronous job queue, and MUST expose a sync-health endpoint (`backend/src/routes/syncHealth.ts`, `backend/src/services/syncHealthService.ts`) that reports per-provider pending/failed/successful (ok) sync counts, scoped to currently-existing tasks only. |
| FR-11 | Sync jobs MUST be idempotent per `(taskId, provider)` — concurrent or repeated sync attempts for the same task/provider pair MUST NOT create duplicate external issues/records. |

## 4. Non-Functional Requirements / System Constraints

| ID | Category | Constraint |
|----|----------|------------|
| NFR-1 | Security & Governance | Hardcoded credential values, API keys, tokens, or other sensitive credentials are strictly forbidden in source code or artifacts. Credentials MUST be supplied via dynamic environment variables (e.g., `GITHUB_TOKEN`, `JIRA_API_TOKEN`, `DATABASE_URL`, `REDIS_URL`) or secure local configuration, never written to logs, artifacts, or shared repositories. Only `.env.example` (names/placeholders, no real values) may be committed. |
| NFR-2 | Git Workflow | Direct commits to `main`/`master` are prohibited. All work MUST occur on feature branches, with conventional commit messages (`feat:`, `fix:`, `refactor:`, `docs:`), and branches kept current with upstream before PR creation. `.claude/hooks/no-main-commit.sh` MUST be executed prior to any commit to enforce this. |
| NFR-3 | Code Quality | Code MUST follow clean-code principles, modular structure, and descriptive naming. Business logic MUST be covered by unit and integration tests. Hardcoded/magic values and unhandled exceptions are disallowed — expected failures (e.g., validation) MUST surface as typed/discriminated results, not thrown exceptions, and MUST NOT be silently swallowed. |
| NFR-4 | Consistency | Formatting, type safety, and error handling MUST be consistent across backend and frontend codebases. Both packages MUST compile cleanly under TypeScript `strict: true` (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`). API error responses MUST use a uniform `{ error, message }` shape. |
| NFR-5 | Workflow Integrity | Pipeline state transitions MUST be persisted accurately and atomically in `pipeline-state.json` (see `.claude/lib/atomicWriteJson.ts` — write-to-temp-file + rename) so the pipeline can resume or be audited after interruption. |
| NFR-6 | Auditability | Every phase MUST leave a durable, reviewable artifact (Markdown/JSON) documenting its output, independent of chat/session history. |
| NFR-7 | Human Oversight | Critical-path decisions (notably the post-design-review checkpoint) MUST require explicit human approval before the pipeline advances — no agent may self-approve past this gate. |
| NFR-8 | API Hardening | The backend API MUST enforce, at minimum: (a) a single-origin CORS allowlist (`FRONTEND_ORIGIN`, no wildcard, `credentials: false`); (b) a bounded JSON request body size (currently `100kb`, returning `413` when exceeded); (c) rate limiting on all `/api` routes (currently `express-rate-limit`, 100 requests/minute/IP, returning a structured `429` body `{ error: "rate_limited", message }`). All three controls MUST be covered by automated tests before the corresponding acceptance criterion is considered fully closed — see §9 (gap F-1) for current status. |
| NFR-9 | Credential Hygiene | The project's mandatory pre-commit credential-scanning hook MUST be executed against staged files prior to any commit to block hardcoded keys, credential values, or tokens. |

## 5. Acceptance Criteria (from story.json)

| ID | Category | Criterion |
|----|----------|-----------|
| AC-1 | Functional Requirements | All 8 SDLC phases (`.claude/agents/`) must be mapped to their respective artifact files (`docs/MDP-7/`). |
| AC-2 | Functional Requirements | Pipeline state transitions must be tracked with persistence checks in `docs/MDP-7/pipeline-state.json`. |
| AC-3 | Security & Governance Rules | Hardcoded credential values, API tokens, or other sensitive credentials are strictly prohibited in source code or artifacts. |
| AC-4 | Security & Governance Rules | Direct commits to the main branch are not allowed; proper feature branching must be followed. |
| AC-5 | Quality & Verification Checkpoints | After the implementation phase, test suites must be run and verification output must be saved in `07-verification-report.md`. |
| AC-6 | Quality & Verification Checkpoints | The final step must produce a clean Pull Request summary. |

**Total acceptance criteria: 6** (2 Functional, 2 Security & Governance, 2 Quality & Verification).

### 5.1 Supplementary acceptance criteria (carried forward from the prior run's implementation plan, re-verified against current code)

These are not in `story.json` but were established during the previous run's design/implementation
phases and remain binding for this run's re-verification and any further work:

| ID | Requirement traced | Criterion |
|----|---------------------|-----------|
| AC-7 | FR-9 | `GET /api/tasks` supports `limit`/`offset`; invalid/out-of-range values are clamped, never rejected with an error, and the response includes `{ tasks, total, limit, offset }`. |
| AC-8 | FR-10 | `GET /api/sync-health` returns per-provider counts of `pending`/`ok`/`failed` sync attempts, excluding `SyncLink` rows whose parent task has been deleted. |
| AC-9 | FR-11 | A sync job for a given `(taskId, provider)` acquires a Postgres advisory lock scoped to that pair before reading/writing `SyncLink`, preventing duplicate external-issue creation under repeated/concurrent attempts. |
| AC-10 | NFR-8 | CORS-allow, CORS-reject, and payload-too-large (`413`) each have a passing automated test. **Rate-limiting (`429`) currently does NOT have an automated test — this criterion is only partially met; see gap F-1 in §9.** |
| AC-11 | NFR-3, NFR-4 | `npm test` and `npm run build` pass cleanly (zero failures, zero type errors) in both `backend/` and `frontend/`. |

## 6. Dependencies & Assumptions

- `docs/MDP-7/story.json` is treated as the authoritative source of truth for this phase's extraction.
- Subsequent phases assume this requirements document as their primary input and must not
  re-derive requirements independently.
- The Task Manager Application's backend and frontend source trees **already exist** in this run
  (`backend/`, `frontend/`) — this is a re-run of a previously completed pipeline, not a greenfield
  build. Phases 2–5 of this run should treat the existing implementation as the baseline and
  produce incremental architecture/plan/implementation output (e.g., closing disclosed gaps),
  rather than redesigning or rewriting the application from scratch, unless a genuine requirement
  drift is found.
- An external Jira/GitHub integration is available for sync-health functionality (FR-10),
  authenticated solely via environment-based credentials per NFR-1, and implemented as
  `backend/src/queue/providers/githubProvider.ts` / `jiraProvider.ts`.
- No authentication/authorization model is in scope (an explicit, previously-documented scope
  decision — `Task.assignee` is a free-text field, not a user/session reference). This remains
  unchanged for this run.

## 7. Edge Cases & Risks

- Pipeline interruption mid-phase: state in `pipeline-state.json` must reflect the last
  successfully completed phase, not a partially-written one.
- Human checkpoint rejection after Phase 3: the pipeline must support revision of the architecture
  artifact and re-submission for approval rather than silently proceeding.
- Sync failures with external systems should be surfaced via sync-health status rather than
  failing silently or blocking unrelated task operations.
- Any attempt to bypass branch protection or embed credential values must be rejected at the governance
  level (NFR-1, NFR-2), not merely flagged after the fact.
- Deleting a task that still has an in-flight or historical sync record must not corrupt
  sync-health aggregates; `SyncLink`/`SyncAttempt` rows for a deleted task must be excluded from
  the live sync-health count rather than causing an error or a stale count.
- A burst of API traffic exceeding the rate limit must degrade gracefully (structured `429`), not
  crash the process or silently drop requests — this behavior is implemented but, per NFR-8/AC-10,
  not yet covered by an automated regression test (see §9, F-1).

## 8. Out of Scope (for this phase)

- Architectural/component design decisions (deferred to Phase 2).
- Implementation details and code structure (deferred to Phases 4–5).
- Test case design and execution (deferred to Phase 7).

## 9. Re-run Continuity Notes (this run only)

This is **run 2** of the MDP-7 pipeline (`pipeline-state.json.runNumber: 2`), following a prior
complete run that produced PR #1. This document was regenerated fresh from `story.json` and the
**current** state of `backend/`/`frontend/`, not copied from the prior run's `01-requirements.md`.
Re-verification against the live codebase found the implementation still matches every FR/NFR
above, with the following carried-forward item:

- **Open gap F-1 (Low severity, disclosed in `06-code-review.md` and `07-verification-report.md`
  from the previous run):** `backend/src/app.ts` implements rate limiting via `express-rate-limit`
  (mounted on `/api`, 100 requests/minute/IP, structured `429` body), satisfying the implementation
  requirement in NFR-8. However, unlike the CORS-allow, CORS-reject, and payload-too-large cases
  (all tested in `backend/src/__tests__/app.hardening.test.ts`), **no automated test exercises the
  rate limiter**, confirmed still true as of this run (`backend/src/__tests__/` contains no test
  file or test case matching "rate limit"). This is a test-coverage gap, not a functional defect —
  the middleware itself works as implemented.
  - This is restated here as **AC-10** (§5.1) specifically so it is unambiguous and testable: a
    future implementation pass should add a test to `app.hardening.test.ts` (or a new file) that
    mounts the app, fires more than `RATE_LIMIT_MAX_REQUESTS` (100) requests within the rate-limit
    window against a mounted `/api` route, and asserts that a subsequent request returns HTTP `429`
    with body `{ error: "rate_limited", message: "Too many requests. Please try again later." }`.
  - If the team elects to close this gap in this run's Phase 5 (code-implementation), the above
    test description is the acceptance bar; AC-10/NFR-8 should be marked fully met only once that
    test exists and passes.
- No other drift was found: `.claude/agents/` still contains exactly 8 phase-agent files matching
  FR-1/FR-2; `docs/MDP-7/` still contains the matching 8 artifacts; `backend/prisma/schema.prisma`
  still carries the `@@index` definitions backing FR-9/FR-10 (B-2/B-4/B-1 from the prior design
  review); `backend/src/queue/workers.ts` still acquires the per-`(taskId, provider)` Postgres
  advisory lock backing FR-11/AC-9; `.claude/lib/atomicWriteJson.ts` (backing NFR-5) is present
  and unchanged in approach (temp-file write + rename).
