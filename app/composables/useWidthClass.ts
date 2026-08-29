// [NFR1] A literal, closed set of Tailwind arbitrary-value classes for a proportional bar width
// — never a `:style` binding, which would need 'unsafe-inline' in the CSP's style-src
// (server/plugins/security-headers.ts). Shared by app/components/screening/ProgressBar.vue and
// app/pages/admin/metrics.vue's charts. Every string below must appear literally in source for
// Tailwind's scanner to generate the matching CSS at build time — do not construct these
// dynamically.
export const WIDTH_CLASSES = [
  'w-[0%]',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-[100%]'
] as const

// percentage is rounded to the nearest 5% bucket (0-100), clamped, and mapped to one of the
// classes above.
export function useWidthClass(percentage: number): (typeof WIDTH_CLASSES)[number] {
  const bucket = Math.min(20, Math.max(0, Math.round(percentage / 5)))
  // Always in range (bucket is clamped to [0, 20] and WIDTH_CLASSES has exactly 21 entries).
  return WIDTH_CLASSES[bucket]!
}
