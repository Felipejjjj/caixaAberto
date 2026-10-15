import { prisma } from '../database/client.js';
import type { Role } from '../domain/auth-context.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface MemberRecord {
  id: bigint;
  role: string;
  linkedAt: Date;
  active: boolean;
  user: { id: bigint; name: string; email: string };
}

export interface NewMembershipData {
  userId: bigint;
  organizationId: bigint;
  role: Role;
  linkedAt: Date;
}

const memberSelection = {
  id: true,
  role: true,
  linkedAt: true,
  active: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.MembershipSelect;

export async function findActiveMembers(organizationId: bigint): Promise<MemberRecord[]> {
  return prisma.membership.findMany({
    where: { organizationId, active: true },
    select: memberSelection,
    orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
  });
}

// Um vinculo ativo em outra organizacao significa que a conta tambem responde a outro tesoureiro.
export async function hasActiveMembershipOutside(
  userId: bigint,
  organizationId: bigint,
): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: { userId, active: true, organizationId: { not: organizationId } },
    select: { id: true },
  });

  return membership !== null;
}

export async function findUserByEmail(
  email: string,
): Promise<{ id: bigint; active: boolean } | null> {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, active: true },
  });
}

export async function findMembership(
  userId: bigint,
  organizationId: bigint,
): Promise<{ id: bigint; active: boolean } | null> {
  return prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { id: true, active: true },
  });
}

export async function createMembership(data: NewMembershipData): Promise<MemberRecord> {
  return prisma.membership.create({
    data: { ...data, active: true },
    select: memberSelection,
  });
}

// A condicao de inativo vai no proprio UPDATE: se outro pedido reativou o vinculo antes, nada muda
// e o chamador recebe null.
export async function reactivateMembership(
  id: bigint,
  role: Role,
  linkedAt: Date,
): Promise<MemberRecord | null> {
  const { count } = await prisma.membership.updateMany({
    where: { id, active: false },
    data: { active: true, role, linkedAt },
  });

  if (count === 0) {
    return null;
  }

  return prisma.membership.findUniqueOrThrow({
    where: { id },
    select: memberSelection,
  });
}

export class LastActiveTreasurerError extends Error {
  constructor() {
    super('A organização precisa manter ao menos um tesoureiro ativo');
    this.name = 'LastActiveTreasurerError';
  }
}

/**
 * Altera o papel de um vínculo ativo dentro da organização indicada.
 *
 * Retorna null se o vínculo não existir nessa organização,
 * estiver inativo ou deixar de corresponder aos critérios da atualização.
 */
export async function updateActiveMemberRole(
  id: bigint,
  organizationId: bigint,
  role: Role,
): Promise<MemberRecord | null> {
  return prisma.$transaction(
    async (transaction) => {
      const current = await transaction.membership.findFirst({
        where: { id, organizationId, active: true },
        select: { role: true },
      });

      if (!current) return null;

      if (current.role === 'TESOUREIRO' && role === 'CONSULTOR') {
        const activeTreasurers = await transaction.membership.count({
          where: { organizationId, active: true, role: 'TESOUREIRO' },
        });
        if (activeTreasurers <= 1) throw new LastActiveTreasurerError();
      }

      const { count } = await transaction.membership.updateMany({
        where: { id, organizationId, active: true, role: current.role },
        data: { role },
      });
      if (count === 0) return null;

      return transaction.membership.findFirst({
        where: { id, organizationId, active: true },
        select: memberSelection,
      });
    },
    { isolationLevel: 'Serializable' },
  );
}
