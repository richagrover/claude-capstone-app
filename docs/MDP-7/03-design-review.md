# MDP-7: Design Review

**Phase:** 03 - Design Review
**Reviewed artifact:** `docs/MDP-7/02-architecture.md`
**Checked against:** `docs/MDP-7/01-requirements.md`
**Status:** Human-in-the-loop checkpoint (NFR-1.2) — this review gates phase 4 and must not be
treated as the human approval itself; it is the technical input to that approval.

## Verdict

**APPROVED WITH CHANGES**

The data model, API surface, queue-isolation strategy, and the FK-omission rationale are sound
and internally consistent with the stated edge cases. However, the architecture has one real
internal inconsistency (worker-process isolation), one unaddressed data-integrity risk (sync job
ordering), a materially underspecified area relative to FR-3/FR-5.2 (frontend architecture), and
several read-time performance/scalability gaps that should be resolved — or explicitly deferred
with a documented decision — before phase 4 (implementation planning) begins. None of these
require a redesign of the data model or API; they are additions/clarifications to the existing
document. Section 7 of `02-architecture.md` ("Open Design Questions: None blocking") understates
the number of open items below and should be revised.

---

## 1. Performance Findings

### 1.1 `/sync-health` aggregation cost (Required change)
The "pending" formula — `expected (existing tasks × configured providers) − rows with a
non-null lastStatus, scoped to currently-existing tasks` — cannot be computed from `SyncLink`
alone, because `SyncLink.taskId` is intentionally **not** an FK to `Task` (§2 rationale, which
this review agrees with — see §5.1). Scoping "currently-existing tasks only" therefore requires
a **join** between `SyncLink` and `Task` on every call to `GET /sync-health` (e.g.
`SyncLink JOIN Task ON SyncLink.taskId = Task.id`), not a simple count. The document does not
state this explicitly, and does not specify a supporting index for it. The unique constraint on
`SyncLink` is `(taskId, provider)` — good for point lookups, but not an ideal leading-column
choice for a query that aggregates/groups by `provider` across the whole table. **Action:**
document the join explicitly and add a secondary index on `(provider, lastStatus)` (or
equivalent) on `SyncLink`, or state a caching/materialization strategy if call frequency
(dashboard polling) makes a live join per request too expensive at target scale.

### 1.2 Unbounded `failing: [...]` payload (Required change)
The `GET /sync-health` response shape includes `failing: [...]` with no stated cap, pagination,
or field projection. As `SyncAttempt`/`SyncLink` failure rows accumulate, this array grows
unbounded and will eventually dominate the response payload and query cost. **Action:** specify
a limit (e.g. most-recent N failing links per provider) and the exact fields returned.

### 1.3 No pagination on `GET /tasks` (Flag — not blocking, but should be an explicit decision)
`01-requirements.md` FR-2.2 does not mandate pagination, and `02-architecture.md` doesn't add
it. Given the stated "enterprise-grade" ambition (01-requirements.md §1) and a task table that
only grows, returning the full filtered result set on every list call is a scalability risk.
This isn't a defect against the stated requirements, but the architecture should either state a
pagination contract now (cheaper to add before the API is implemented) or explicitly record the
decision to defer it, rather than leaving it unstated.

---

## 2. Security Findings

### 2.1 Credential leakage via process logs is not addressed (Required change)
NFR-2.2 explicitly requires secrets are "never written into logs" — not just never persisted to
`SyncLink`/`SyncAttempt`/API bodies. §5's NFR-2.3 traceability row only covers `lastError`,
`detail`, and API error bodies; it does not say anything about what the provider adapter does
with the raw error object it catches from the GitHub/Jira SDK/HTTP client before it is reduced
to the sanitized string stored in `lastError`/`detail`. Many HTTP client libraries attach the
full outgoing request (including `Authorization` headers) to thrown error objects; a worker that
does something as innocuous as `console.error(err)` or passes `err` wholesale to a logger would
leak the token into process logs even though the DB/API path is clean. **Action:** add an
explicit statement that the adapter layer extracts only a fixed, known-safe set of fields
(status code, provider-defined message) from any caught error before it leaves the adapter —
never the error object itself, and never to a general-purpose logger.

