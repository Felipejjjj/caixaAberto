import { createHash } from 'node:crypto';

import { prisma } from '../database/client.js';

// O token nunca e guardado em texto: a lista de revogacao trabalha sobre o hash.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function revoke(token: string, userId: bigint, expiresAt: Date) {
  const tokenHash = hashToken(token);

  return prisma.revokedToken.upsert({
    where: { tokenHash },
    update: {},
    create: {
      tokenHash,
      userId,
      expiresAt,
      revokedAt: new Date(),
    },
  });
}

async function isRevoked(token: string): Promise<boolean> {
  const revoked = await prisma.revokedToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true },
  });

  return revoked !== null;
}

// Uma revogacao so precisa viver enquanto o token ainda poderia ser aceito.
async function deleteExpired(now: Date = new Date()) {
  return prisma.revokedToken.deleteMany({
    where: { expiresAt: { lt: now } },
  });
}

// Todas as sessoes do usuario emitidas antes deste momento estao encerradas. Nulo quando nada as
// encerrou; usuario inexistente tambem volta nulo, e quem barra a conta e o loadContext.
async function findSessionsValidFrom(userId: bigint): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionsValidFrom: true },
  });

  return user?.sessionsValidFrom ?? null;
}

export default { revoke, isRevoked, deleteExpired, hashToken, findSessionsValidFrom };
