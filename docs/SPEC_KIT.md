# Spec Kit Integration

This repo supports Spec-Driven Development using GitHub’s Spec Kit and the `specify` CLI.

## Prerequisites

- macOS/Linux (or WSL2)
- Python 3.11+
- uv (https://docs.astral.sh/uv/)
- Git
- An AI coding agent (e.g., GitHub Copilot)

## Install the CLI

- Persistent install (recommended):
  - uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
- One-time usage:
  - uvx --from git+https://github.com/github/spec-kit.git specify check

## Initialize (optional)

Caution: init can write files. Prefer running in a feature branch.

- In current directory:
  - uvx --from git+https://github.com/github/spec-kit.git specify init . --here --ai copilot
- With force merge if non-empty:
  - uvx --from git+https://github.com/github/spec-kit.git specify init . --here --force --ai copilot

## Workflow (slash commands)

- /constitution — Set principles and guidelines
- /specify — Define requirements and user stories
- /clarify — Clarify underspecified areas
- /plan — Create technical implementation plan
- /tasks — Generate actionable tasks
- /implement — Execute tasks per plan

## Environment

- SPECIFY_FEATURE to target a specific feature directory when not using Git branches.

## Repo integration

- Scripts: see scripts/spec_kit_check.sh and scripts/spec_kit_init_here.sh
- NPM scripts: `npm run spec:check`, `npm run spec:init:here`
