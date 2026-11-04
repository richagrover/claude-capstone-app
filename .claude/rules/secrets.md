# Secrets and Credential Security

## Guidelines
- Hardcoding API keys, passwords, or tokens in source code or files is strictly forbidden.
- Use dynamic environment variables (such as `GITHUB_TOKEN` from runtime memory or secure local configuration).
- Ensure sensitive credentials are never written to logs, artifacts, or shared repositories.