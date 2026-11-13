# Run SDLC Workflow (/run-sdlc)

## Description
Executes the full MDP-7 modular SDLC pipeline sequentially from requirements gathering to PR creation using active story context.

## Instructions
When this command is invoked via slash command, the orchestrator MUST:
1. Verify that `docs/MDP-7/story.json` exists and contains valid user story details.
2. Check or initialize `docs/MDP-7/pipeline-state.json`.
3. Sequentially trigger the 8 pipeline agents:
   - `/phase-01`: Requirements Analysis (`.claude/agents/01-requirements.agent.md`)
   - `/phase-02`: Architecture Design (`.claude/agents/02-architecture.agent.md`)
   - `/phase-03`: Design Review (`.claude/agents/03-design-review.agent.md`)
   - `/phase-04`: Implementation Planning (`.claude/agents/04-implementation-planner.agent.md`)
   - `/phase-05`: Code Implementation (`.claude/agents/05-implementation.agent.md`)
   - `/phase-06`: Code Review (`.claude/agents/06-code-review.agent.md`)
   - `/phase-07`: Verification & Testing (`.claude/agents/07-verification.agent.md`)
   - `/phase-08`: PR Creation (`.claude/agents/08-pr-creator.agent.md`)
4. Persist state changes after each successful phase transition.