// A migrated, ephemeral PGlite-backed Postgres for tests that only need a real database
// connection — not a full spawned Nitro server (see test-server.ts for that heavier helper,
// needed when a test has to exercise real HTTP + cookies + middleware). Used by tests that call
// server/utils functions directly, such as server/utils/retention.ts's runRetentionTask(), which
// has no HTTP-triggerable route since it only ever runs on Nitro's scheduler.

import { exec } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { promisify } from 'node:util'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const execAsync = promisify(exec)

export interface EphemeralDatabase {
  databaseUrl: string
  stop: () => Promise<void>
}

function randomPort(): number {
  return randomInt(20_000, 60_000)
}

export async function startEphemeralDatabase(): Promise<EphemeralDatabase> {
  let lastError: unknown

  for (let attempt = 0; attempt < 5; attempt++) {
    const port = randomPort()
    const db = new PGlite()
    const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 10 })

    try {
      await server.start()
      const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?pgbouncer=true`

      let migrated = false
      let lastMigrateError: unknown
      // Same handshake race as test-server.ts: PGlite's socket briefly accepts TCP connections
      // before the backend underneath is ready, so the first attempt can still fail with P1001.
      for (let migrateAttempt = 0; migrateAttempt < 5 && !migrated; migrateAttempt++) {
        try {
          await execAsync('npx prisma migrate deploy', {
            env: { ...process.env, DATABASE_URL: databaseUrl }
          })
          migrated = true
        } catch (error) {
          lastMigrateError = error
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }
      if (!migrated) throw lastMigrateError

      return {
        databaseUrl,
        stop: async () => {
          await server.stop()
          await db.close()
        }
      }
    } catch (error) {
      lastError = error
      await db.close()
    }
  }

  throw new Error(`Could not start an ephemeral migrated database: ${String(lastError)}`)
}
