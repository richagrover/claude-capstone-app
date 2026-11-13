# Workflow State Management

## Guidelines
- Maintain pipeline continuity by persisting state transitions accurately in `pipeline-state.json`.
- Execute phases sequentially from requirements analysis up to PR creation without skipping mandatory checkpoints.
- Ensure human-in-the-loop validation steps are respected before advancing critical stages.