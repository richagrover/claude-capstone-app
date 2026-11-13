# Phase 03 — Design Review

**Story Key:** MDP-7
**Phase:** 3 — Design Review
**Source reviewed:** `docs/MDP-7/02-architecture.md` (Run 2 — as-built re-derivation, adds §6
hardening/idempotency, §7 frontend layer, AC-7..AC-11 traceability)
**Checked against:** `docs/MDP-7/01-requirements.md` (Run 2)
**Also checked against source:** `backend/src/app.ts`, `backend/src/queue/workers.ts`,
`backend/src/services/syncHealthService.ts`, `backend/src/validation.ts`,
`backend/prisma/schema.prisma`, `backend/src/__tests__/app.hardening.test.ts`
**Reviewer:** design-review-agent
**Status of this document:** Technical input for the human-in-the-loop checkpoint (FR-6, NFR-7).
**This agent does not and cannot set `humanCheckpoints[0].status` to `approved`.** That action is
reserved for an explicit human decision outside the agent loop, per `02-architecture.md` §3.3 and
NFR-7. This agent also does not modify `docs/MDP-7/pipeline-state.json` (orchestrator-owned).

## Recommended Verdict: **Approved with Changes**

`02-architecture.md` is internally consistent, traces to every FR/NFR/AC in `01-requirements.md`,
and — on spot-check against the actual `backend/src/` source — accurately describes the
pipeline-layer design, the hardening middleware stack, and the sync-idempotency fix. Nothing found
here blocks Phase 4 from proceeding on the pipeline-layer work, and **AC-10's rate-limit test is
confirmed architecturally sound as scoped**: no change to `app.ts`/`routes/`/`services/` is
required, only the test described in §6.3. However, this review found **one real documentation
gap** (an in-process cache that materially affects the sync-health read path is implemented but
absent from the document) and **one deployment-topology assumption that the document should state
explicitly** rather than leave implicit (reverse-proxy / `trust proxy` handling for the rate
limiter). Both are "Should-Fix" — closeable as a targeted amendment to `02-architecture.md`, not a
reason to reject or redesign.

---

## 1. Review Scope and Method

Per the `system-architecture` skill, this review checks: (a) component interactions and data
model correctness, (b) bottlenecks/scalability implied by FR-9/FR-10/NFR-8, and (c) security
standards (NFR-1, NFR-3, NFR-4, NFR-8), cross-referenced against every FR/NFR/AC in
`01-requirements.md`, plus a direct read of the source files the document claims to describe
(listed above) rather than taking the document's claims at face value. Severity key: **Blocking**
(must fix before Phase 4/5), **Should-Fix** (amend the doc, or fix in Phase 4/5, or explicitly
accept as a documented risk), **Note** (non-blocking observation / carried forward).

---

## 2. Findings — Bottlenecks & Performance

