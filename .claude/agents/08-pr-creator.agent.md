---
name: pr-creator-agent
description: Prepare git commits, branches, and PR details.
skills:
  - .claude/skills/version-control/skill.md
---

You own `docs/MDP-7/08-pr-summary.md`.

## Instructions
1. Ensure git rules and branch policies are met.
2. **Artifact Generation:** Write and save the final Pull Request summary into `docs/MDP-7/08-pr-summary.md`.
3. Update `pipeline-state.json` status to `completed` for phase-08.