// [R10] Surfaces a startup warning while any config/helplines.ts entry is still an unverified
// TODO_VERIFY placeholder, so the gap can't go unnoticed in server boot logs. Deliberately
// unconditional — not gated on NODE_ENV — for two reasons: this is a server log line, never
// shown to an end user, so environment-gating it wouldn't serve the "don't alarm production
// users" purpose that gating usually exists for; and `nuxt build` itself runs with
// NODE_ENV=production, which means any `if (process.env.NODE_ENV === 'production') return`
// guard here gets statically resolved to true by the bundler and the whole warning tree-shaken
// out of every built artifact, dev or prod, defeating the point. The persistent on-screen
// banner this prompt also asks for is a genuinely user-facing, environment-sensitive UI
// concern — that belongs client-side (the crisis screen, once built) using import.meta.dev,
// which doesn't have this bundling trap since hiding it from real users in a real production
// build is exactly the intended behavior there.

import { ALL_HELPLINES_VERIFIED } from '../../config/helplines'

export default defineNitroPlugin(() => {
  if (ALL_HELPLINES_VERIFIED) return

  logger.warn(
    'config/helplines.ts still has unverified TODO_VERIFY placeholder contacts. Do not deploy ' +
      'to production until every entry has been personally verified — see rule R10 in CLAUDE.md.'
  )
})
