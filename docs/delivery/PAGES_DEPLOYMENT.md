# 3dMc GitHub Pages deployment

## What caused the white screen

The repository used to expose the raw Vite **source** `index.html` to GitHub Pages' built-in Jekyll publisher. That HTML includes a module script pointing to `/src/main.tsx`, which only the Vite development server knows how to transform. GitHub Pages cannot execute TSX directly; an unbundled entry and root-relative assets on `/3dMc/` leave the workspace empty.

A successful `npm run build` in CI does **not** deploy its files. The earlier editor browser tests also ran against the Vite dev server, not the public URL.

## Permanent fix

The repository now has `.github/workflows/deploy-pages.yml`:

1. On a push to `main`, install locked dependencies with Node 22.
2. Build with `DEPLOY_TARGET=github-pages npm run build` so Vite writes JavaScript, CSS and public assets under the `/3dMc/` base path.
3. Run Chromium smoke tests against the compiled site served at `http://127.0.0.1:4174/3dMc/` using `npm run preview`.
4. Upload **`dist/` only**, then publish it using GitHub's official Pages artifact deployment actions. Source code is never the deployed site.

Normal PR checks also exercise that production build and browser test, independently from the development-server workflow. The root HTML has a visible fallback when its module script fails; React has an error boundary to display a recoverable startup error.

## One-time GitHub Pages setting

A repository owner must confirm the Pages publishing source in GitHub:

1. Open [repository Settings → Pages](https://github.com/dovvnloading/3dMc/settings/pages).
2. Under **Build and deployment → Source**, choose **GitHub Actions** and save.
3. Open [Actions → Deploy editor to GitHub Pages](https://github.com/dovvnloading/3dMc/actions/workflows/deploy-pages.yml) to review the latest deployment. If the workflow already ran before changing the source, run it again with **Run workflow** on `main`.
4. Visit [https://dovvnloading.github.io/3dMc/](https://dovvnloading.github.io/3dMc/) after a successful deployment and hard-refresh the page if an older failed build is cached.

GitHub's Pages source setting is an administrative control; changing a workflow YAML file alone does not always switch the site away from the legacy branch/Jekyll publisher. The GitHub integration in this workspace cannot change that repository setting directly. Do not mark the public site fixed until the deployment job succeeds and the live URL loads.

## Troubleshooting

- **Editor loading text stays visible:** Pages is probably still publishing repository source, or a JS bundle was blocked. Verify the publishing source is GitHub Actions and check the Pages workflow.
- **404 for `/assets/... ` rather than `/3dMc/assets/...`:** The bundle was built with the wrong Vite base. Only publish the `DEPLOY_TARGET=github-pages` build.
- **Editor displays an explicit startup error:** Use the visible error message and browser console to report a runtime failure; this differs from a build/hosting problem.
- **White page after a successful deploy:** Check DevTools → Network for missing JS/CSS and Console for a runtime error. Confirm your browser isn't using a stale service-worker or HTML cache. The repository does not intentionally register a service worker.
- **Local preview works but hosted site doesn't:** Test the actual compiled Pages build with `DEPLOY_TARGET=github-pages npm run build`, then `DEPLOY_TARGET=github-pages npm run preview -- --host 127.0.0.1 --port 4174` and navigate to `/3dMc/`.

## Evidence requirement

The Pages workflow must finish with its **Publish built app** job successful, and the published URL must show the editor rather than the source-loading fallback. Browser tests prove compiled assets and a local production preview; they do not substitute for checking the external GitHub Pages URL itself.
