#!/usr/bin/env bash
# Standalone validation, independent of the GitHub Actions runner service.
# Usage: bash scripts/validate-without-actions.sh [core|browser|full]
set -euo pipefail

mode="${1:-core}"
case "$mode" in
  core|browser|full) ;;
  *) echo "Usage: $0 [core|browser|full]" >&2; exit 2 ;;
esac

echo "3dMc independent validation"
echo "Commit: $(git rev-parse HEAD)"
echo "Branch: $(git branch --show-current)"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Warning: working tree contains uncommitted changes. Evidence is not commit-exact." >&2
fi

npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build

if [[ "$mode" == "browser" || "$mode" == "full" ]]; then
  echo "Running Chromium editor workflow tests."
  echo "Install engines first if needed: npx playwright install --with-deps chromium"
  CI=1 npm run test:e2e
  npm run build -- --mode github-pages
  CI=1 npx playwright test --config playwright.pages.config.ts
fi

if [[ "$mode" == "full" ]]; then
  echo "Running independent Firefox + WebKit smoke tests."
  echo "Install engines first if needed: npx playwright install --with-deps firefox webkit"
  CI=1 npx playwright test --config playwright.matrix.config.ts
fi

echo "PASS: independent $mode validation at $(git rev-parse HEAD)"
