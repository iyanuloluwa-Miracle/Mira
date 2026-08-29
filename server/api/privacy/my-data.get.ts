// [NFR1] "What is stored about this user, in plain language, by category" — a summary for the
// privacy dashboard, distinct from the full export (server/api/privacy/export.get.ts): this
// returns counts and descriptions, not the underlying content, so the dashboard itself never
// has to hold decrypted free text or transcripts in the browser just to render a category list.

export default defineEventHandler(async (event) => {
  const user = requireUser(event)

  if (!emptyQuerySchema.safeParse(getQuery(event)).success) {
    badRequestError('This endpoint does not accept a query string.')
  }

  const [sessionCount, freeTextCount, conversationTurnCount, consentCount, escalationCount] =
    await Promise.all([
      prisma.screeningSession.count({ where: { userId: user.id } }),
      prisma.freeTextEntry.count({ where: { session: { userId: user.id } } }),
      prisma.conversationTurn.count({ where: { session: { userId: user.id } } }),
      prisma.consentRecord.count({ where: { userId: user.id } }),
      prisma.escalation.count({ where: { triageResult: { session: { userId: user.id } } } })
    ])

  return {
    categories: [
      {
        key: 'profile',
        label: 'Account profile',
        description:
          'Your pseudonym, account type, and — only if you registered with one — your email address.',
        count: 1
      },
      {
        key: 'screeningSessions',
        label: 'Screening sessions',
        description: 'PHQ-9 and GAD-7 answers, computed scores, and results.',
        count: sessionCount
      },
      {
        key: 'freeText',
        label: 'Written responses',
        description:
          'What you wrote in the optional free-text step, encrypted at rest and automatically deleted after the retention window.',
        count: freeTextCount
      },
      {
        key: 'conversationTurns',
        label: 'Conversation with the assistant',
        description:
          'Turn counts, timing, and filter outcomes for the bounded conversational layer. The message text itself is only stored if you separately consented to research logging.',
        count: conversationTurnCount
      },
      {
        key: 'consentRecords',
        label: 'Consent decisions',
        description: 'A record of every consent choice you have made and when.',
        count: consentCount
      },
      {
        key: 'escalations',
        label: 'Clinician review records',
        description:
          'Present only for a result you shared (or that you had already consented to sharing) with our clinician team, including any notes a clinician has added.',
        count: escalationCount
      }
    ]
  }
})
