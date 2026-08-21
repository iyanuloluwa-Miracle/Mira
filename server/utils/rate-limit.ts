// [NFR4] Request rate limiting shared across server/api routes and server/middleware.
// In-memory for MVP1 (fine for a single-process deployment); RateLimiter is the seam a
// Redis-backed implementation can slot into later without touching call sites.

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export interface RateLimiter {
  consume(key: string): RateLimitResult
}

interface Window {
  count: number
  windowStart: number
}

// Once the in-memory map holds more than this many keys, the next consume() call sweeps
// expired windows before inserting, so a long-running process doesn't accumulate one entry
// per distinct hashed IP forever.
const SWEEP_THRESHOLD = 10_000

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  consume(key: string): RateLimitResult {
    const now = Date.now()

    if (this.windows.size > SWEEP_THRESHOLD) this.sweep(now)

    const existing = this.windows.get(key)

    if (!existing || now - existing.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now })
      return { allowed: true, remaining: this.max - 1, retryAfterMs: 0 }
    }

    existing.count += 1

    if (existing.count > this.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.windowMs - (now - existing.windowStart)
      }
    }

    return { allowed: true, remaining: this.max - existing.count, retryAfterMs: 0 }
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.windowStart >= this.windowMs) this.windows.delete(key)
    }
  }
}

// [FR1] Shared limiter for the authentication endpoints most worth protecting from brute
// force / enumeration: 10 attempts per 15 minutes per hashed IP. A single process-wide
// instance so the limit applies across requests, not per-request.
export const authRateLimiter: RateLimiter = new InMemoryRateLimiter(10, 15 * 60 * 1000)
