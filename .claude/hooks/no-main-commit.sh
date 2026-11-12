#!/bin/bash
# Prevent direct commits or pushes to main branch
current_branch=$(git symbolic-ref --short HEAD 2>/dev/null)

if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
    echo "ERROR: Direct commits to '$current_branch' branch are strictly prohibited."
    echo "Please create a feature branch before committing changes."
    exit 1
fi

exit 0