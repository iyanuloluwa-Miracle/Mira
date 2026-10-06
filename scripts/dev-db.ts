// Local Postgres for development and manual verification with nothing else installed. Starts an
// in-process PGlite instance (real Postgres, compiled to WASM) behind a TCP socket that speaks
// the actual Postgres wire protocol, so Prisma, `psql`, or anything else that takes a
// postgresql:// URL can connect to it exactly like a normal server. Not used in CI and not a
// production database — see docs/local-setup.md for real Postgres options.
//
// Two things behave differently here than against real Postgres, both because this server
// backs every client connection with one shared PGlite session rather than a real per-connection
// backend process:
//   - `prisma migrate dev` fails (it provisions a throwaway shadow database, which this
//     single-database server can't support). Use `prisma migrate diff --from-migrations
//     prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` to hand-author the
//     next migration's SQL offline, same as the initial migration, then `prisma migrate deploy`
//     to apply it here.
//   - Prepared statements can collide across separate client connections ("prepared statement
//     \"s0\" already exists"). Append `?pgbouncer=true` to DATABASE_URL, as in the printed URL
//     below, to make Prisma skip its prepared-statement cache.
//
// Keep this process running in its own terminal while you run `prisma migrate deploy` /
// `npm run db:seed` / `npm run dev` in another.

import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const port = Number(process.env.PGLITE_PORT ?? 5433)
const host = process.env.PGLITE_HOST ?? '127.0.0.1'
// Omit PGLITE_DATA_DIR (or leave unset) for an in-memory database that resets every run;
// set it to a folder path to persist data between runs.
const dataDir = process.env.PGLITE_DATA_DIR

const db = new PGlite(dataDir)
const server = new PGLiteSocketServer({ db, port, host })

await server.start()

console.log(
  `PGlite is listening on postgresql://postgres:postgres@${host}:${port}/postgres?pgbouncer=true`
)
console.log(
  dataDir
    ? `Data directory: ${dataDir}`
    : 'In-memory database — data resets when this process exits.'
)
console.log('Set DATABASE_URL to the URL above, then run prisma commands in another terminal.')
console.log('Press Ctrl+C to stop.')

async function shutdown() {
  await server.stop()
  await db.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
