import { prisma } from '../database/client.js';
import type { CategoryType } from '../domain/category.js';

export interface CategoryRecord {
  id: bigint;
  name: string;
  type: string;
}

export interface CategoryDetailRecord extends CategoryRecord {
  description: string;
}

export interface NewCategoryData {
  organizationId: bigint;
  name: string;
  description: string;
  type: CategoryType;
}

const categoryDetailSelection = {
  id: true,
  name: true,
  description: true,
  type: true,
} as const;

export async function findActiveCategories(
  organizationId: bigint,
  type?: CategoryType,
): Promise<CategoryDetailRecord[]> {
  return prisma.category.findMany({
    where: {
      organizationId,
      active: true,
      ...(type ? { type } : {}),
    },
    select: categoryDetailSelection,
    orderBy: { name: 'asc' },
  });
}

// A comparacao ignora maiusculas: para quem escolhe no formulario, "Transporte" e "transporte" sao a
// mesma categoria, embora o indice unico do banco diferencie as duas. Uma ativa tem precedencia.
export async function findCategoryByName(
  organizationId: bigint,
  name: string,
  type: CategoryType,
  exceptId?: bigint,
): Promise<{ id: bigint; active: boolean } | null> {
  return prisma.category.findFirst({
    where: {
      organizationId,
      type,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
    },
    select: { id: true, active: true },
    orderBy: [{ active: 'desc' }, { id: 'asc' }],
  });
}

export async function findActiveCategory(
  id: bigint,
  organizationId: bigint,
): Promise<CategoryDetailRecord | null> {
  return prisma.category.findFirst({
    where: { id, organizationId, active: true },
    select: categoryDetailSelection,
  });
}

export async function hasTransactions(categoryId: bigint): Promise<boolean> {
  const transaction = await prisma.transaction.findFirst({
    where: { categoryId },
    select: { id: true },
  });

  return transaction !== null;
}

// A condicao de ativa vai no proprio UPDATE: excluir de novo, ou excluir categoria de outra
// organizacao, nao altera nada e o chamador recebe false.
export async function deactivateCategory(id: bigint, organizationId: bigint): Promise<boolean> {
  const { count } = await prisma.category.updateMany({
    where: { id, organizationId, active: true },
    data: { active: false },
  });

  return count === 1;
}

// So a categoria ainda ativa e alterada: se ela foi excluida entre a leitura e a gravacao, nada
// muda e o chamador recebe null.
export async function updateActiveCategory(
  id: bigint,
  organizationId: bigint,
  data: Omit<NewCategoryData, 'organizationId'>,
): Promise<CategoryDetailRecord | null> {
  const { count } = await prisma.category.updateMany({
    where: { id, organizationId, active: true },
    data,
  });

  if (count === 0) {
    return null;
  }

  return prisma.category.findUniqueOrThrow({
    where: { id },
    select: categoryDetailSelection,
  });
}

export async function createCategory(data: NewCategoryData): Promise<CategoryDetailRecord> {
  return prisma.category.create({
    data: { ...data, active: true },
    select: categoryDetailSelection,
  });
}
