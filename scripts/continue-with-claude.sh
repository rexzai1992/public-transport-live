#!/usr/bin/env bash

set -euo pipefail

project_root="$(git rev-parse --show-toplevel)"
cd "$project_root"

if ! command -v claude >/dev/null 2>&1; then
  printf '%s\n' \
    'Claude Code is not installed.' \
    'Install it from the official instructions, then rerun this command:' \
    'https://docs.anthropic.com/en/docs/claude-code/getting-started'
  exit 1
fi

printf '%s\n' \
  'Starting Claude Code in the repository root.' \
  'It will load CLAUDE.md, AGENTS.md, and docs/agent/CURRENT_STATUS.md.'

exec claude "Continue this repository from docs/agent/CURRENT_STATUS.md. First verify the Git working tree and read the expansion plan. Work only on the listed next task, preserve unrelated changes, run the required checks, and update CURRENT_STATUS.md before stopping. Do not deploy or push without explicit approval."
