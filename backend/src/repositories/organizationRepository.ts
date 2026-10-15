import { prisma } from '../database/client.js';
import type { Prisma } from '../generated/prisma/client.js';

const organizationSelection = {
  id: true,
  name: true,
  description: true,
  managementStart: true,
  managementEnd: true,
  transparencyActive: true,
  publicLink: true,
} satisfies Prisma.OrganizationSelect;

export interface CreateOrganizationData {
  name: string;
  description: string;
  managementStart: Date;
  managementEnd: Date;
  creatorUserId: bigint;
  linkedAt: Date;
}

export interface UpdateOrganizationData {
  name?: string;
  description?: string;
  managementStart?: Date;
  managementEnd?: Date;
}

export async function findByPublicLink(publicLink: string) {
  return prisma.organization.findFirst({
    where: {
      publicLink,
      transparencyActive: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      managementStart: true,
      managementEnd: true,
      transparencyActive: true,
      publicLink: true,
    },
  });
}

export async function findById(id: bigint) {
  return prisma.organization.findUnique({
    where: { id },
    select: organizationSelection,
  });
}

export async function findActiveUserById(id: bigint) {
  return prisma.user.findFirst({
    where: {
      id,
      active: true,
    },
    select: {
      id: true,
    },
  });
}

/**
 * Cria a organização e o vínculo do criador como TESOUREIRO
 * na mesma transação do banco.
 */
export async function createWithTreasurer(data: CreateOrganizationData) {
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: data.name,
        description: data.description,
        managementStart: data.managementStart,
        managementEnd: data.managementEnd,
        transparencyActive: false,
        publicLink: null,
      },
      select: organizationSelection,
    });

    const membership = await tx.membership.create({
      data: {
        userId: data.creatorUserId,
        organizationId: organization.id,
        role: 'TESOUREIRO',
        linkedAt: data.linkedAt,
        active: true,
      },
      select: {
        id: true,
        role: true,
        linkedAt: true,
        active: true,
      },
    });

    return {
      organization,
      membership,
    };
  });
}

export async function countTransactionsOutsidePeriod(
  organizationId: bigint,
  managementStart: Date,
  managementEnd: Date,
) {
  return prisma.transaction.count({
    where: {
      organizationId,
      OR: [{ date: { lt: managementStart } }, { date: { gt: managementEnd } }],
    },
  });
}

export async function updateById(id: bigint, data: UpdateOrganizationData) {
  return prisma.organization.update({
    where: { id },
    data,
    select: organizationSelection,
  });
}
