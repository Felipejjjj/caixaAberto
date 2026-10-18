import { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { getContexto } from '../middlewares/load-context.js';
import * as transactionRepository from '../repositories/transactionRepository.js';

const TRANSACTION_TYPES = ['ENTRADA', 'SAIDA'] as const;
type TransactionType = (typeof TRANSACTION_TYPES)[number];

function parseBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
    if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
    return null;
  } catch {
    return null;
  }
}

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; // valida datas no formato YYYY-MM-DD
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // O construtor aceita dia inexistente e rola para o mes seguinte, entao a data so e
  // valida se voltar exatamente igual ao que foi informado.
  return date.toISOString().slice(0, 10) === value ? date : null;
}

// Teto da coluna valor, DECIMAL(12,2). Sem esta checagem o insert falhava no banco e a
// entrada do usuario terminava como erro 500.
const VALOR_MAXIMO = new Prisma.Decimal('9999999999.99');

function parseMoney(value: unknown): Prisma.Decimal | null {
  try {
    if (value === null || value === undefined || value === '') return null;
    const decimal = new Prisma.Decimal(String(value));
    if (!decimal.isFinite() || decimal.lte(0) || decimal.gt(VALOR_MAXIMO)) return null;
    return decimal;
  } catch {
    return null;
  }
}

function serialize(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      if (item instanceof Prisma.Decimal) return item.toString();
      if (item instanceof Date) return item.toISOString();
      return item;
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(object: Record<string, unknown>, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, property);
}

async function create(req: Request, res: Response, forcedType: TransactionType) {
  try {
    const { organizacaoId: organizationId, usuarioId: userId } = getContexto(req);

    const {
      categoryId: rawCategoryId,
      amount: rawAmount,
      date: rawDate,
      description,
      source,
      recipient,
    } = req.body ?? {};

    const categoryId = parseBigInt(rawCategoryId);
    const amount = parseMoney(rawAmount);
    const date = parseDateOnly(rawDate);

    if (!categoryId || !amount || !date || !description) {
      return res.status(400).json({
        erro: 'categoryId, amount, date e description são obrigatórios e válidos.',
      });
    }

    if (
      typeof description !== 'string' ||
      description.trim().length === 0 ||
      description.length > 5000
    ) {
      return res
        .status(400)
        .json({ erro: 'description deve ser um texto entre 1 e 5000 caracteres.' });
    }

    if (source !== undefined && source !== null && typeof source !== 'string') {
      return res.status(400).json({ erro: 'source deve ser texto.' });
    }

    if (recipient !== undefined && recipient !== null && typeof recipient !== 'string') {
      return res.status(400).json({ erro: 'recipient deve ser texto.' });
    }

    const organization = await transactionRepository.getOrganizationById(organizationId);
    if (!organization) return res.status(404).json({ erro: 'Organização não encontrada.' });

    if (
      !organization.managementStart ||
      date < organization.managementStart ||
      date > organization.managementEnd
    ) {
      return res.status(400).json({
        erro: 'A data do lançamento deve estar dentro do período de gestão da organização.',
      });
    }

    const category = await transactionRepository.getCategoryForOrganization(
      categoryId,
      organizationId,
      forcedType,
    );

    if (!category) {
      return res.status(400).json({
        erro: 'Categoria não encontrada, inativa ou incompatível com o tipo do lançamento.',
      });
    }

    const transaction = await transactionRepository.createTransaction({
      organizationId,
      userId,
      categoryId,
      amount,
      date,
      type: forcedType,
      description: description.trim(),
      source: typeof source === 'string' && source.trim() ? source.trim() : null,
      recipient: typeof recipient === 'string' && recipient.trim() ? recipient.trim() : null,
      status: 'ATIVO',
      createdAt: new Date(),
    });

    return res.status(201).json(serialize(transaction));
  } catch (error) {
    console.error(`[create ${forcedType.toLowerCase()}]`, error);
    return res.status(500).json({ erro: 'Erro interno ao registrar lançamento.' });
  }
}

export async function createTransaction(req: Request, res: Response) {
  const requestedType = String(req.body?.tipo ?? req.body?.type ?? '').toUpperCase();

  if (!TRANSACTION_TYPES.includes(requestedType as TransactionType)) {
    return res.status(400).json({
      erro: 'tipo deve ser ENTRADA ou SAIDA.',
    });
  }

  return create(req, res, requestedType as TransactionType);
}

/**
 * PUT /lancamentos/:id
 *
 * Aceita alterações parciais dos campos editáveis.
 * Os dados finais do lançamento são revalidados antes da atualização.
 */
