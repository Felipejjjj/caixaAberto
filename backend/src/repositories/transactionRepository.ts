import { prisma } from '../database/client.js';
import { Prisma } from '../generated/prisma/client.js';

export type CreateTransactionData = {
  organizationId: bigint;
  userId: bigint;
  categoryId: bigint;
  amount: Prisma.Decimal;
  date: Date;
  type: string;
  description: string;
  source?: string | null;
  recipient?: string | null;
  status: string;
  createdAt: Date;
};

export type UpdateTransactionData = {
  categoryId?: bigint;
  amount?: Prisma.Decimal;
  date?: Date;
  type?: string;
  description?: string;
  source?: string | null;
  recipient?: string | null;
};

const transactionInclude = {
  category: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  receipt: {
    select: {
      id: true,
      fileName: true,
      fileType: true,
      size: true,
      fileUrl: true,
      uploadedAt: true,
    },
  },
} satisfies Prisma.TransactionInclude;

export async function createTransaction(data: CreateTransactionData) {
  return prisma.transaction.create({
    data,
    include: transactionInclude,
  });
}

export async function getOrganizationById(id: bigint) {
  return prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      transparencyActive: true,
      publicLink: true,
      managementStart: true,
      managementEnd: true,
    },
  });
}

export async function getCategoryForOrganization(
  categoryId: bigint,
  organizationId: bigint,
  transactionType: string,
) {
  return prisma.category.findFirst({
    where: {
      id: categoryId,
      organizationId,
      active: true,
      OR: [{ type: transactionType }, { type: 'AMBOS' }, { type: 'TODOS' }],
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });
}

export async function findTransactionById(id: bigint, organizationId: bigint) {
  return prisma.transaction.findFirst({
    where: { id, organizationId },
    include: transactionInclude,
  });
}

/**
 * Atualiza somente campos editáveis de um lançamento da organização.
 *
 * O filtro também impede a atualização de lançamentos estornados.
 * Retorna null quando nenhum registro corresponde aos critérios.
 */
export async function updateTransaction(
  id: bigint,
  organizationId: bigint,
  data: UpdateTransactionData,
) {
  const result = await prisma.transaction.updateMany({
    where: {
      id,
      organizationId,
      reversedAt: null,
      status: {
        not: 'ESTORNADO',
      },
    },
    data,
  });

  if (result.count === 0) {
    return null;
  }

  return findTransactionById(id, organizationId);
}

export async function getMonthlySummary(organizationId: bigint, start: Date, end: Date) {
  return prisma.transaction.groupBy({
    by: ['type'],
    where: {
      organizationId,
      date: { gte: start, lt: end },
      reversedAt: null,
      status: { not: 'ESTORNADO' },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
}

export async function getPublicOrganizationByLink(publicLink: string) {
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
      publicLink: true,
      transparencyActive: true,
    },
  });
}

export async function getPublicMonthlyAggregates(organizationId: bigint, start: Date, end: Date) {
  return prisma.transaction.groupBy({
    by: ['type', 'categoryId'],
    where: {
      organizationId,
      date: { gte: start, lt: end },
      reversedAt: null,
      status: { not: 'ESTORNADO' },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
}

export async function getCategoriesByIds(categoryIds: bigint[], organizationId: bigint) {
  if (categoryIds.length === 0) return [];

  return prisma.category.findMany({
    where: {
      id: { in: categoryIds },
      organizationId,
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });
}
