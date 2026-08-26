// [FR3] The free-text character limit — one number, imported by both the client (character
// guide on the input, app/pages/screen/[sessionId].vue) and the server (zod validation,
// server/api/screening/[id]/text.post.ts), so the two can never drift apart.

export const FREE_TEXT_MAX_LENGTH = 2000
