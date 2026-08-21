// [R4] Defense-in-depth: redact any object arguments passed to console.* globally, so a stray
// console.log elsewhere in the codebase can't leak plaintext free text, identifiers or tokens.
// Application code should still prefer server/utils/logger.ts directly rather than relying on
// this safety net as the primary mechanism.

export default defineNitroPlugin(() => {
  installConsoleRedaction()
})
