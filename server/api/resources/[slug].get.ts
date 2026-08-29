// [FR5] Serves one resource's full content. No requireUser() call — same zero-auth posture as
// the listing route, resources are reachable without completing a screening and without an
// account. Markdown -> HTML rendering happens here, per request, rather than at seed time, so
// content/resources/*.md stays the single authored source and Postgres only ever stores the raw
// markdown (Resource.body). This is safe to render as v-html client-side because the content is
// fully trusted — authored only via content/resources/*.md and ingested by prisma/seed.ts, never
// from user input.

import { marked } from 'marked'

export default defineEventHandler(async (event) => {
  const parsedParam = slugParamSchema.safeParse(getRouterParam(event, 'slug'))
  if (!parsedParam.success) badRequestError('A valid resource slug is required.')
  const slug = parsedParam.data

  if (!emptyQuerySchema.safeParse(getQuery(event)).success) {
    badRequestError('This endpoint does not accept a query string.')
  }

  const resource = await prisma.resource.findUnique({ where: { slug } })
  if (!resource || !resource.isActive) notFoundError('Resource not found.')

  return {
    slug: resource.slug,
    title: resource.title,
    tags: resource.tags,
    minRisk: resource.minRisk,
    maxRisk: resource.maxRisk,
    readingTimeMinutes: resource.readingTimeMinutes,
    language: resource.language,
    sourceAttribution: resource.sourceAttribution,
    bodyHtml: await marked.parse(resource.body)
  }
})