export async function updateOne(req: Request, res: Response) {
  try {
    const { organizacaoId: organizationId } = getContexto(req);

    const id = parseBigInt(req.params.id);

    if (!id) {
      return res.status(400).json({
        erro: 'id é obrigatório e deve ser válido.',
      });
    }

    if (!isRecord(req.body)) {
      return res.status(400).json({
        erro: 'O corpo da requisição deve ser um objeto JSON.',
      });
    }

    const body = req.body;

    // Apenas esses campos podem ser alterados por esta API.
    const editableFields = new Set([
      'categoryId',
      'amount',
      'date',
      'description',
      'source',
      'recipient',
    ]);

    const unsupportedFields = Object.keys(body).filter((field) => !editableFields.has(field));

    if (unsupportedFields.length > 0) {
      return res.status(400).json({
        erro: 'A requisição contém campos desconhecidos ou não editáveis.',
        campos: unsupportedFields,
      });
    }

    if (Object.keys(body).length === 0) {
      return res.status(400).json({
        erro: 'Informe pelo menos um campo para atualizar.',
      });
    }

    // A consulta já restringe o lançamento à organização selecionada.
    const currentTransaction = await transactionRepository.findTransactionById(id, organizationId);

    if (!currentTransaction) {
      return res.status(404).json({
        erro: 'Lançamento não encontrado.',
      });
    }

    // Lançamentos estornados não podem ser modificados.
    if (currentTransaction.reversedAt || currentTransaction.status === 'ESTORNADO') {
      return res.status(409).json({
        erro: 'Lançamento estornado não pode ser editado. Registre um novo lançamento com os dados corretos.',
      });
    }

    /*
     * Monta o estado final do lançamento.
     *
     * Se um campo não foi enviado, seu valor atual é mantido.
     * Se foi enviado, o novo valor é validado.
     */
    const categoryId = hasOwn(body, 'categoryId')
      ? parseBigInt(body.categoryId)
      : currentTransaction.categoryId;

    const amount = hasOwn(body, 'amount')
      ? parseMoney(body.amount)
      : parseMoney(currentTransaction.amount);

    const date = hasOwn(body, 'date') ? parseDateOnly(body.date) : currentTransaction.date;

    if (!categoryId || !amount || !date) {
      return res.status(400).json({
        erro: 'categoryId, amount ou date inválidos.',
      });
    }

    let description = currentTransaction.description;

    if (hasOwn(body, 'description')) {
      if (
        typeof body.description !== 'string' ||
        body.description.trim().length === 0 ||
        body.description.length > 5000
      ) {
        return res.status(400).json({
          erro: 'description deve ser um texto entre 1 e 5000 caracteres.',
        });
      }

      description = body.description.trim();
    }

    let source: string | null = currentTransaction.source;
    let recipient: string | null = currentTransaction.recipient;

    if (hasOwn(body, 'source')) {
      if (body.source !== null && typeof body.source !== 'string') {
        return res.status(400).json({
          erro: 'source deve ser texto ou null.',
        });
      }

      source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : null;
    }

    if (hasOwn(body, 'recipient')) {
      if (body.recipient !== null && typeof body.recipient !== 'string') {
        return res.status(400).json({
          erro: 'recipient deve ser texto ou null.',
        });
      }

      recipient =
        typeof body.recipient === 'string' && body.recipient.trim() ? body.recipient.trim() : null;
    }

    const type = currentTransaction.type;

    if (hasOwn(body, 'date')) {
      const organization = await transactionRepository.getOrganizationById(organizationId);

      if (!organization) {
        return res.status(404).json({
          erro: 'Organização não encontrada.',
        });
      }

      if (
        !organization.managementStart ||
        !organization.managementEnd ||
        date < organization.managementStart ||
        date > organization.managementEnd
      ) {
        return res.status(400).json({
          erro: 'A data do lançamento deve estar dentro do período de gestão da organização.',
        });
      }
    }

    /*
     * Revalida a categoria so quando ela muda. Excluir categoria apenas a desativa, e o lancamento
     * que ja esta nela precisa continuar corrigivel.
     */
    if (categoryId !== currentTransaction.categoryId) {
      const category = await transactionRepository.getCategoryForOrganization(
        categoryId,
        organizationId,
        type,
      );

      if (!category) {
        return res.status(400).json({
          erro: 'Categoria não encontrada, inativa ou incompatível com o tipo do lançamento.',
        });
      }
    }

    const updatedTransaction = await transactionRepository.updateTransaction(id, organizationId, {
      categoryId,
      amount,
      date,
      type,
      description,
      source,
      recipient,
    });

    if (!updatedTransaction) {
      // Verifica se o lançamento foi removido ou estornado durante a operação.
      const latestTransaction = await transactionRepository.findTransactionById(id, organizationId);

      if (!latestTransaction) {
        return res.status(404).json({
          erro: 'Lançamento não encontrado.',
        });
      }

      if (latestTransaction.reversedAt || latestTransaction.status === 'ESTORNADO') {
        return res.status(409).json({
          erro: 'Lançamento estornado não pode ser editado. Registre um novo lançamento com os dados corretos.',
        });
      }

      return res.status(409).json({
        erro: 'Não foi possível atualizar o lançamento. Tente novamente.',
      });
    }

    return res.status(200).json(serialize(updatedTransaction));
  } catch (error) {
    console.error('[update transaction]', error);

    return res.status(500).json({
      erro: 'Erro interno ao atualizar lançamento.',
    });
  }
}

// Mantidos como aliases caso queiramos expor endpoints separados no futuro.
export async function createEntry(req: Request, res: Response) {
  return create(req, res, 'ENTRADA');
}

