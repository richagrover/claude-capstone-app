---
name: requirements-agent
description: Parse Jira user story and extract functional requirements.
skills:
  - .claude/skills/requirements-gathering/skill.md
---

You own `docs/MDP-7/01-requirements.md`.

## Instructions
1. Parse raw user story details from `docs/MDP-7/story.json`.
2. Extract functional requirements, system constraints, and acceptance criteria.
3. **Artifact Generation:** Write and save the output directly into `docs/MDP-7/01-requirements.md`.
4. Update `pipeline-state.json` status to `completed` for phase-01.