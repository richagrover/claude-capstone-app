# Hooks — Task Manager (MDP-7)

Draft hook wiring for the multi-agent SDLC workflow.

- `hooks.json` — PostToolUse hook that fires on `Edit`/`Write`, calling
  `log-artifact-change.sh`.
- `log-artifact-change.sh` — **retired as a no-op.** It used to append an
  entry to `docs/artifacts/MDP-7/sync-log.json` whenever `docs/requirements.md`
  or a file under `docs/artifacts/MDP-7/` was edited. That file was removed
  when the artifacts under `docs/artifacts/MDP-7/` moved to the strict
  phase-numbered convention (`phase-01..04-*`, `jira_snapshot.json`), which
  has no append-only SDLC log. The script now just exits 0.

**Not yet wired up:** `hooks.json` here is a reference definition. To make
it active, merge its `hooks` block into `.claude/settings.json` (project
settings) — Claude Code reads hook config from settings files, not
automatically from this folder, unless this is packaged as a plugin. Since
the script is now a no-op, wiring it up would do nothing useful as-is.

## Phase gates (not Claude Code hooks)

- `pre-phase.json` — per-pipeline-stage validation checks (what must be
  true before `orchestrator.agent.md` delegates to a stage's sub-agent, and
  who to route to if a check fails).
- `post-phase.json` — per-pipeline-stage state updates (which
  `docs/artifacts/MDP-7/` files must be updated, and who to hand off to,
  once a stage succeeds/fails/is blocked).

These two are **not** Claude Code `PreToolUse`/`PostToolUse` hooks — there's
no native tool-level event for an orchestrator "phase" (a phase is several
tool calls inside a delegated sub-agent, not one tool call the harness can
intercept). They're declarative checklists that `orchestrator.agent.md`
reads and applies by hand at each phase transition; nothing here fires
automatically.