export async function createExit(req: Request, res: Response) {
  return create(req, res, 'SAIDA');
}

export async function getOne(req: Request, res: Response) {
  try {
    const { organizacaoId: organizationId } = getContexto(req);

    const id = parseBigInt(req.params.id);
    if (!id) return res.status(400).json({ erro: 'id é obrigatório.' });

    const transaction = await transactionRepository.findTransactionById(id, organizationId);
    if (!transaction) return res.status(404).json({ erro: 'Lançamento não encontrado.' });

    return res.json(serialize(transaction));
  } catch (error) {
    console.error('[get transaction]', error);
    return res.status(500).json({ erro: 'Erro interno ao buscar lançamento.' });
  }
}

function getMonthRange(month: string | undefined) {
  const selected = month ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(selected)) return null;

  const [year, monthNumber] = selected.split('-').map(Number);

  // verificação de se esses valores existem só pra o erro sumir
  if (!monthNumber) {
    throw new Error('erro no monthNumber');
  }

  if (!year) {
    throw new Error('erro no ano');
  }

  if (monthNumber < 1 || monthNumber > 12) return null;

  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  const previousStart = new Date(Date.UTC(year, monthNumber - 2, 1));
  const previousEnd = start;

  return { selected, start, end, previousStart, previousEnd };
}

function totalOf(
  groups: Awaited<ReturnType<typeof transactionRepository.getMonthlySummary>>,
  type: TransactionType,
) {
  const found = groups.find((item) => item.type === type);
  return new Prisma.Decimal(found?._sum?.amount ?? 0);
}

export async function monthlySummary(req: Request, res: Response) {
  try {
    const { organizacaoId: organizationId } = getContexto(req);

    const range = getMonthRange(typeof req.query.mes === 'string' ? req.query.mes : undefined);
    if (!range) return res.status(400).json({ erro: 'mes deve estar no formato YYYY-MM.' });

    const [currentGroups, previousGroups] = await Promise.all([
      transactionRepository.getMonthlySummary(organizationId, range.start, range.end),
      transactionRepository.getMonthlySummary(
        organizationId,
        range.previousStart,
        range.previousEnd,
      ),
    ]);

    const entries = totalOf(currentGroups, 'ENTRADA');
    const exits = totalOf(currentGroups, 'SAIDA');
    const previousEntries = totalOf(previousGroups, 'ENTRADA');
    const previousExits = totalOf(previousGroups, 'SAIDA');
    const balance = entries.minus(exits);
    const previousBalance = previousEntries.minus(previousExits);

    return res.json({
      month: range.selected,
      entries: entries.toString(),
      exits: exits.toString(),
      balance: balance.toString(),
      previousMonth: {
        month: range.previousStart.toISOString().slice(0, 7),
        entries: previousEntries.toString(),
        exits: previousExits.toString(),
        balance: previousBalance.toString(),
      },
    });
  } catch (error) {
    console.error('[monthly summary]', error);
    return res.status(500).json({ erro: 'Erro interno ao consultar resumo financeiro mensal.' });
  }
}

export async function publicTransparency(req: Request, res: Response) {
  try {
    const publicLink = String(req.params.publicLink ?? '').trim();
    if (!publicLink) return res.status(400).json({ erro: 'Link público é obrigatório.' });

    const organization = await transactionRepository.getPublicOrganizationByLink(publicLink);
    if (!organization) {
      return res
        .status(404)
        .json({ erro: 'Página de transparência não encontrada ou desativada.' });
    }

    const range = getMonthRange(typeof req.query.mes === 'string' ? req.query.mes : undefined);
    if (!range) return res.status(400).json({ erro: 'mes deve estar no formato YYYY-MM.' });

    const groups = await transactionRepository.getPublicMonthlyAggregates(
      organization.id,
      range.start,
      range.end,
    );

    const categoryIds = [...new Set(groups.map((group) => group.categoryId.toString()))].map(
      BigInt,
    );
    const categories = await transactionRepository.getCategoriesByIds(categoryIds, organization.id);
    const categoryMap = new Map(
      categories.map((category) => [category.id.toString(), category.name]),
    );

    const aggregates = groups.map((group) => ({
      type: group.type,
      category: categoryMap.get(group.categoryId.toString()) ?? 'Categoria não identificada',
      total: new Prisma.Decimal(group._sum.amount ?? 0).toString(),
      count: group._count._all,
    }));

    const entries = aggregates
      .filter((item) => item.type === 'ENTRADA')
      .reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0));
    const exits = aggregates
      .filter((item) => item.type === 'SAIDA')
      .reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0));

    return res.json({
      organization: {
        id: organization.id.toString(),
        name: organization.name,
        description: organization.description,
        managementStart: organization.managementStart,
        managementEnd: organization.managementEnd,
      },
      month: range.selected,
      totals: {
        entries: entries.toString(),
        exits: exits.toString(),
        balance: entries.minus(exits).toString(),
      },
      byCategory: aggregates,
      privacy: {
        personalFieldsHidden: true,
      },
    });
  } catch (error) {
    console.error('[public transparency]', error);
    return res.status(500).json({ erro: 'Erro interno ao consultar transparência.' });
  }
}
