import { prisma } from '../../src/database/client.js';
import { Prisma } from '../../src/generated/prisma/client.js';

export async function createGoal(
  overrides: Pick<Prisma.GoalUncheckedCreateInput, 'organizationId'> &
    Partial<Omit<Prisma.GoalUncheckedCreateInput, 'organizationId'>>,
) {
  return prisma.goal.create({
    data: {
      description: 'Meta criada por uma factory de integração',
      targetAmount: new Prisma.Decimal('20000.00'),
      deadline: new Date('2026-12-31T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T12:00:00.000Z'),
      ...overrides,
    },
  });
}
