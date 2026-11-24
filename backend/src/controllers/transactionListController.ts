import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { transactionTypes } from '../domain/transaction.js';
import { getContexto } from '../middlewares/load-context.js';
import { civilDateSchema } from '../schemas/civil-date.js';
import { identifierSchema } from '../schemas/identifier.js';
import { periodQuerySchema } from '../schemas/period.js';
import * as transactionListService from '../services/transactionListService.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const positiveIntegerSchema = z
  .string()
  .regex(/^\d+$/, 'Informe um número inteiro')
  .transform(Number);

const listTransactionsQuerySchema = z
  .object({
    dataInicio: civilDateSchema.optional(),
    dataFim: civilDateSchema.optional(),
    tipo: z.enum(transactionTypes).optional(),
    categoriaId: identifierSchema.optional(),
    usuarioId: identifierSchema.optional(),
    pagina: positiveIntegerSchema.pipe(z.int().min(1)).default(DEFAULT_PAGE),
    tamanhoPagina: positiveIntegerSchema
      .pipe(z.int().min(1).max(MAX_PAGE_SIZE))
      .default(DEFAULT_PAGE_SIZE),
  })
  .strict()
  .refine((query) => !query.dataInicio || !query.dataFim || query.dataFim >= query.dataInicio, {
    path: ['dataFim'],
    error: 'dataFim não pode ser anterior a dataInicio',
  });

export async function listTransactions(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listTransactionsQuerySchema.parse(request.query);
    const result = await transactionListService.listTransactions(
      getContexto(request).organizacaoId,
      {
        startDate: query.dataInicio,
        endDate: query.dataFim,
        type: query.tipo,
        categoryId: query.categoriaId,
        userId: query.usuarioId,
        page: query.pagina,
        pageSize: query.tamanhoPagina,
      },
    );
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

const exportTransactionsQuerySchema = periodQuerySchema.extend({
  tipo: z.enum(transactionTypes).optional(),
  categoriaId: identifierSchema.optional(),
  usuarioId: identifierSchema.optional(),
}).strict();

export async function exportTransactions(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const query = exportTransactionsQuerySchema.parse(request.query);
    const csv = await transactionListService.exportTransactionsCsv(getContexto(request).organizacaoId, {
      startDate: query.dataInicio, endDate: query.dataFim, type: query.tipo,
      categoryId: query.categoriaId, userId: query.usuarioId,
    });
    response.status(200)
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', 'attachment; filename="lancamentos.csv"')
      .send(csv);
  } catch (error) { next(error); }
}
