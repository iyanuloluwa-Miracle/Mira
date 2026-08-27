// [FR7] Client-side clinician auth state and actions — the parallel to useAuth.ts, but backed
// by the mira_clinician_session cookie and server/api/clinician/*, never
// server/api/auth/*. Kept in its own module-level state key ('clinician-session') so it can
// never be confused with useAuth's 'auth-session'.

interface ClinicianSession {
  authenticated: boolean
  fullName?: string
  role?: 'CLINICIAN' | 'ADMIN'
}

export function useClinicianAuth() {
  const session = useState<ClinicianSession>('clinician-session', () => ({ authenticated: false }))

  async function refresh(): Promise<void> {
    session.value = await $fetch<ClinicianSession>('/api/clinician/session')
  }

  async function login(email: string, password: string): Promise<void> {
    const result = await $fetch<{ fullName: string; role: 'CLINICIAN' | 'ADMIN' }>(
      '/api/clinician/login',
      { method: 'POST', body: { email, password } }
    )
    session.value = { authenticated: true, fullName: result.fullName, role: result.role }
  }

  async function logout(): Promise<void> {
    await $fetch('/api/clinician/logout', { method: 'POST' })
    session.value = { authenticated: false }
  }

  return {
    session: readonly(session),
    refresh,
    login,
    logout
  }
}
