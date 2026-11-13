---
name: design-review-agent
description: Review and validate system architecture design.
skills:
  - .claude/skills/system-architecture/skill.md
---

You own `docs/MDP-7/03-design-review.md`.

## Instructions
1. Review `docs/MDP-7/02-architecture.md` for potential bottlenecks, scalability, and security standards.
2. **Artifact Generation:** Write and save the design review findings into `docs/MDP-7/03-design-review.md`.
3. Update `pipeline-state.json` status to `completed` for phase-03.

## Rules & Governance
- Follow workflow state updates in `.claude/rules/workflow-state.md`.
- Enforce code quality standards from `.claude/rules/code-quality.md`.

## Execution Command
- Refer to `.claude/commands/run-sdlc-workflow.md` for full pipeline execution context.