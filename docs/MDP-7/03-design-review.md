# Phase 03 — Design Review

**Story Key:** MDP-7
**Phase:** 3 — Design Review
**Source reviewed:** `docs/MDP-7/02-architecture.md`
**Checked against:** `docs/MDP-7/01-requirements.md`
**Reviewer:** design-review-agent
**Status of this document:** Technical input for the human-in-the-loop checkpoint (FR-6, NFR-7).
**This agent does not and cannot set `humanCheckpoints[0].status` to `approved`.** That action is
reserved for an explicit human decision outside the agent loop, per §3.3 of the architecture doc
and NFR-7.

## Recommended Verdict: **Approved with Changes**

The architecture is internally consistent, traces cleanly to every FR/NFR/AC in
`01-requirements.md`, and contains no blocking design flaw that would make Phase 4
(implementation planning) unsafe to begin on the pipeline-layer deliverable. However, the
**application layer (backend/frontend, FR-9/FR-10) has gaps that should be closed — or
explicitly accepted as out-of-scope — before Phase 5 writes code**, chiefly a missing
authentication/authorization model, unbounded list/aggregate endpoints, and a sync-job
idempotency race. None of these invalidate the contract fixed in `02-architecture.md`; they are
additions/clarifications a human reviewer should weigh in on before the checkpoint is approved.

---

## 1. Review Scope and Method

Per the `system-architecture` skill, this review checks: (a) component interactions and data
model correctness, (b) adherence to performance/scalability expectations implied by FR-9/FR-10,
and (c) security standards (NFR-1, NFR-3, NFR-4), cross-referenced against every FR/NFR/AC in
`01-requirements.md`. Findings are grouped by Bottlenecks, Scalability, Security, and
Consistency/Governance, each tagged with a severity.

Severity key: **Blocking** (must fix before Phase 4/5), **Should-Fix** (fix in Phase 4 plan or
explicitly accept the risk), **Note** (non-blocking observation / open question for the human).

---

## 2. Findings — Bottlenecks & Performance

| # | Finding | Severity |
|---|---|---|
| B-1 | `GET /sync-health` is specified as computed at read time as `expected − rows with non-null lastStatus` (§4). As task/sync-link volume grows, this is an unindexed aggregate scan on every call with no caching or pagination strategy defined. No expected load is given in requirements, so this is not yet proven a problem, but the design doesn't state a mitigation (e.g., indexed counts, materialized aggregate, or polling interval cap on the frontend). | Should-Fix |
| B-2 | `GET /tasks` has no pagination (`limit`/`offset`/cursor) in the API table (§5) — only filter params. At scale this returns an unbounded array in one response. | Should-Fix |
| B-3 | The diagram shows a single "Sync Worker" box per provider lane; the document doesn't state whether worker concurrency is 1 (serial job processing) or pooled. If serial, a slow/hanging provider API call throttles that provider's entire queue depth, even though lanes are isolated from each other. | Note |
| B-4 | §4 specifies an index only on `SyncAttempt(taskId)` and a unique constraint on `SyncLink(taskId, provider)`. No index is specified on `Task.status`/`Task.assignee`/`Task.priority`, which are exactly the `GET /tasks` filter columns in §5 — likely a full-table scan under those filters at scale. | Should-Fix |

## 3. Findings — Scalability

