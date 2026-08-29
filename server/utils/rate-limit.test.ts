import { describe, expect, it, vi } from 'vitest'
import { InMemoryRateLimiter } from './rate-limit'

describe('InMemoryRateLimiter', () => {
  it('allows up to max requests within the window, then denies', () => {
    const limiter = new InMemoryRateLimiter(3, 60_000)

    expect(limiter.consume('key').allowed).toBe(true)
    expect(limiter.consume('key').allowed).toBe(true)
    expect(limiter.consume('key').allowed).toBe(true)
    const denied = limiter.consume('key')
    expect(denied.allowed).toBe(false)
    expect(denied.remaining).toBe(0)
    expect(denied.retryAfterMs).toBeGreaterThan(0)
  })

  it('tracks remaining correctly as the window fills', () => {
    const limiter = new InMemoryRateLimiter(3, 60_000)

    expect(limiter.consume('key').remaining).toBe(2)
    expect(limiter.consume('key').remaining).toBe(1)
    expect(limiter.consume('key').remaining).toBe(0)
  })

  it('keeps separate budgets per key', () => {
    const limiter = new InMemoryRateLimiter(1, 60_000)

    expect(limiter.consume('a').allowed).toBe(true)
    expect(limiter.consume('b').allowed).toBe(true)
    expect(limiter.consume('a').allowed).toBe(false)
  })

  it('resets the budget once the window has elapsed', () => {
    vi.useFakeTimers()
    try {
      const limiter = new InMemoryRateLimiter(1, 1000)

      expect(limiter.consume('key').allowed).toBe(true)
      expect(limiter.consume('key').allowed).toBe(false)

      vi.advanceTimersByTime(1001)

      expect(limiter.consume('key').allowed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
