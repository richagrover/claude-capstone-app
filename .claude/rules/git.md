# Git Workflow Rules

## Guidelines
- Never commit directly to the `main` or `master` branch; always use feature branches.
- Write clear, concise, and conventional commit messages (e.g., `feat:`, `fix:`, `refactor:`).
- Ensure all local changes are tested and verified before opening a Pull Request.
- Keep branches updated with the latest changes from the upstream base branch.

## Version Control & Hooks Enforcement
- Executing `.claude/hooks/no-main-commit.sh` is mandatory prior to any commit to verify branch protection against direct pushes to main.