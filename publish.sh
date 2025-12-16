#!/usr/bin/env bash
set -euo pipefail

BUMP_TYPE="${1:-patch}"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: ./publish.sh [patch|minor|major]" >&2
  exit 1
fi

npm run ts
npm run test

if ! git diff --quiet --exit-code || ! git diff --cached --quiet --exit-code; then
  echo "Working tree has uncommitted changes. Please commit or stash before publishing." >&2
  exit 1
fi

npm version "$BUMP_TYPE" -m "Release %s"

npm publish --access public

git push origin HEAD --follow-tags
