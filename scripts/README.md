# scripts

One-off and CI-invoked developer scripts (setup, the classifier launcher, evidence capture,
evaluation-data export, traceability-matrix generation, an in-process local database). Not part
of the running application — see the root [README.md](../README.md) for the npm scripts that
invoke these.

- `setup.ts` (`npm run setup`) — checks prerequisites (Node, npm, Python, a reachable Postgres),
  then bootstraps `.env`, runs migrations and the base seed, and creates the classifier's `.venv`.
- `run-classifier.ts` (`npm run classifier`) — starts the classifier service from its `.venv`,
  cross-platform, without depending on a shell's activate script.
- `dev-db.ts` (`npm run db:local`) starts an in-process Postgres-compatible database for
  contributors with no local Postgres install — see the comment at the top of that file for the
  two ways it behaves differently from real Postgres (`migrate dev` and prepared statements).
- `capture-evidence.ts` — Playwright screenshot capture for Chapter Four figures; see its own
  header comment for what it assumes.
