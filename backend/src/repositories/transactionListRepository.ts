import { prisma } from '../database/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { TransactionType } from '../domain/transaction.js';

export interface TransactionListFilters {
  organizationId: bigint;
  startDate?: Date;
  endDate?: Date;
  type?: TransactionType;
  categoryId?: bigint;
  userId?: bigint;
}

export interface TransactionListPagination {
  skip: number;
  take: number;
}

export interface TransactionListRecord {
  id: bigint;
  userId: bigint;
  date: Date;
  description: string;
  amount: Prisma.Decimal;
  type: string;
  status: string;
  category: { id: bigint; name: string };
  receipt: { id: bigint } | null;
}

export interface TransactionListPage {
  items: TransactionListRecord[];
  total: number;
}

// Apenas o identificador do comprovante e selecionado: basta para possuiComprovante e evita
// carregar o arquivo e os metadados. Lancamentos estornados permanecem na listagem, com o
// proprio status; excluir estorno e responsabilidade do saldo.
const transactionListSelection = {
  id: true,
  userId: true,
  date: true,
  description: true,
  amount: true,
  type: true,
  status: true,
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  receipt: {
    select: {
      id: true,
    },
  },
} satisfies Prisma.TransactionSelect;

function buildWhere(filters: TransactionListFilters): Prisma.TransactionWhereInput {
  const { organizationId, startDate, endDate, type, categoryId, userId } = filters;

  return {
    organizationId,
    ...(type ? { type } : {}),
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(userId === undefined ? {} : { userId }),
    ...(startDate || endDate
      ? {
          date: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
      : {}),
  };
}

export async function findTransactionsPage(
  filters: TransactionListFilters,
  pagination: TransactionListPagination,
): Promise<TransactionListPage> {
  // O mesmo objeto where alimenta as duas consultas, na mesma transacao, para que a pagina e a
  // contagem total nunca divirjam.
  const where = buildWhere(filters);

  const [items, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      select: transactionListSelection,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { items, total };
}

export async function findTransactionsForExport(
  filters: TransactionListFilters,
): Promise<TransactionListRecord[]> {
  return prisma.transaction.findMany({
    where: buildWhere(filters),
    select: transactionListSelection,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });
}
