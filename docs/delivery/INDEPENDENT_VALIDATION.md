# Independent validation when GitHub Actions is unavailable

**Status:** temporary fallback for 3dMc development; does not disable or replace required GitHub checks, and does not assert that GitHub itself is globally down.

## Reproducible validation

Work on a clean checkout of the **exact PR head** or intended integration commit. Use Node.js >=22.12 and the committed `package-lock.json`. Run:

```bash
bash scripts/validate-without-actions.sh core
```

For full browser parity, install Playwright browsers and platform dependencies if needed, then run:

```bash
npx playwright install --with-deps chromium firefox webkit
bash scripts/validate-without-actions.sh full
```

The script runs locked dependency installation, TypeScript, Vitest and production build. `browser` additionally runs the Chromium editor suite and the compiled GitHub Pages test suite. `full` also runs Firefox/WebKit smoke. Chromium tests may take several minutes in a small machine; use a clean environment with free local ports 4173 and 4174. Do not run two Playwright suites against the same ports simultaneously. A test reported as **flaky** is not equivalent to a clean first-attempt pass; investigate and record it.

When validating PRs independently:

1. Record the exact full commit SHA, Node/npm versions, test commands, their exit codes and failing/flaky cases.
2. Inspect source changes and run relevant focused browser scenarios as well as the unit suite. Fix real failures on the PR branch, then validate the updated SHA.
3. Where several PRs are merged, validate an integration build on the resulting `main` commit to detect cross-feature regressions.
4. Preserve test output or screenshots locally as evidence. Do not upload private project archives, browser profiles, tokens or personal files.
5. Do not claim real Minecraft compatibility from browser/unit tests. A new replacement target or combined pack requires a separate in-game check.

## November 11, 2026 independent validation record

During an Actions queue/artifact-upload stall, five pending changes were tested in a separate short-lived validation sandbox before merging:

| PR | Source revision validated | Evidence |
| --- | --- | --- |
| #33 | `399fd57710ea0ef7cfe375aeec5db1cf1a2b41fa` | TypeScript, 132 Vitest tests, production build |
| #34 | `887226d4e6fd6c9e86ed4810f84ddb3f74187cd8` | TypeScript, 133 Vitest tests, production build, 26 Chromium editor tests |
| #35 | `ff2ee1b3a6b2fb6ffbe3accb465ac347111d96cd` | TypeScript, 133 Vitest tests, production build; fixed a real native pack ZIP parser failure |
| #36 | `46ba601a2a17d99c36376156481dfcad66956614` | TypeScript, 131 Vitest tests, production build, 11 Chromium selection tests |
| #37 | `a3bb981ba600aa494e38469ddfb1f2788f1559d3` | TypeScript, 133 Vitest tests, production build |

Pack Studio (#38), validated against `dc93586b825a6cc655c317638431ec964c236a03`, passed TypeScript, 150 unit tests, production build, 10 Firefox/WebKit smoke tests and seven compiled-site tests. The full Chromium suite reported 53 passing tests and one eraser test that initially failed but passed on retry. The 3 Pack Studio scenarios passed. The transient eraser failure is not declared fixed.

This evidence was gathered outside GitHub Actions. Actions status and deployments remain separate and may not be green even after independently validated changes are merged.

## Scope

The independent sandbox used for these checks is a disposable validation environment, **not** the production application or a replacement for GitHub Pages deployment. Ordinary `main` pushes may remain unpublished until the repository's deployment workflow can execute or a separately authorized hosting strategy is chosen.

Do not weaken the existing workflow, skip tests by default, or treat infrastructure failures as proof that application checks passed.
