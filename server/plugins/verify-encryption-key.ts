// [R5] Refuse to boot without valid encryption key material — see server/utils/crypto.ts,
// where the actual validation logic lives (and is unit tested).

export default defineNitroPlugin(() => {
  assertEncryptionKeyPresent()
})
