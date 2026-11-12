# Run Phase 07: Verification & Testing (/phase-07)

Execute ONLY the agent at `.claude/agents/07-verification.agent.md`.
- Load and follow `.claude/skills/code-verification/skill.md`.
- Run `.claude/hooks/check-secrets.sh` and enforce rules in `.claude/rules/code-quality.md` and `.claude/rules/secrets.md`.
- Save output directly to `docs/MDP-7/07-verification-report.md` and mark `phase-07` as `completed` in `pipeline-state.json`.