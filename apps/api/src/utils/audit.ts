import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

interface AuditLogInput {
  userId: string;
  action: string;
  targetTable?: string;
  targetId?: string;
  meta?: Prisma.InputJsonValue;
  ip?: string;
}

export async function auditLog({
  userId,
  action,
  targetTable,
  targetId,
  meta,
  ip,
}: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      targetTable,
      targetId,
      meta,
      ip,
    },
  });
}
