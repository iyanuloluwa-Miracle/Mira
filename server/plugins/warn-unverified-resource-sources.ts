// [R10] Surfaces a startup warning while any active Resource row still has a TODO_VERIFY
// sourceAttribution placeholder — the same posture as
// server/plugins/warn-unverified-helplines.ts, adapted for content that lives in Postgres
// rather than a static config file. Deliberately best-effort: a database that isn't reachable or
// migrated yet at boot (e.g. the very first `nuxt dev` before `npx prisma migrate deploy` has
// run) must not crash the server over a warning, so failures here are swallowed, not thrown.

export default defineNitroPlugin(() => {
  prisma.resource
    .count({ where: { isActive: true, sourceAttribution: { startsWith: 'TODO_VERIFY' } } })
    .then((unverifiedCount) => {
      if (unverifiedCount === 0) return
      logger.warn(
        `${unverifiedCount} active resource(s) still have a TODO_VERIFY sourceAttribution. Do ` +
          'not treat their content as citing a real source until it has been personally ' +
          'verified — see rule R10 in CLAUDE.md.'
      )
    })
    .catch(() => {
      // Best-effort only — see file header.
    })
})
