// Shared Prisma client. Lazily constructed on first use — not at module import time — so that
// integration tests can set DATABASE_URL (see tests/integration/helpers/test-server.ts) before
// any query actually runs, and so a single instance survives Nitro's dev-mode hot reload
// instead of leaking a new connection pool on every file change.

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { __miraPrisma?: PrismaClient }

function getPrismaClient(): PrismaClient {
  globalForPrisma.__miraPrisma ??= new PrismaClient()
  return globalForPrisma.__miraPrisma
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient(), prop, receiver)
  }
})
