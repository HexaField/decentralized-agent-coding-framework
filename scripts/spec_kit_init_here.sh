#!/usr/bin/env zsh
set -euo pipefail

# Ensure uvx (from Astral's uv) is available
if ! command -v uvx >/dev/null 2>&1; then
	echo "uvx not found; installing uv..." >&2
	if command -v brew >/dev/null 2>&1; then
		brew install uv
	else
		if ! command -v curl >/dev/null 2>&1; then
			echo "curl is required to install uv. Please install curl and re-run." >&2
			exit 1
		fi
		curl -LsSf https://astral.sh/uv/install.sh | sh
	fi
	# Add common install locations to PATH for this session
	export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

uvx --from git+https://github.com/github/spec-kit.git specify init . --here --ai copilot "$@"
