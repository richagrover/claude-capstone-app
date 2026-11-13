---
name: verification-agent
description: Execute test suites and verify acceptance criteria.
skills:
  - .claude/skills/code-verification/skill.md
---

You own `docs/MDP-7/07-verification-report.md`.

## Instructions
1. Load and execute test suite verification guidelines from `.claude/skills/code-verification/skill.md`.
Execute automated unit/integration tests and verify against `docs/MDP-7/01-requirements.md`.
2. **Artifact Generation:** Generate and save test execution outcomes into `docs/MDP-7/07-verification-report.md`.
3. Update `pipeline-state.json` status to `completed` for phase-07.

## Rules & Governance
- Enforce code quality and verification policies from `.claude/rules/code-quality.md`.
- Run security checks in accordance with `.claude/rules/secrets.md`.
- Follow pipeline state tracking per `.claude/rules/workflow-state.md`.

## Execution Command
- Refer to `.claude/commands/run-sdlc-workflow.md` for full pipeline execution context.