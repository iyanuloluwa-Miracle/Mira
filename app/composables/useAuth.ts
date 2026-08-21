// [FR1] Client-side auth state and actions, wrapping server/api/auth/*. Never stores a token
// itself — the session lives in the httpOnly cookie the browser already manages; this only
// tracks what the server told us about it (pseudonym, authMode).

interface AuthSession {
  authenticated: boolean
  pseudonym?: string
  authMode?: 'ANONYMOUS' | 'REGISTERED'
}

interface AuthResult {
  pseudonym: string
  authMode: 'ANONYMOUS' | 'REGISTERED'
}

export function useAuth() {
  const session = useState<AuthSession>('auth-session', () => ({ authenticated: false }))

  function applyResult(result: AuthResult) {
    session.value = { authenticated: true, pseudonym: result.pseudonym, authMode: result.authMode }
  }

  async function refresh(): Promise<void> {
    session.value = await $fetch<AuthSession>('/api/auth/session')
  }

  // [R9] Ensures the caller has *some* session — anonymous if nothing else — without ever
  // requiring registration. Safe to call on every app load: a no-op if already signed in.
  async function ensureSession(): Promise<void> {
    await refresh()
    if (!session.value.authenticated) {
      applyResult(await $fetch<AuthResult>('/api/auth/anonymous-start', { method: 'POST' }))
    }
  }

  async function register(email: string, password: string): Promise<void> {
    applyResult(
      await $fetch<AuthResult>('/api/auth/register', { method: 'POST', body: { email, password } })
    )
  }

  async function login(email: string, password: string): Promise<void> {
    applyResult(
      await $fetch<AuthResult>('/api/auth/login', { method: 'POST', body: { email, password } })
    )
  }

  // Upgrades the current anonymous session to a registered account in place, preserving
  // history — see server/api/auth/claim-account.post.ts.
  async function claimAccount(email: string, password: string): Promise<void> {
    applyResult(
      await $fetch<AuthResult>('/api/auth/claim-account', {
        method: 'POST',
        body: { email, password }
      })
    )
  }

  async function logout(): Promise<void> {
    await $fetch('/api/auth/logout', { method: 'POST' })
    session.value = { authenticated: false }
  }

  return {
    session: readonly(session),
    refresh,
    ensureSession,
    register,
    login,
    claimAccount,
    logout
  }
}
