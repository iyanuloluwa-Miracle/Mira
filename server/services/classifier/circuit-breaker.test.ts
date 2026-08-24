import { describe, expect, it } from 'vitest'
import { CircuitBreaker } from './circuit-breaker'

// A controllable clock so cooldown-elapsed behavior is tested deterministically, without real
// timers or sleeps.
function fakeClock(startAt = 0) {
  let now = startAt
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms
    }
  }
}

describe('CircuitBreaker — starts closed', () => {
  it('allows attempts and stays closed while nothing has failed', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 })
    expect(breaker.getState()).toBe('closed')
    expect(breaker.canAttempt()).toBe(true)
  })
})

describe('CircuitBreaker — opening', () => {
  it('opens after exactly `failureThreshold` consecutive failures', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 })

    for (let i = 0; i < 4; i += 1) breaker.recordFailure()
    expect(breaker.getState()).toBe('closed')

    breaker.recordFailure()
    expect(breaker.getState()).toBe('open')
  })

  it('blocks further attempts once open, before the cooldown elapses', () => {
    const clock = fakeClock()
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000, now: clock.now })

    breaker.recordFailure()
    expect(breaker.getState()).toBe('open')
    expect(breaker.canAttempt()).toBe(false)
  })

  it('resets the failure count on any success before the threshold is reached', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 })

    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordSuccess()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()

    // Only 3 consecutive failures since the reset — below the threshold of 5.
    expect(breaker.getState()).toBe('closed')
  })
})

describe('CircuitBreaker — recovery', () => {
  it('stays open until the cooldown has elapsed', () => {
    const clock = fakeClock()
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000, now: clock.now })

    breaker.recordFailure()
    clock.advance(29_999)
    expect(breaker.canAttempt()).toBe(false)
    expect(breaker.getState()).toBe('open')
  })

  it('transitions to half-open and allows one attempt once the cooldown elapses', () => {
    const clock = fakeClock()
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000, now: clock.now })

    breaker.recordFailure()
    clock.advance(30_000)

    expect(breaker.canAttempt()).toBe(true)
    expect(breaker.getState()).toBe('half-open')
  })

  it('closes on a successful half-open attempt', () => {
    const clock = fakeClock()
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000, now: clock.now })

    breaker.recordFailure()
    clock.advance(30_000)
    breaker.canAttempt()
    breaker.recordSuccess()

    expect(breaker.getState()).toBe('closed')
    expect(breaker.canAttempt()).toBe(true)
  })

  it('reopens (with a fresh cooldown) on a failed half-open attempt', () => {
    const clock = fakeClock()
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000, now: clock.now })

    breaker.recordFailure()
    clock.advance(30_000)
    breaker.canAttempt()
    breaker.recordFailure()

    expect(breaker.getState()).toBe('open')
    expect(breaker.canAttempt()).toBe(false)

    clock.advance(30_000)
    expect(breaker.canAttempt()).toBe(true)
    expect(breaker.getState()).toBe('half-open')
  })
})
