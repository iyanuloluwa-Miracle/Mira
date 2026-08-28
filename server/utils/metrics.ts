// [NFR3] Thin wrapper around Metric row creation — the direct evidence for NFR3 ("screening
// results returned within a defined, measured latency"). Every call site names one of the
// operations documented in docs/evaluation-data-dictionary.md; see that file for what each
// name actually measures and why server/e2e are split the way they are.
//
// Explicit imports (not relying on Nitro's auto-import of the bare `prisma`/`logger` globals),
// matching server/utils/retention.ts and server/utils/audit.ts — so this is directly callable
// from a plain vitest test against a real database, not only from inside the built Nitro runtime.

import { prisma } from './db'
import { logger } from './logger'

export interface RecordMetricInput {
  name: string
  valueMs: number
  sessionId?: string
}

// Never allowed to fail the request it's measuring (rule R7's "degrade, never fail" spirit
// applies to observability too) — a metrics-table write is not something a person waiting on a
// screening result should ever see fail as their own error.
export async function recordMetric(input: RecordMetricInput): Promise<void> {
  try {
    await prisma.metric.create({
      data: { name: input.name, valueMs: Math.round(input.valueMs), sessionId: input.sessionId }
    })
  } catch (error) {
    logger.warn('failed to record metric', { name: input.name, error: String(error) })
  }
}