### 2.2 No authentication/authorization model (Flag — scope clarification needed)
Neither `01-requirements.md` nor `02-architecture.md` defines any authentication/authorization
for the REST API. This may be intentionally out of scope for this iteration, but given the
"enterprise-grade" framing, the architecture should say so explicitly (e.g. "single-tenant,
no-auth for this phase; auth is a future increment") rather than being silent, so this isn't
mistaken for an oversight later.

### 2.3 Token-leak mitigation is otherwise sound
The explicit "credentials flow only into the provider adapter layer... no other layer ever sees
a raw token" boundary (§1), the env-var-only configuration surface (§6), and the
NFR-2.3-sanitized `lastError`/`detail` fields are a correct and sufficient design **once 2.1
above is closed**.

---

## 3. Scalability Findings

### 3.1 Single "Sync Worker process" box contradicts the stated provider-isolation guarantee (Internal inconsistency — required change)
§1's component diagram draws **one** "Sync Worker process" box receiving from both the
`sync-github` and `sync-jira` queues. §1's prose and §4 step 5 claim "a Jira outage cannot block
GitHub sync, and vice versa" (EC-9, NFR-5.1). Those two statements are only true if the two
providers' job processing is isolated at the **process** level (or at minimum fully isolated at
the event-loop/thread level with independent concurrency limits) — a single shared Node process
running both provider workers means an unhandled exception, memory exhaustion, or a
synchronous/CPU-bound bug in the GitHub adapter can starve or crash the process that is also
running the Jira worker, which does block Jira sync. The document needs to pick one and say so:
(a) two separate worker processes (one per provider), or (b) one process with two independent,
fault-isolated worker instances plus an explicit statement of what happens to the still-healthy
provider's worker if the process crashes. As written, the diagram and the guarantee it's
supposed to illustrate disagree.

