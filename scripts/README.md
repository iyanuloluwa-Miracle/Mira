# scripts

One-off and CI-invoked developer scripts (evidence capture, evaluation-data export,
traceability-matrix generation, a Docker-free local database). Not part of the running
application.

`dev-db.ts` (`npm run db:local`) starts an in-process Postgres-compatible database for
contributors without Docker — see the comment at the top of that file for the two ways it
behaves differently from real Postgres (`migrate dev` and prepared statements).
