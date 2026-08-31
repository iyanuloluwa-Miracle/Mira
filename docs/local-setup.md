# Local Postgres setup

Mira needs a real Postgres database — there is no Docker path anymore (see
[CLAUDE.md](../CLAUDE.md) and the root [README.md](../README.md)). Pick one of the three routes
below, put the resulting connection string in `DATABASE_URL` in your `.env`
(`cp .env.example .env` first if you haven't), then run `npm run setup`.

`npm run setup` checks that `DATABASE_URL` is reachable before doing anything else and fails with
a specific message naming `DATABASE_URL` if it isn't — it never tries to install or configure
Postgres for you. The running app does the same check again at boot
(`server/plugins/verify-database-reachable.ts`): if the database becomes unreachable later, you
get that same clear message instead of a raw connection-error stack trace.

## Route 1 — a native install

Creates a `mira` role and `mira` database matching `.env.example`'s default:

```
DATABASE_URL="postgresql://mira:mira@localhost:5432/mira?schema=public"
```

**Windows** — install via the [official installer](https://www.postgresql.org/download/windows/),
then from a terminal with `psql` on PATH (the installer offers to add it):

```powershell
psql -U postgres -c "CREATE ROLE mira WITH LOGIN PASSWORD 'mira';"
psql -U postgres -c "CREATE DATABASE mira OWNER mira;"
```

**macOS** (Homebrew):

```bash
brew install postgresql@16
brew services start postgresql@16
createuser -s mira
psql -d postgres -c "ALTER ROLE mira WITH PASSWORD 'mira';"
createdb -O mira mira
```

**Debian/Ubuntu** (`apt`):

```bash
sudo apt update && sudo apt install -y postgresql
sudo -u postgres psql -c "CREATE ROLE mira WITH LOGIN PASSWORD 'mira';"
sudo -u postgres createdb -O mira mira
```

## Route 2 — a hosted free-tier Postgres

Any managed Postgres works; [Neon](https://neon.tech) is what this project's own dev/CI database
runs on. Create a free project and database, then copy the connection string it gives you into
`DATABASE_URL`. Hosted providers' connection strings almost always require SSL — Neon's own
format looks like:

```
DATABASE_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
```

If you see a TLS/SSL-related connection error, check that `?sslmode=require` (or your provider's
equivalent) is present — a plain `postgresql://...` string without it is usually the cause.

## Route 3 — SQLite (documented gap only, not implemented)

SQLite is **not** a supported fallback in this repository — it is documented here only so the gap
is explicit rather than discovered by trial and error. To use it you would need to:

- Change `provider = "postgresql"` to `provider = "sqlite"` in
  [`prisma/schema.prisma`](../prisma/schema.prisma) and regenerate migrations from scratch —
  SQLite migrations are not compatible with the existing Postgres ones.
- Remove every `@db.Uuid` column attribute and the reliance on Postgres-native `uuid()`
  generation — SQLite has no native UUID type, so IDs would need to be generated
  application-side instead.
- Accept weaker constraint behavior: SQLite enforces foreign keys and column types far more
  loosely than Postgres by default, which several of this schema's invariants (e.g. the cascade
  deletes described in [docs/data-model.md](data-model.md)) currently depend on.
- Accept that this would diverge from the deployment target. Mira is built and evaluated against
  Postgres; a SQLite-backed local environment would not be equivalent to production or to what
  Chapter Four's figures were measured against.

If Postgres genuinely cannot run in your environment, route 2 (a free hosted instance) is a much
smaller compromise than a SQLite port.
