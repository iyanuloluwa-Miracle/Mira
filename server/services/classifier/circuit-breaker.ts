// [R7] A standard three-state breaker (closed -> open -> half-open -> closed/open) protecting
// HttpClassifier from hammering a genuinely-down classifier service. Each classify() call is
// one unit of success/failure here, regardless of how many raw HTTP attempts it made
// internally (see http-classifier.ts's own one-retry) — the breaker is about the downstream
// service's overall health, not about smoothing over a single flaky request.

export type CircuitBreakerState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  // Consecutive failures before the breaker opens.
  failureThreshold: number
  // How long the breaker stays open before allowing one trial ("half-open") call through.
  cooldownMs: number
  // Injectable so tests can control elapsed time without real timers.
  now?: () => number
}

export class CircuitBreaker {
  private readonly failureThreshold: number
  private readonly cooldownMs: number
  private readonly now: () => number

  private state: CircuitBreakerState = 'closed'
  private consecutiveFailures = 0
  private openedAt = 0

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold
    this.cooldownMs = options.cooldownMs
    this.now = options.now ?? Date.now
  }

  getState(): CircuitBreakerState {
    return this.state
  }

  // Call before attempting the protected operation. Transitions open -> half-open itself once
  // the cooldown has elapsed, so the caller doesn't need to track that separately.
  canAttempt(): boolean {
    if (this.state === 'closed' || this.state === 'half-open') return true

    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.state = 'half-open'
      return true
    }
    return false
  }

  recordSuccess(): void {
    this.state = 'closed'
    this.consecutiveFailures = 0
  }

  recordFailure(): void {
    if (this.state === 'half-open') {
      this.open()
      return
    }

    this.consecutiveFailures += 1
    if (this.consecutiveFailures >= this.failureThreshold) this.open()
  }

  private open(): void {
    this.state = 'open'
    this.openedAt = this.now()
  }
}
