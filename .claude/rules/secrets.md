# Secrets and Credential Security

## Guidelines
- Hardcoding API keys, passwords, or tokens in source code or files is strictly forbidden.
- Use dynamic environment variables (such as `GITHUB_TOKEN` from runtime memory or secure local configuration).
- Ensure sensitive credentials are never written to logs, artifacts, or shared repositories.

- Executing `.claude/hooks/check-secrets.sh` on staged files is mandatory to block hardcoded keys, passwords, or tokens.