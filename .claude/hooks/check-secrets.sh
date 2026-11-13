#!/bin/bash
# Check for hardcoded secrets, API keys, or private tokens in staged files
echo "Running security scan for hardcoded secrets..."

pattern="(api[_-]?key|secret|password|auth[_-]?token|bearer\s+[a-zA-Z0-9_\-\.]+)"

if git diff --cached --name-only | xargs grep -i -E "$pattern" 2>/dev/null; then
    echo "ERROR: Potential hardcoded secret detected in staged changes!"
    exit 1
fi

echo "Security check passed: No secrets found."
exit 0