#!/usr/bin/env zsh
set -euo pipefail

# Ensure Specify CLI is installed persistently via uv tool
if ! command -v specify >/dev/null 2>&1; then
	echo "Specify CLI not found; installing via uv tool..." >&2
	# Ensure uv is available
	if ! command -v uv >/dev/null 2>&1; then
		echo "uv not found; installing uv..." >&2
		if command -v brew >/dev/null 2>&1; then
			brew install uv
		else
			if ! command -v curl >/dev/null 2>&1; then
				echo "curl is required to install uv. Please install curl and re-run." >&2
				exit 1
			fi
			curl -LsSf https://astral.sh/uv/install.sh | sh
			export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
		fi
	fi
	uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
	export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

specify check
