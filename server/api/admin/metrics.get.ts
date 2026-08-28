// [NFR3] The direct, queryable evidence for NFR3: p50/p95/p99 and a count per named operation
// in the Metric table (server/utils/metrics.ts records the rows; see
// docs/evaluation-data-dictionary.md for what each name means). Also returns the triage-band
// distribution across every completed screening, which app/pages/admin/metrics.vue charts
// alongside the latency figures — both are what scripts/export-evaluation-data.ts's
// triage_distribution.csv is derived from too, so the page and the export can never disagree
// about what a given riskLevel's count actually was at export time.
//
// percentile_cont is a standard PostgreSQL aggregate — no application-side percentile math to
// keep in sync with what's actually stored, and it works identically against Neon and the
// PGlite-backed test database (real Postgres under the hood either way).

interface LatencyRow {
  name: string
  count: bigint
  p50: number | null
  p95: number | null
  p99: number | null
}

interface TriageRow {
  riskLevel: string
  count: bigint
}

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  if (!emptyQuerySchema.safeParse(getQuery(event)).success) {
    badRequestError('This endpoint does not accept a query string.')
  }

  const [latencyRows, triageRows] = await Promise.all([
    prisma.$queryRaw<LatencyRow[]>`
      SELECT
        name,
        COUNT(*) AS count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "valueMs") AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "valueMs") AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY "valueMs") AS p99
      FROM metrics
      GROUP BY name
      ORDER BY name
    `,
    prisma.$queryRaw<TriageRow[]>`
      SELECT "riskLevel", COUNT(*) AS count
      FROM triage_results
      GROUP BY "riskLevel"
    `
  ])

  return {
    latency: latencyRows.map((row) => ({
      name: row.name,
      count: Number(row.count),
      p50Ms: row.p50 === null ? null : Math.round(row.p50),
      p95Ms: row.p95 === null ? null : Math.round(row.p95),
      p99Ms: row.p99 === null ? null : Math.round(row.p99)
    })),
    triageDistribution: triageRows.map((row) => ({
      riskLevel: row.riskLevel,
      count: Number(row.count)
    }))
  }
})