| # | Finding | Severity |
|---|---|---|
| B-5 | **Undocumented in-process cache on the sync-health read path.** `backend/src/services/syncHealthService.ts` wraps `computeSyncHealth` in a 5-second (`SYNC_HEALTH_CACHE_TTL_MS`) in-memory `Map`-based TTL cache, keyed by provider filter. `02-architecture.md` §4/§5/§5.2 describe `GET /sync-health` purely as a live `groupBy` aggregate and never mention this cache — yet the cache is real, is referenced by `04-impl-plan.md` M12.1 (which the frontend's `SYNC_HEALTH_POLL_INTERVAL_MS` is explicitly tuned against, per `frontend/src/hooks/useSyncHealth.ts`), and changes the actual read/consistency behavior of the endpoint. A document claiming to be "re-derived by reading the source tree directly" (§0) should describe it. See §4 below for the scalability angle. | Should-Fix |
| B-6 | `computeSyncHealth`'s `failing` array is hard-capped at `FAILING_LIST_PAGE_SIZE = 50` with no `limit`/`offset` and no total count for the failing set. `02-architecture.md` §5's response-shape table lists `failing: FailingTaskSummary[]` with no mention of this cap. If failing syncs exceed 50, the remainder are silently invisible via the API (not an error, not surfaced as truncated) — worth either documenting as an accepted limit or giving `failing` the same `total`/pagination treatment §5.1 gives `GET /tasks`. | Note |
| B-3 (carried) | Previous review's worker-concurrency note is now fully resolved and the document is correct about it (`QUEUE_CONCURRENCY`, confirmed present in `backend/src/queue/workers.ts::getConfiguredConcurrency`). No remaining issue. | — (positive, confirmed) |

## 3. Findings — Scalability

| # | Finding | Severity |
|---|---|---|
| S-4 | **The sync-health TTL cache (B-5) is per-process state.** If the backend is ever run as more than one instance (standard horizontal-scaling shape for an Express/Node API behind a load balancer), each instance holds its own cache, so two concurrent requests to `/api/sync-health` can return different counts for up to 5 seconds depending on which instance answers — not a correctness bug (eventual convergence, bounded staleness), but it does mean the backend is **not** the fully stateless service §2/§8 implicitly assume. The document should state the intended deployment shape (single instance, sticky routing, or "staleness across instances is accepted") the same way it already states other trade-offs explicitly (e.g., §4's FK rationale, §7's shared-types rationale). This is the same gap the previous run flagged as **S-2** ("statelessness implied but never stated") — still open, now with a concrete mechanism (the cache) that makes it matter in practice rather than being purely theoretical. | Should-Fix |
| S-1 (carried) | `SyncAttempt` remains unbounded/append-only with no retention or archival policy — same accepted trade-off the previous review noted (**S-1**), still correctly justified for auditability (NFR-6) and still not restated or re-affirmed anywhere in this revision's §12 changelog. Recommend a one-line note in a future revision explicitly re-affirming this is still an accepted trade-off, so it doesn't read as an oversight. | Note |
| S-3 (carried) | One BullMQ queue per provider remains a sound, confirmed-correct isolation decision that scales to additional providers without redesign. No issue. | — (positive) |

## 4. Findings — Security

| # | Finding | Severity |
|---|---|---|
| SEC-6 | **Rate limiter IP-keying depends on an undocumented deployment-topology assumption.** `backend/src/app.ts` mounts `express-rate-limit` with its default key generator (`req.ip`); no `app.set("trust proxy", ...)` appears anywhere in `app.ts` or elsewhere in `backend/src`. In the common production topology — the Express process sitting behind a reverse proxy or load balancer — Express will not read `X-Forwarded-For` without `trust proxy` configured, so `req.ip` resolves to the proxy's address for *every* client, collapsing the per-client limiter into one shared global bucket (100 req/min for the whole proxy, not per caller). This is a real gap in the control's effectiveness under a plausible deployment shape, not merely a missing test. It does not require a structural redesign — likely a one-line `app.set("trust proxy", <value>)` plus a stated assumption about the proxy's `X-Forwarded-For` trustworthiness — but `02-architecture.md` §6.1's claim that "no architectural change is required for NFR-8/AC-10" is only correct for the direct-connection topology the current test (§6.3) exercises. The document should state its deployed topology assumption explicitly (direct-connect vs. behind a trusted proxy) so this is a conscious decision, not a silent gap. | **Should-Fix** |
| SEC-4 (carried) | NFR-1 (credential handling) remains correctly designed: confirmed in source that `backend/src/queue/providers/*.ts` are the only files touching `process.env.GITHUB_TOKEN`/`JIRA_API_TOKEN`, and `SyncLink.lastError`/`SyncAttempt.detail` only ever receive `error.message` or an external key/URL (confirmed in `workers.ts::processSyncJob`), never a header or credential value. | — (positive, confirmed) |
| SEC-2/SEC-3 (carried) | Confirmed by direct source read: `app.ts`'s CORS allowlist, JSON body-size limit, and rate-limiter configuration match §6.1's table exactly (origin check, `credentials: false`, method allowlist, `100kb`, `windowMs`/`max`/handler body). `backend/src/__tests__/app.hardening.test.ts` confirmed to already cover CORS-allow, CORS-reject, and payload-too-large, and confirmed to **not** contain any rate-limit test — exactly as §6.3 and `01-requirements.md` §9 (gap F-1) state. | — (positive, confirmed) |
| SEC-1 (carried) | No authN/authZ remains an explicit, documented, previously-accepted scope decision (`01-requirements.md` §6), correctly reflected in `02-architecture.md` (`Task.assignee` noted as free-text, not a session reference). No new issue; re-affirmed, not reopened. | — (positive, confirmed) |

## 5. AC-10 Evaluation — Is the rate-limit test architecturally sound as scoped?

**Yes, with one caveat called out above (SEC-6).** Specifically:

- The middleware itself (`windowMs = 60_000`, `max = 100`, the `429` handler's exact
  `{ error: "rate_limited", message }` body) is confirmed, by direct source read, to already match
  NFR-8(c) and the AC-10 assertion text verbatim. No change to `app.ts` is needed to make the
  *logic* correct. Per `01-requirements.md` §5.1, AC-10 is only "fully met" once that test also
  lands and passes in Phase 7 — this document's role (per its own §6.3) is to confirm there is
  nothing architectural left to resolve first, which this review agrees with.
- The test shape in §6.3 (fire `RATE_LIMIT_MAX_REQUESTS` requests, assert the 101st returns `429`
  with the exact literal body, co-located in `app.hardening.test.ts` using the existing
  `vi.mock(...)`/`supertest(app)` harness already present in that file) is consistent with the
  file's existing pattern (confirmed by direct read) and is sufficient to verify the middleware's
  in-process behavior. **No design change is required for this test to be written in Phase
  5/verified in Phase 7** — confirming the document's own conclusion in §6.1/§6.3.
- The caveat: that test, run via `supertest` against an in-process `createApp()` instance, cannot
  and will not exercise SEC-6 (the `trust proxy`/reverse-proxy keying question), because there is
  no intermediary proxy in that test harness. A green test result should therefore be read as "the
  rate-limit control's internal logic is correct," not as "the rate limiter will correctly key
  per-client in the real deployment topology." These are two different claims, and only the first
  is what AC-10 as written actually tests. Recommend the human reviewer either (a) accept this as a
  known, separate follow-up (track it as a new gap, analogous to how F-1/AC-10 itself was tracked
  last run), or (b) ask for a one-line `trust proxy` decision to be added to `02-architecture.md`
  §6.1/§11 now, before Phase 4.

Net: **approve AC-10's scoping decision (test-only, no app.ts change) as sound; do not conflate it
with SEC-6, which is a distinct, pre-existing, un-tracked gap this review is raising for the first
time.**

## 6. Findings — Consistency / Governance (NFR-3..NFR-9)

| # | Finding | Severity |
|---|---|---|
| G-1 (carried, resolved) | Sync-job idempotency race is confirmed resolved by direct source read: `workers.ts::processSyncJob` acquires `pg_advisory_xact_lock(hashtext($1 || ':' || $2))` as the first statement inside the same `$transaction` that does the create/update decision, provider call, `SyncLink` upsert, and `SyncAttempt` insert — matching §6.2's description exactly, including the failure-bookkeeping-before-rethrow behavior. | — (positive, confirmed) |
| G-2 (carried, resolved) | Atomic `pipeline-state.json` writes via `.claude/lib/atomicWriteJson.ts` (temp-file + rename) are confirmed present per §3.2, closing the previous review's **G-2**. | — (positive, confirmed) |
| B-2/B-4 (carried, resolved) | Pagination (`clampLimit`/`clampOffset`, confirmed present in `backend/src/validation.ts` with exactly the `[1,200]`/default-`50` behavior §5.1 describes) and the three `Task` filter-column indexes (confirmed present in `schema.prisma`: `status`, `assignee`, `priority`) both resolve the previous review's **B-2**/**B-4** as claimed. | — (positive, confirmed) |
| B-1 (carried, resolved — see B-5) | The `SyncLink(provider, lastStatus)` index resolving **B-1** is confirmed present in `schema.prisma`. Note the *additional* mitigation (the TTL cache, B-5/S-4) is real but undocumented — the index alone was the previously-promised fix and is delivered; the cache is a bonus the doc should now describe. | — (positive, with the B-5 caveat) |
| G-6 | §3.3's human-checkpoint design and §8's governance table are unchanged from the prior run and remain correct: no agent (including this one) sets `humanCheckpoints[0].status`, and this document does not touch `pipeline-state.json`. Matches `.claude/rules/workflow-state.md` and NFR-7 exactly. | — (positive) |

## 7. Requirements Traceability Check

Every FR/NFR/AC in `01-requirements.md` has a corresponding, and in the spot-checks above
*source-confirmed*, mechanism in `02-architecture.md`. No requirement is left unaddressed. The
findings in this review are additions/clarifications the architecture document should incorporate
(B-5, S-4, SEC-6) or carry-forward notes already accepted (S-1, B-6) — none contradict a stated
requirement, and none require re-deriving or rewriting the application layer described in §4–§7.

## 8. Summary for the Human Checkpoint

**Nothing above blocks Phase 4 from starting.** Before approving this checkpoint, the human
reviewer should decide:

1. Whether `02-architecture.md` should be amended now to document the sync-health TTL cache (B-5)
   and the per-instance staleness/statelessness implication (S-4) — a short addition to §4/§5.2/§8,
   not a redesign.
2. Whether the rate-limiter's `trust proxy` / reverse-proxy keying assumption (SEC-6) needs a
   stated decision in §6.1/§11 now, or can be tracked as a new, separate gap (the way F-1/AC-10
   itself was tracked last run) to close alongside or after the AC-10 test lands in Phase 5/7.
3. **AC-10 itself requires no further design decision** — this review confirms the test as scoped
   in §6.3 is correct and sufficient for what AC-10 actually asserts; proceed to write it in Phase
   5 as planned.

None of these require re-deriving the architecture from scratch; they are scoped, additive
clarifications to an already-accurate, source-verified document. This review's recommendation is
**approved with changes**, on the basis that the core design — and its correspondence to the
actual `backend/`/`frontend/` source — is sound, and the open items are documentation amendments
or explicitly-trackable follow-ups, not blocking defects.

---
*This document is the design-review-agent's output for Phase 3. Per `02-architecture.md` §3.3 and
NFR-7, `docs/MDP-7/pipeline-state.json` → `humanCheckpoints[0].status` remains unchanged by this
agent until a human explicitly records approval or requests changes; this agent does not modify
that file.*
