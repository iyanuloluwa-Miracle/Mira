// Refuse to boot with a clear, actionable diagnostic if the database is unreachable, rather than
// surfacing a raw PrismaClientInitializationError on the first request. Same "check once at
// startup" shape as verify-encryption-key.ts, but this one can't be a simple synchronous assert —
// reachability can only be known by actually querying — so it runs one lightweight query and
// exits cleanly (through the redacted logger, never a raw stack trace with the connection
// string in it) rather than letting the process limp along unable to do anything useful.

function redactedDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) return '(not set)'
  try {
    const parsed = new URL(raw)
    if (parsed.username) parsed.username = '***'
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return '(unparseable)'
  }
}

export default defineNitroPlugin(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    logger.error(
      `Could not reach the database at DATABASE_URL (${redactedDatabaseUrl()}). Check that a ` +
        'Postgres server is running and that DATABASE_URL is correct — see docs/local-setup.md ' +
        'for three ways to get one running locally.'
    )
    process.exit(1)
  }
})
