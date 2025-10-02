#!/usr/bin/env bash
set -euo pipefail
mkdir -p state/demo-repo
cd state/demo-repo
if [ ! -d .git ]; then
  git init
  echo "# Demo Project" > README.md
  echo "console.log('hello');" > index.js
  git add .
  git commit -m "init demo"
fi
echo "Demo project at $(pwd)"
