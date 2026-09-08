import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Only 'error' is logged in both dev and prod — 'query' logging was adding
// per-request overhead (every query serialized and printed to stdout) that
// showed up as real, measurable latency on a slow portal, not just noise.
export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
