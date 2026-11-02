---
name: generate-artifacts
description: Use to create or update the phase-numbered SDLC artifacts under docs/artifacts/MDP-7/ (requirements baseline, architecture, design review, implementation manifest, Jira snapshot) from the current state of docs/requirements.md.
---

# Generate MDP-7 Artifacts

Keeps `docs/artifacts/MDP-7/` consistent with `docs/requirements.md`, using
the strict phase-numbered artifact convention. Non-standard file names
(`design.md`, `test-plan.md`, `sync-log.json`) are retired — do not recreate
them.

1. Read `docs/requirements.md` fully before touching any artifact — it is
   the source of truth for scope.
2. `jira_snapshot.json` — raw Jira issue sync data for MDP-7, pulled via
   `mcp__jira__jira_get`; refresh when the live Jira issue changes.
3. `phase-01-requirements.md` — baseline snapshot of `docs/requirements.md`;
   regenerate when requirements change materially.
4. `phase-02-architecture.md` — technical design (system architecture, API
   specs, sync logic) derived from section 5 (stack) and section 3
   (features); update when the stack or feature scope changes.
5. `phase-03-design-review.md` — review feedback/approval checklist AND the
   Test Coverage Checklist (test cases traceable to section 3/4); flag any
   requirement with no corresponding test case.
6. `phase-04-implementation-manifest.md` — human-readable task breakdown,
   kept in sync with the machine-readable `task-breakdown.json` (discrete
   implementation tasks derived from section 3, plus the Jira/GitHub
   field-mapping config referenced by the `sync-to-jira` and
   `sync-to-github` skills).
7. Never introduce scope into an artifact that isn't in requirements.md —
   add it to requirements.md's Open Questions first.
