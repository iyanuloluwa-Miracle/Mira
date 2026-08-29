// Developer script: exports de-identified/aggregate evaluation data per
// docs/evaluation-data-dictionary.md. Must never export real participant-level data (R10) — no
// free text, no chat content, no email, no pseudonym. Run with `npx tsx
// scripts/export-evaluation-data.ts`; writes four CSVs to data/evaluation-export/ (gitignored —
// see .gitignore's "Participant data must never be committed" section, which already covers
// *.csv and data/ for exactly this reason).

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const OUTPUT_DIR = join(process.cwd(), 'data', 'evaluation-export')

type CsvValue = string | number | boolean | null | undefined

function toCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function toCsv(columns: string[], rows: CsvValue[][]): string {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(row.map(toCsvField).join(','))
  return lines.join('\n') + '\n'
}

async function writeCsv(filename: string, columns: string[], rows: CsvValue[][]): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const path = join(OUTPUT_DIR, filename)
  await writeFile(path, toCsv(columns, rows), 'utf-8')
  console.log(`wrote ${rows.length} row(s) to ${path}`)
}

async function exportSessions(prisma: PrismaClient): Promise<void> {
  const sessions = await prisma.screeningSession.findMany({
    include: { triageResult: true },
    orderBy: { startedAt: 'asc' }
  })

  const columns = [
    'session_id',
    'instrument',
    'status',
    'started_at',
    'completed_at',
    'client_latency_ms',
    'server_latency_ms',
    'free_text_excluded',
    'phq9_total',
    'gad7_total',
    'phq9_band',
    'gad7_band',
    'risk_level',
    'escalated'
  ]

  const rows = sessions.map((s): CsvValue[] => [
    s.id,
    s.instrument,
    s.status,
    s.startedAt.toISOString(),
    s.completedAt?.toISOString() ?? null,
    s.clientLatencyMs,
    s.serverLatencyMs,
    s.freeTextExcluded,
    s.triageResult?.phq9Total ?? null,
    s.triageResult?.gad7Total ?? null,
    s.triageResult?.phq9Band ?? null,
    s.triageResult?.gad7Band ?? null,
    s.triageResult?.riskLevel ?? null,
    s.triageResult?.escalated ?? null
  ])

  await writeCsv('sessions.csv', columns, rows)
}

async function exportLatency(prisma: PrismaClient): Promise<void> {
  const metrics = await prisma.metric.findMany({ orderBy: { createdAt: 'asc' } })

  const columns = ['metric_id', 'name', 'value_ms', 'session_id', 'created_at']
  const rows = metrics.map((m): CsvValue[] => [
    m.id,
    m.name,
    m.valueMs,
    m.sessionId,
    m.createdAt.toISOString()
  ])

  await writeCsv('latency.csv', columns, rows)
}

async function exportTriageDistribution(prisma: PrismaClient): Promise<void> {
  const grouped = await prisma.triageResult.groupBy({
    by: ['riskLevel'],
    _count: { _all: true }
  })

  const columns = ['risk_level', 'count']
  const rows = grouped.map((g): CsvValue[] => [g.riskLevel, g._count._all])

  await writeCsv('triage_distribution.csv', columns, rows)
}

// [Chapter Four, Section 3.8.3] One row per task attempt (a TASK_START paired with the next
// TASK_END for the same evaluation session + taskId) — duration_ms and completed are exactly
// what median-time-on-task and task-completion-rate are computed from. A TASK_START with no
// matching TASK_END (the sitting ended mid-task) still gets a row, with duration_ms and
// completed both null — an incomplete task is evidence too, not something to silently drop.
async function exportTasks(prisma: PrismaClient): Promise<void> {
  const sessions = await prisma.evaluationSession.findMany({
    include: { events: { orderBy: { createdAt: 'asc' } } },
    orderBy: { startedAt: 'asc' }
  })

  const columns = [
    'evaluation_session_id',
    'participant_code',
    'task_id',
    'started_at',
    'ended_at',
    'duration_ms',
    'completed'
  ]
  const rows: CsvValue[][] = []

  for (const session of sessions) {
    const starts = session.events.filter((e) => e.type === 'TASK_START')
    const ends = [...session.events.filter((e) => e.type === 'TASK_END')]

    for (const start of starts) {
      const endIndex = ends.findIndex(
        (e) => e.taskId === start.taskId && e.createdAt >= start.createdAt
      )
      const end = endIndex === -1 ? null : ends.splice(endIndex, 1)[0]!

      rows.push([
        session.id,
        session.participantCode,
        start.taskId,
        start.createdAt.toISOString(),
        end?.createdAt.toISOString() ?? null,
        end ? end.createdAt.getTime() - start.createdAt.getTime() : null,
        end?.completed ?? null
      ])
    }
  }

  await writeCsv('tasks.csv', columns, rows)
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    await exportSessions(prisma)
    await exportLatency(prisma)
    await exportTriageDistribution(prisma)
    await exportTasks(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
