// Fixed, obviously-fake ids shared between prisma/demo-seed.ts (which creates these rows) and
// scripts/capture-evidence.ts (which navigates straight to them by id, rather than querying and
// filtering — the queue can already be cluttered with older escalations on a shared dev
// database, but a fixed id is unambiguous regardless of how much other data is present).

export const DEMO_IDS = {
  highEscalated: {
    userId: '33333333-3333-4333-8333-333333333331',
    sessionId: '33333333-3333-4333-8333-333333333332',
    triageResultId: '33333333-3333-4333-8333-333333333333',
    escalationId: '33333333-3333-4333-8333-333333333334'
  },
  crisis: {
    userId: '44444444-4444-4444-8444-444444444441',
    sessionId: '44444444-4444-4444-8444-444444444442',
    triageResultId: '44444444-4444-4444-8444-444444444443',
    escalationId: '44444444-4444-4444-8444-444444444444'
  },
  highReviewed: {
    userId: '55555555-5555-4555-8555-555555555551',
    sessionId: '55555555-5555-4555-8555-555555555552',
    triageResultId: '55555555-5555-4555-8555-555555555553',
    escalationId: '55555555-5555-4555-8555-555555555554'
  }
} as const
