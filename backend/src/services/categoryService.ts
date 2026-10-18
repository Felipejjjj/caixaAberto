import { assertKnownCategoryType, type CategoryType } from '../domain/category.js';
import { AppError } from '../errors/app-error.js';
import { Prisma } from '../generated/prisma/client.js';
import * as categoryRepository from '../repositories/categoryRepository.js';
import type { CategoryDetailRecord } from '../repositories/categoryRepository.js';

const DUPLICATE_CATEGORY = 'Já existe uma categoria com esse nome e tipo';
const DUPLICATE_INACTIVE_CATEGORY = 'Já existe uma categoria desativada com esse nome e tipo';
const CATEGORY_NOT_FOUND = 'Categoria não encontrada';
const TYPE_LOCKED_BY_TRANSACTIONS = 'Categoria com lançamentos não pode mudar de tipo';

export interface CategoryResponse {
  id: string;
  nome: string;
  tipo: string;
}

export interface CategoryDetailResponse extends CategoryResponse {
  descricao: string;
}

// A descricao vem na listagem porque a tela de categorias edita a partir dela (CA-F11-06).
export interface CategoryListResponse {
  dados: CategoryDetailResponse[];
}

export interface CategoryInput {
  name: string;
  description: string;
  type: CategoryType;
}

export type CategoryChanges = Partial<CategoryInput>;

export async function listActiveCategories(
  organizationId: bigint,
  type?: CategoryType,
): Promise<CategoryListResponse> {
  const categories = await categoryRepository.findActiveCategories(organizationId, type);

  return { dados: categories.map(toDetailResponse) };
}

function toDetailResponse(category: CategoryDetailRecord): CategoryDetailResponse {
  return {
    id: category.id.toString(),
    nome: category.name,
    descricao: category.description,
    tipo: category.type,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// O indice unico do banco vale tambem para categoria desativada, entao o nome dela continua
// ocupado. A mensagem diz isso, para o tesoureiro nao procurar uma categoria que a lista nao mostra.
async function assertNameAvailable(
  organizationId: bigint,
  name: string,
  type: CategoryType,
  exceptId?: bigint,
): Promise<void> {
  const existing = await categoryRepository.findCategoryByName(
    organizationId,
    name,
    type,
    exceptId,
  );

  if (existing) {
    throw new AppError(409, existing.active ? DUPLICATE_CATEGORY : DUPLICATE_INACTIVE_CATEGORY);
  }
}

export async function createCategory(
  organizationId: bigint,
  input: CategoryInput,
): Promise<CategoryDetailResponse> {
  await assertNameAvailable(organizationId, input.name, input.type);

  try {
    const category = await categoryRepository.createCategory({ organizationId, ...input });

    return toDetailResponse(category);
  } catch (error) {
    // Dois cadastros simultaneos passam juntos pela conferencia acima; o indice unico barra o segundo.
    if (isUniqueViolation(error)) {
      throw new AppError(409, DUPLICATE_CATEGORY);
    }

    throw error;
  }
}

// Os lancamentos guardam a categoria pelo id, entao renomear ja aparece no historico sem tocar em
// valor nenhum. Categoria desativada responde como inexistente: a exclusao a tirou de uso.
export async function updateCategory(
  organizationId: bigint,
  categoryId: bigint,
  changes: CategoryChanges,
): Promise<CategoryDetailResponse> {
  const current = await categoryRepository.findActiveCategory(categoryId, organizationId);

  if (!current) {
    throw new AppError(404, CATEGORY_NOT_FOUND);
  }

  const target = {
    name: changes.name ?? current.name,
    description: changes.description ?? current.description,
    type: changes.type ?? assertKnownCategoryType(current.type),
  };

  if (changes.name !== undefined || changes.type !== undefined) {
    await assertNameAvailable(organizationId, target.name, target.type, categoryId);
  }

  // Com lancamentos, trocar o tipo deixaria entrada registrada em categoria de saida, ou o contrario.
  if (target.type !== current.type && (await categoryRepository.hasTransactions(categoryId))) {
    throw new AppError(409, TYPE_LOCKED_BY_TRANSACTIONS);
  }

  let updated: CategoryDetailRecord | null;

  try {
    updated = await categoryRepository.updateActiveCategory(categoryId, organizationId, target);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, DUPLICATE_CATEGORY);
    }

    throw error;
  }

  if (!updated) {
    throw new AppError(404, CATEGORY_NOT_FOUND);
  }

  return toDetailResponse(updated);
}

// A exclusao e logica: a categoria sai dos formularios, mas os lancamentos que ja a usam continuam
// mostrando o nome dela, e o relatorio segue somando o que foi registrado nela.
export async function deactivateCategory(
  organizationId: bigint,
  categoryId: bigint,
): Promise<void> {
  const deactivated = await categoryRepository.deactivateCategory(categoryId, organizationId);

  if (!deactivated) {
    throw new AppError(404, CATEGORY_NOT_FOUND);
  }
}
