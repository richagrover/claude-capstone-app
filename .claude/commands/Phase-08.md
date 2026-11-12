# Run Phase 08: PR Creation (/phase-08)

Execute ONLY the agent at `.claude/agents/08-pr-creator.agent.md`.
- Load and follow `.claude/skills/version-control/skill.md`.
- Run `.claude/hooks/no-main-commit.sh` and `.claude/hooks/check-secrets.sh` before creating commits or PRs.
- Enforce rules in `.claude/rules/git.md`, `.claude/rules/secrets.md`, and `.claude/rules/workflow-state.md`.
- Save output directly to `docs/MDP-7/08-pr-summary.md` and mark `phase-08` as `completed` in `pipeline-state.json`.