| # | Finding | Severity |
|---|---|---|
| S-1 | `SyncAttempt` is explicitly append-only/immutable with no retention, archival, or pruning policy. Combined with no enforced FK to `Task` (§4's documented rationale), this table grows unbounded indefinitely, including rows for tasks that no longer exist. This is an intentional trade-off for auditability (NFR-6) but should be an explicit, acknowledged decision rather than a silent gap — a future retention policy (e.g., archive-after-N-days) is reasonable to flag now rather than after the table is large. | Note |
| S-2 | The backend API's statelessness/horizontal-scalability is implied (Express + per-request DB/queue calls) but never stated. No contradiction found, but worth the human confirming this is the intended deployment shape before Phase 5. | Note |
| S-3 | One queue per provider is a good isolation decision (§2, §6) and scales cleanly to additional providers without a redesign, consistent with the `SyncProviderClient` abstraction. No issue found here. | — (positive) |

## 4. Findings — Security

| # | Finding | Severity |
|---|---|---|
| SEC-1 | **No authentication or authorization model is specified anywhere in the document.** `Task.assignee` exists as a field, implying multiple users interact with the system, yet every endpoint in §5 is open with no actor identity, session, or permission check described. This is a materially larger gap than "no hardcoded secrets" (NFR-1) — NFR-1 is satisfied, but general API security is not addressed at all. Requirements (`01-requirements.md`) don't explicitly demand authN/authZ either, so this may be legitimately out-of-scope for this story — but that should be an explicit human call, not a silent omission, before implementation. | **Should-Fix (confirm scope)** |
| SEC-2 | No CORS policy is specified for the frontend↔backend boundary (§2 shows direct REST/JSON calls). Omission could default to an overly permissive implementation in Phase 5 absent an explicit constraint here. | Should-Fix |
| SEC-3 | No request payload size limits are specified (e.g., `description` length, `labels[]` size). Combined with no rate limiting on `/api/tasks`, this is a resource-exhaustion vector at the API boundary. | Note |
| SEC-4 | NFR-1 (secrets) is well covered: §7 and §9 correctly scope credentials to the provider-adapter layer only, env-var-sourced, never logged (`lastError`/`detail` are explicitly restricted to human-readable text). This is correctly designed and matches `.claude/rules/secrets.md`. | — (positive) |
| SEC-5 | Error-handling contract (§5, §5.2) correctly avoids leaking stack traces/internal detail, consistent with NFR-3/NFR-4. | — (positive) |

## 5. Findings — Consistency / Governance (NFR-3..NFR-7)

| # | Finding | Severity |
|---|---|---|
| G-1 | **Sync-job idempotency race:** §6 step 3 determines create-vs-update by checking "no existing `SyncLink.externalKeyOrUrl`." If two jobs for the same task/provider are enqueued before the first resolves (e.g., two rapid field updates before the initial `create` lands), both could evaluate "no link yet" and both call the provider's create operation, producing a duplicate external issue. The document doesn't specify a lock, dedupe key, or per-task/provider job serialization to prevent this. | **Should-Fix** |
| G-2 | `pipeline-state.json` is the single source of truth for resumability (NFR-5), but the document doesn't specify that writes to it are atomic (e.g., write-to-temp-then-rename) or guarded against concurrent writers. §3.2's "never a partially-written one" guarantee is asserted but the *mechanism* ensuring it isn't named. This is the one gap in the pipeline-layer design (the half of the system this review gates most directly per NFR-7). | Should-Fix |
| G-3 | Human checkpoint design (§3.3) correctly and unambiguously prevents any agent — including this one — from self-approving. This matches `.claude/rules/workflow-state.md` and NFR-7 exactly. No issue found. | — (positive) |
| G-4 | Git workflow (§7, NFR-2 row) correctly restricts PR creation to Phase 8 only, on a feature branch, matching `.claude/rules/git.md`. No issue found. | — (positive) |
| G-5 | Delete-closes-linked-issue design (§4 rationale for unenforced FK) is sound and directly traces to the edge case in `01-requirements.md` §7 ("sync failures surfaced via sync-health... not blocking unrelated task operations"). No issue found. | — (positive) |

## 6. Requirements Traceability Check

All FR/NFR/AC from `01-requirements.md` have a corresponding mechanism in `02-architecture.md`
(see its own §7/§8 tables); this review did not find a requirement left unaddressed. The findings
above are additions/risks the architecture doc doesn't yet cover, not contradictions of stated
requirements — AC-3 (no hardcoded secrets) and AC-4 (no direct main commits) in particular are
fully and correctly satisfied as designed.

## 7. Summary for the Human Checkpoint

**Nothing above blocks Phase 4 from starting on the pipeline-layer work.** For the
application-layer contract that Phase 5 will implement against, the human reviewer should decide,
before approving, whether:

1. Authentication/authorization is in- or out-of-scope for this story (SEC-1) — if in-scope, the
   contract in §5 of the architecture doc needs an actor/permission model added.
2. The sync-job idempotency race (G-1) needs a locking/dedupe mechanism specified now, or can be
   deferred to Phase 4's implementation plan as a required task.
3. Pagination (B-2) and the missing filter-column indexes (B-4) should be added to the data model
   now or left as a Phase 4 implementation detail within the existing contract.

None of these require re-deriving the architecture from scratch; they are scoped, additive
clarifications. This review's recommendation is **approved with changes** rather than rejected,
on the basis that the core design is sound and these items can be resolved as targeted amendments
or accepted risks at the human's discretion.

---
*This document is the design-review-agent's output for Phase 3. Per `02-architecture.md` §3.3 and
NFR-7, `docs/MDP-7/pipeline-state.json` → `humanCheckpoints[0].status` remains
`awaiting-response` until a human explicitly records approval or requests changes; this agent
does not modify that file.*
