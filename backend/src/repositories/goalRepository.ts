import { prisma } from '../database/client.js';
import { BALANCE_AFFECTING_STATUS, INCOME_TYPE } from '../domain/transaction.js';
import { Prisma } from '../generated/prisma/client.js';

export interface GoalRecord {
  id: bigint;
  description: string;
  targetAmount: Prisma.Decimal;
  deadline: Date;
  createdAt: Date;
}

export async function findGoalsByOrganization(organizationId: bigint): Promise<GoalRecord[]> {
  return prisma.goal.findMany({
    where: { organizationId },
    select: { id: true, description: true, targetAmount: true, deadline: true, createdAt: true },
    orderBy: [{ deadline: 'asc' }, { id: 'asc' }],
  });
}

// Soma das entradas ativas da organização no intervalo. Estornos e saídas não contam.
export async function sumValidIncome(
  organizationId: bigint,
  startDate: Date,
  endDate: Date,
): Promise<Prisma.Decimal> {
  const result = await prisma.transaction.aggregate({
    where: {
      organizationId,
      type: INCOME_TYPE,
      status: BALANCE_AFFECTING_STATUS,
      date: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
  });

  return result._sum.amount ?? new Prisma.Decimal(0);
}
