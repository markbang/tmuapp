# Repository Guidelines

## Project Structure & Module Organization

This is a Vite+ monorepo. Source lives in `apps/website/src` for the web console, `apps/api/src` for the tmux HTTP/WebSocket API, `apps/android/app/src/main` for the Android client, and `packages/utils/src` for shared tmux parsing, types, and helpers. Keep tests close to the code they cover. Web end-to-end tests live under `apps/website/tests/e2e/`.

## Build, Test, and Development Commands

- `vp install`: install dependencies after cloning or pulling changes.
- `vp run dev`: start the API and web app together for local development.
- `vp run api#dev` / `vp run website#dev`: run one side only when debugging.
- `vp check`: format, lint, and type-check the workspace.
- `vp run -r test`: run the repo test suite.
- `vp run website#e2e`: run Playwright browser tests for the web console.
- `vp run ready`: full release gate used by CI.

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow the repository formatter and linter: `vp check` and `vp check --fix` are the source of truth. Keep files and exports named after the feature or module they implement, for example `tmux-stream.ts` or `pane-target.ts`. Prefer small, explicit modules over large shared utilities.

## Testing Guidelines

Use the existing test runner in each package. Name tests after the behavior being verified, not the implementation detail. For web regressions that affect rendering or input, add or update Playwright coverage in `apps/website/tests/e2e/`. For API changes, add unit or integration coverage in the relevant package and run `vp run -r test` plus `vp check` before opening a PR.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Fix terminal resize and follow behavior`. Keep commit titles brief and specific. Pull requests should describe the user-visible change, note any tmux/API behavior changes, and include screenshots or screen recordings for UI work. Link the relevant issue when one exists.

## Agent-Specific Instructions

Do not overwrite unrelated work in a dirty tree. Prefer the project’s existing `vp` commands and workspace layout, and validate touched areas with the narrowest useful command set before broadening to the full gate.
