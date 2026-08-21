// Spins up a real, built Nitro server (node .output/server/index.mjs) as a child process
// against a fresh, ephemeral PGlite database, for tests that need to exercise the actual HTTP
// + cookie + middleware + plugin pipeline rather than importing route handlers directly.
//
// Requires `npm run build` to have already produced .output/ — see the "integration" job in
// .github/workflows/ci.yml, or run it yourself before `npm run test:integration` locally.

import { existsSync } from 'node:fs'
import { exec, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes, randomInt } from 'node:crypto'
import { promisify } from 'node:util'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const execAsync = promisify(exec)

export interface TestServer {
  baseUrl: string
  // Same ephemeral database the spawned server process is using — its env vars are only
  // visible to that child process, so a test that wants to query the database directly (e.g.
  // to assert no plaintext email landed in a row) needs this to build its own PrismaClient.
  databaseUrl: string
  stop: () => Promise<void>
}

function randomPort(): number {
  return randomInt(20_000, 60_000)
}

interface Output {
  stdout: string
  stderr: string
}

async function startPgliteServer(): Promise<{
  server: PGLiteSocketServer
  db: PGlite
  databaseUrl: string
}> {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = randomPort()
    const db = new PGlite()
    // Default maxConnections is 1 — too low once both the spawned app server and this test
    // file's own direct PrismaClient (for assertions like "no plaintext email in the row")
    // are querying concurrently.
    const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 10 })
    try {
      await server.start()
      return {
        server,
        db,
        databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?pgbouncer=true`
      }
    } catch (error) {
      lastError = error
      await db.close()
    }
  }
  throw new Error(`Could not start an ephemeral PGlite server: ${String(lastError)}`)
}

async function waitForReady(baseUrl: string, child: ChildProcess, output: Output): Promise<void> {
  const deadline = Date.now() + 20_000
  let lastError: unknown

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Test server process exited early with code ${child.exitCode}\n` +
          `stdout: ${output.stdout}\nstderr: ${output.stderr}`
      )
    }
    try {
      // A single hung request must not be allowed to block this loop past the deadline above.
      const response = await fetch(`${baseUrl}/api/auth/session`, {
        signal: AbortSignal.timeout(2000)
      })
      if (response.status < 500) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(
    `Test server did not become ready in time: ${String(lastError)}\n` +
      `stdout: ${output.stdout}\nstderr: ${output.stderr}`
  )
}

export async function startTestServer(): Promise<TestServer> {
  if (!existsSync('.output/server/index.mjs')) {
    throw new Error(
      'tests/integration expects .output/server/index.mjs to exist — run `npm run build` first.'
    )
  }

  const { server: pgServer, db, databaseUrl } = await startPgliteServer()

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    IDENTIFIER_HASH_PEPPER: randomBytes(32).toString('base64'),
    AUTH_SECRET: randomBytes(32).toString('base64'),
    NODE_ENV: 'production'
  }

  // PGlite's socket is an in-process TCP server that needs this process's event loop free to
  // service it — using the *sync* exec here would block that event loop for the migration
  // subprocess's entire run, starving PGlite of the ability to respond to it at all. The async
  // exec lets both run concurrently. Also retried: PGlite's socket briefly accepts TCP
  // connections before the backend underneath is actually ready to handshake, so the very
  // first attempt can still fail with P1001 even though server.start() already resolved.
  let lastMigrateError: unknown
  let migrated = false
  for (let attempt = 0; attempt < 5 && !migrated; attempt++) {
    try {
      await execAsync('npx prisma migrate deploy', { env })
      migrated = true
    } catch (error) {
      lastMigrateError = error
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
  if (!migrated) {
    const output =
      lastMigrateError instanceof Error && 'stdout' in lastMigrateError
        ? String(lastMigrateError.stdout)
        : ''
    const errOutput =
      lastMigrateError instanceof Error && 'stderr' in lastMigrateError
        ? String(lastMigrateError.stderr)
        : ''
    await pgServer.stop()
    await db.close()
    throw new Error(`prisma migrate deploy failed after retries:\n${output}\n${errOutput}`)
  }

  const appPort = randomPort()
  const child = spawn('node', ['.output/server/index.mjs'], {
    env: { ...env, PORT: String(appPort), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const output: Output = { stdout: '', stderr: '' }
  child.stdout?.on('data', (chunk: Buffer) => {
    output.stdout += chunk.toString()
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    output.stderr += chunk.toString()
  })

  const baseUrl = `http://127.0.0.1:${appPort}`

  try {
    await waitForReady(baseUrl, child, output)
  } catch (error) {
    child.kill()
    await pgServer.stop()
    await db.close()
    throw error
  }

  return {
    baseUrl,
    databaseUrl,
    stop: async () => {
      child.kill()
      await pgServer.stop()
      await db.close()
    }
  }
}
