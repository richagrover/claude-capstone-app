# Phase 01 — Requirements Analysis

**Story Key:** MDP-7
**Title:** Build Task Manager Application with Agentic SDLC Sync
**Issue Type:** Idea
**Status:** Parking lot
**Priority:** Medium
**Reporter:** richa grover
**Created:** 2026-10-26T14:40:22.282+0530

## 1. Overview

As an engineering team, we want to establish a secure, modular, and automated SDLC workflow
using structured agents and strict quality rules, so that we can streamline software delivery
and maintain repository integrity. The system comprises two coupled deliverables:

1. An enterprise-grade **Task Manager Application** (backend + frontend).
2. An **Agentic SDLC pipeline** — a modular, agent-based automation layer (`.claude/` structure)
   that drives the application's development lifecycle through 8 sequential phases, persisting
   state and producing a documentation artifact for each phase.

## 2. Scope

- Modular agent-based architecture under `.claude/` (agents, skills, hooks) that implements each
  SDLC phase as a discrete, independently invokable unit.
- Execution strategy composed of 8 sequential pipeline phases, executed in strict order, with
  state persisted between phases and a human checkpoint before implementation begins.

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
| FR-9 | The Task Manager Application MUST support core task-management operations (create, read, update, delete, and status/sync tracking) exposed via a backend API and consumed by a frontend client. |
| FR-10 | The application MUST support synchronization of task/documentation state with external SDLC systems (e.g., Jira/GitHub) via a sync-health mechanism that reports pending/failed/successful sync counts. |

## 4. Non-Functional Requirements / System Constraints

| ID | Category | Constraint |
|----|----------|------------|
| NFR-1 | Security & Governance | Hardcoded secrets, API keys, tokens, or credentials are strictly forbidden in source code or artifacts. Credentials MUST be supplied via dynamic environment variables (e.g., `GITHUB_TOKEN`) or secure local configuration, never written to logs, artifacts, or shared repositories. |
| NFR-2 | Git Workflow | Direct commits to `main`/`master` are prohibited. All work MUST occur on feature branches, with conventional commit messages (`feat:`, `fix:`, `refactor:`, `docs:`), and branches kept current with upstream before PR creation. |
| NFR-3 | Code Quality | Code MUST follow clean-code principles, modular structure, and descriptive naming. Business logic MUST be covered by unit and integration tests. Hardcoded/magic values and unhandled exceptions are disallowed. |
| NFR-4 | Consistency | Formatting, type safety, and error handling MUST be consistent across backend and frontend codebases. |
| NFR-5 | Workflow Integrity | Pipeline state transitions MUST be persisted accurately and atomically in `pipeline-state.json` so the pipeline can resume or be audited after interruption. |
| NFR-6 | Auditability | Every phase MUST leave a durable, reviewable artifact (Markdown/JSON) documenting its output, independent of chat/session history. |
| NFR-7 | Human Oversight | Critical-path decisions (notably the post-design-review checkpoint) MUST require explicit human approval before the pipeline advances — no agent may self-approve past this gate. |

## 5. Acceptance Criteria (from story.json)

| ID | Category | Criterion |
|----|----------|-----------|
| AC-1 | Functional Requirements | All 8 SDLC phases (`.claude/agents/`) must be mapped to their respective artifact files (`docs/MDP-7/`). |
| AC-2 | Functional Requirements | Pipeline state transitions must be tracked with persistence checks in `docs/MDP-7/pipeline-state.json`. |
| AC-3 | Security & Governance Rules | Hardcoded secrets, API tokens, or sensitive credentials are strictly prohibited in source code or artifacts. |
| AC-4 | Security & Governance Rules | Direct commits to the main branch are not allowed; proper feature branching must be followed. |
| AC-5 | Quality & Verification Checkpoints | After the implementation phase, test suites must be run and verification output must be saved in `07-verification-report.md`. |
| AC-6 | Quality & Verification Checkpoints | The final step must produce a clean Pull Request summary. |

**Total acceptance criteria: 6** (2 Functional, 2 Security & Governance, 2 Quality & Verification).

## 6. Dependencies & Assumptions

- Backend and frontend application source trees are currently absent from the repository
  (intentionally removed as part of a clean restart) and will be recreated during Phases 4–5.
- `docs/MDP-7/story.json` is treated as the authoritative source of truth for this phase's extraction.
- Subsequent phases assume this requirements document as their primary input and must not
  re-derive requirements independently.
- An external Jira/GitHub integration is assumed available for sync-health functionality (FR-10),
  authenticated solely via environment-based credentials per NFR-1.

## 7. Edge Cases & Risks

- Pipeline interruption mid-phase: state in `pipeline-state.json` must reflect the last
  successfully completed phase, not a partially-written one.
- Human checkpoint rejection after Phase 3: the pipeline must support revision of the architecture
  artifact and re-submission for approval rather than silently proceeding.
- Sync failures with external systems should be surfaced via sync-health status rather than
  failing silently or blocking unrelated task operations.
- Any attempt to bypass branch protection or embed secrets must be rejected at the governance
  level (NFR-1, NFR-2), not merely flagged after the fact.

## 8. Out of Scope (for this phase)

- Architectural/component design decisions (deferred to Phase 2).
- Implementation details and code structure (deferred to Phases 4–5).
- Test case design and execution (deferred to Phase 7).
