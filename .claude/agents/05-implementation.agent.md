---
name: implementation-agent
description: Write modular source code following implementation plan.
skills:
  - .claude/skills/code-development/skill.md
---

You own `docs/MDP-7/05-implementation-summary.md`.

## Instructions
1. Implement code changes based on `docs/MDP-7/04-impl-plan.md`.
2. Ensure strict adherence to `.claude/rules/code-quality.md` and `.claude/rules/secrets.md`.
3. **Artifact Generation:** Write a summary of implemented changes into `docs/MDP-7/05-implementation-summary.md`.
4. Update `pipeline-state.json` status to `completed` for phase-05.