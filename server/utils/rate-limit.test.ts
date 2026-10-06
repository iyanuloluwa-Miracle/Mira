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

  it('sweeps expired windows once the map grows past the threshold, without losing a still-active one', () => {
    vi.useFakeTimers()
    try {
      const limiter = new InMemoryRateLimiter(5, 1000)

      // These 10,001 keys' windows are all expired by the time the sweep threshold is crossed —
      // the sweep triggers on the very next consume() call once the map holds more than 10,000
      // entries (SWEEP_THRESHOLD), so it fires partway through this loop, not after it.
      for (let i = 0; i < 10_001; i++) limiter.consume(`stale-${i}`)

      vi.advanceTimersByTime(1001)

      // A key whose window is still within its (now-refreshed) budget must survive the sweep
      // pass triggered by the next consume() below, not be evicted along with the expired ones.
      const fresh = limiter.consume('fresh-key')
      expect(fresh.allowed).toBe(true)
      expect(fresh.remaining).toBe(4)
    } finally {
      vi.useRealTimers()
    }
  })
})