### 3.2 No ordering/idempotency guarantee for sync jobs on the same task (Required change — data-integrity risk)
§4 step 2 notes each job's payload is "a snapshot of the task's mapped fields captured at enqueue
time" specifically so a `close` job doesn't need to re-read a possibly-deleted `Task` row. That
solves the deleted-task case, but it introduces a different, unaddressed problem: if a task is
updated twice in quick succession, two `update` jobs are enqueued back-to-back with two different
snapshots. If the first job hits a transient failure and is retried (§4 step 5's bounded backoff)
while the second job succeeds immediately, the first job's eventual retry can complete **after**
the second job and overwrite `SyncLink.lastSyncedAt`/`lastError`/`lastStatus` with an older
snapshot's result — silently reverting the externally-visible sync state to a stale value. This
is the sync-pipeline analogue of EC-5 ("concurrent updates... must not corrupt data;
last-write-wins... must be deterministic"), but EC-5's `updatedAt` tiebreaker is defined only for
the `Task` row, not for `SyncLink` writes coming out of out-of-order job completions. **Action:**
either (a) stamp each job with a monotonic sequence number or the source task's `updatedAt` at
enqueue time and have the worker reject/skip writing a result that is older than the link's
current `lastSyncedAt`-associated sequence, or (b) de-duplicate/coalesce same-task-same-provider
jobs in the queue so only the latest supersedes pending ones. Either is a small addition to §4;
leaving it unaddressed is a real correctness gap, not a hypothetical one.

### 3.3 `SyncAttempt` retention/growth has no stated policy (Required change)
`SyncAttempt` is explicitly append-only and is written on every sync attempt for every
provider, including every retry (§4 steps 4-5) and every task mutation that touches a
sync-relevant field. There is no retention, archival, partitioning, or pruning policy anywhere
in the document, and §7 ("Open Design Questions: None blocking") doesn't list it as deferred
either — it's simply absent. For a long-lived system this table grows without bound. This
doesn't need to be solved now, but it must be a recorded decision (e.g. "no retention policy in
this phase; revisit once volume data exists") rather than silently missing, since unbounded
table growth also feeds back into the §1.1 read-time aggregation cost.

### 3.4 Per-provider queue isolation design itself is sound
Independent queues per provider (`sync-github`, `sync-jira`) correctly satisfies EC-9 at the
*queueing* level — a backlog or outage on one queue doesn't block jobs from draining the other.
This is a good mechanism; it's the *worker execution* isolation (§3.1 above) that needs
clarification, not the queue topology.

---

## 4. Completeness Against `01-requirements.md`

| Requirement | Status | Note |
|---|---|---|
| FR-1 (data model) | Addressed | §2 fully covers FR-1.1/1.2. |
| FR-2 (CRUD API) | Addressed | §3 table covers all five sub-items including error semantics. |
| FR-3.1/3.2 (list/filter UI) | **Underspecified** | The component diagram reduces the entire frontend to one box ("task list/filter forms, sync-health view"). There is no description of how filter state maps to the `GET /tasks` query params, how the list renders `syncStatus[]` badges, or any frontend component/state-management approach. |
| FR-3.3 (create/edit/delete forms surfacing API validation errors) | **Underspecified** | No description of how the structured `{error, message}` body (§3) is surfaced in the UI. Given the backend error contract is explicitly designed (§3.2), the frontend side of that contract should get at least a paragraph. |
| FR-4.1-4.4 (provider sync) | Addressed | §2 `SyncLink`, §4 pipeline, `SyncProviderClient` interface in §1 all map cleanly to FR-4.1/4.2/4.3/4.4. |
| FR-5.1 (sync-health endpoint) | Addressed, with gaps | Endpoint shape is defined in §3, but see §1.1/§1.2/§4 (unavailable-vs-pending, below) for underspecified parts of it. |
| FR-5.2 (frontend sync-health view) | **Underspecified** | Same gap as FR-3 — "sync-health view" is named in the diagram only, no further detail. |
| FR-5.3 (pending ≠ failed) | Addressed, but see below | The derivation logic (§2) is correct in principle but doesn't distinguish "never attempted" from "provider not configured" — see 4.1 below. |
| AC-1 / AC-2 / NFR-1.1 | Addressed (correctly deferred to orchestrator) | §5 explicitly defers phase/state bookkeeping to the orchestrator rather than self-reporting — appropriate for an architecture document. |
| AC-3 / NFR-2.1/2.2 | Addressed | §5, §6. |
| AC-4 / NFR-3 | Out of scope for this document (process-level) | Reasonable omission — branching/PR mechanics aren't a system-architecture concern. |
| AC-5 / NFR-4.1/4.3 | Addressed | §5 ties testability to the service-layer separation; actual execution is correctly deferred to phase 7. |
| AC-6 / D-6 | Addressed | §5. |
| NFR-4.2 (no magic values) | Partially addressed | §6 correctly defers `GITHUB_REPO`/`JIRA_PROJECT_KEY` values to implementation time rather than fabricating them — good. Not evaluable further until implementation. |
| NFR-5.1/5.2 / D-5 | Addressed, with the caveats in §3.1/3.2 above | |
| D-1 through D-4 | Addressed or correctly out of scope | |
| EC-1 through EC-4 | Addressed | §3/§3.2. |
| EC-5 | Addressed for `Task`, gap for `SyncLink` | See §3.2 above — the same principle (deterministic resolution of concurrent writes) isn't carried through to sync-job completion ordering. |
| EC-6 | Addressed, and the FK rationale is correct | See §5.1. |
| EC-7 | Addressed | Bounded retry + backoff, §4 step 5. |
| EC-8 | Addressed | §2 pending-derivation logic. |
| EC-9 | **Partially addressed — ambiguous** | See 4.1 below: "unavailable" (no credentials) and "pending" (attempted-but-not-yet-resolved, or never-attempted) are conflated into the same bucket in the `SyncResult` enum (`ok`/`failed` only) and the `/sync-health` response shape (`synced`/`pending`/`failed`), even though EC-9's own wording treats "unavailable" and "pending" as related but distinguishable outcomes. |
| EC-10 through EC-13 | Out of scope for this document (process-level, correctly deferred) | |

### 4.1 "Unavailable" (unconfigured provider) is not a distinguishable state (Required change)
§4 step 6 says an unconfigured provider's jobs "short-circuit... to a `pending`/'unavailable'
outcome." But `SyncResult` only has two values (`ok`, `failed`), and the `/sync-health` response
shape only has three buckets (`synced`, `pending`, `failed`) — there is no field anywhere that
lets an operator distinguish "Jira has never been attempted because no task has triggered a sync
yet" from "Jira is entirely unconfigured and will never succeed until someone sets
`JIRA_API_TOKEN`." FR-5.2 requires the operator to "see integration health at a glance" — folding
a structurally-permanent condition (missing credentials) into the same bucket as a transient one
(attempt in flight) undermines that at-a-glance goal. **Action:** either add a distinct
`unavailable`/`unconfigured` indicator to the `/sync-health` response per provider (it doesn't
need to be a new `SyncResult` enum value stored in the DB — it can be a runtime flag the
sync-health service adds based on whether that provider's env vars are present), or explicitly
document the decision to conflate them and accept the reduced operator visibility.

---

## 5. Internal Consistency Findings

### 5.1 FK-omission rationale for `SyncLink`/`SyncAttempt` — consistent, no changes needed
Traced the full chain: `DELETE /api/tasks/:id` commits the `Task` row deletion **synchronously**
(§4 step 1, "commits to Postgres first"); the `close` job is enqueued and executes
**asynchronously** afterward (§4 step 2-4). By the time that job's result is written, the `Task`
row is already gone — which is exactly the scenario the rationale in §2 describes. A restrictive
FK would indeed reject that write, and `ON DELETE CASCADE` would indeed destroy the audit trail
FR-4.3 requires. The design is self-consistent on this point and the review agrees with the
decision as documented.

### 5.2 Fixed, system-wide provider targets (`GITHUB_REPO`, `JIRA_PROJECT_KEY`) — note, not a defect
§6 implies a single fixed target repo/project for *all* synced tasks, system-wide, rather than a
per-task-configurable target. This is a reasonable simplification consistent with FR-4.1 (which
doesn't require per-task target selection), but the document should say so explicitly (one
sentence) rather than leaving it to be inferred from the configuration-surface table, since it's
a real product-behavior constraint (all tasks sync into one repo/project) that a reader could
otherwise miss.

### 5.3 §7 "Open Design Questions: None blocking" is inconsistent with this review's findings
Given §3.1 (worker isolation contradicts a stated guarantee) and §3.2 (sync write ordering), at
least these two are blocking in the sense that they affect correctness/reliability guarantees the
document itself claims to provide. §7 should be updated once these are resolved, rather than
asserting no open questions exist.

---

## 6. Required Modifications Summary (for phase-4 entry)

1. Resolve the worker-process isolation contradiction (§3.1) — pick single- or multi-process
   isolation and update the diagram and prose to agree.
2. Add an ordering/idempotency safeguard for sync job writes to `SyncLink` (§3.2).
3. Add a distinct "unavailable/unconfigured" signal to the sync-health response, or explicitly
   document the decision not to (§4.1).
4. Document the error-sanitization mechanism at the adapter boundary so raw provider errors never
   reach a general logger (§2.1).
5. Document the join/index strategy (or caching) backing `/sync-health` aggregation, and cap the
   `failing[]` array (§1.1, §1.2).
6. Record a `SyncAttempt` retention/archival decision, even if it's "deferred" (§3.3).
7. Add a short frontend-architecture subsection addressing FR-3.1/3.2/3.3 and FR-5.2 (§4 table).
8. State the no-pagination and no-auth decisions explicitly if they are intentional (§1.3, §2.2).
9. Add one sentence confirming the fixed, system-wide (not per-task) provider target assumption
   (§5.2).
10. Update §7 to reflect the above rather than "None blocking."

None of these require changing the core data model, the REST contract in §3, or the FK-omission
decision in §2 — all are additive clarifications or small mechanism specifications. Once
addressed, this design is ready for the human sign-off checkpoint (NFR-1.2) that gates phase 4.
