import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { getContexto } from '../middlewares/load-context.js';
import { identifierSchema } from '../schemas/identifier.js';
import { civilDateSchema } from '../schemas/civil-date.js';
import { todayCivilDate } from '../domain/civil-date.js';
import * as goalService from '../services/goalService.js';

const listGoalsQuerySchema = z.object({}).strict();
const descriptionSchema = z.string().trim().min(1, 'Informe a descrição').max(255, 'A descrição deve ter no máximo 255 caracteres');
const amountSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Informe um valor positivo com até duas casas decimais').refine((value) => Number(value) > 0 && Number(value) < 10_000_000_000, 'O valor-alvo deve ser maior que zero e caber no limite permitido');
const deadlineSchema = civilDateSchema.refine((date) => date >= todayCivilDate(), 'O prazo deve ser hoje ou uma data futura');
const createGoalBodySchema = z.object({ descricao: descriptionSchema, valorAlvo: amountSchema, prazo: deadlineSchema }).strict();
const updateGoalBodySchema = z.object({ descricao: descriptionSchema.optional(), valorAlvo: amountSchema.optional(), prazo: deadlineSchema.optional() }).strict().refine((body) => Object.keys(body).length > 0, { error: 'Informe ao menos um campo para alterar', when: (payload) => payload.issues.length === 0 });
const goalIdParamSchema = z.object({ id: identifierSchema }).strict();

export async function listGoals(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    listGoalsQuerySchema.parse(request.query);
    const result = await goalService.listGoals(getContexto(request).organizacaoId);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createGoal(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const body = createGoalBodySchema.parse(request.body);
    const result = await goalService.createGoal(getContexto(request).organizacaoId, {
      description: body.descricao,
      targetAmount: body.valorAlvo,
      deadline: body.prazo,
    });
    response.status(201).json(result);
  } catch (error) { next(error); }
}

export async function updateGoal(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = goalIdParamSchema.parse(request.params);
    const body = updateGoalBodySchema.parse(request.body);
    const result = await goalService.updateGoal(getContexto(request).organizacaoId, id, {
      ...(body.descricao !== undefined ? { description: body.descricao } : {}),
      ...(body.valorAlvo !== undefined ? { targetAmount: body.valorAlvo } : {}),
      ...(body.prazo !== undefined ? { deadline: body.prazo } : {}),
    });
    response.status(200).json(result);
  } catch (error) { next(error); }
}
