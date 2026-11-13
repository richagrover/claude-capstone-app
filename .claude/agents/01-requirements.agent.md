---
name: requirements-agent
description: Parse Jira user story and extract functional requirements.
skills:
  - .claude/skills/requirements-gathering/skill.md
---

You own `docs/MDP-7/01-requirements.md`.

## Instructions
1. Load and execute instructions from `.claude/skills/requirements-gathering/skill.md`.
2. Parse raw user story details from `docs/MDP-7/story.json`.
3. Extract functional requirements, system constraints, and acceptance criteria.
4. **Artifact Generation:** Write and save the output directly into `docs/MDP-7/01-requirements.md`.
5. Update `pipeline-state.json` status to `completed` for phase-01.

## Rules & Governance
- Follow workflow state updates in `.claude/rules/workflow-state.md`.

## Execution Command
- Refer to `.claude/commands/run-sdlc-workflow.md` for full pipeline execution context.