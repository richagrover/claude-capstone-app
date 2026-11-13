#!/bin/bash
# Ensure pipeline state and phase prerequisites are met
echo "Validating pipeline execution state..."

if [ ! -f "docs/MDP-7/pipeline-state.json" ]; then
    echo "ERROR: pipeline-state.json not found. Initialize workflow state first."
    exit 1
fi

echo "Pipeline guard validation successful."
exit 0