import type { NextFunction, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/app-error.js';
import type { AuthRequest } from '../middlewares/auth.js';
import { civilDateSchema } from '../schemas/civil-date.js';
import { identifierSchema } from '../schemas/identifier.js';
import * as organizationService from '../services/organizationService.js';

// Os limites acompanham as colunas: nome e VARCHAR(150). A descricao e TEXT, e o teto aqui so evita
// que um texto sem fim chegue ao banco.
const organizationNameSchema = z
  .string({ error: 'Informe o nome da organização' })
  .trim()
  .min(1, 'Informe o nome da organização')
  .max(150, 'O nome deve ter no máximo 150 caracteres');

const organizationDescriptionSchema = z
  .string({ error: 'Informe a descrição da organização' })
  .trim()
  .min(1, 'Informe a descrição da organização')
  .max(5000, 'A descrição deve ter no máximo 5000 caracteres');

const createOrganizationBodySchema = z
  .object({
    nome: organizationNameSchema,
    descricao: organizationDescriptionSchema,
    inicioGestao: civilDateSchema,
    fimGestao: civilDateSchema,
  })
  .strict();

const organizationIdParamSchema = z.object({ id: identifierSchema }).strict();

const updateOrganizationBodySchema = z
  .object({
    nome: organizationNameSchema.optional(),
    descricao: organizationDescriptionSchema.optional(),
    inicioGestao: civilDateSchema.optional(),
    fimGestao: civilDateSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    error: 'Informe ao menos um campo para alterar',
    when: (payload) => payload.issues.length === 0,
  });

function getAuthenticatedUserId(request: AuthRequest): bigint {
  const userId = identifierSchema.safeParse(request.user?.id);

  if (!userId.success) {
    throw new AppError(401, 'Usuário não autenticado');
  }

  return userId.data;
}

export async function createOrganization(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createOrganizationBodySchema.parse(request.body);

    const result = await organizationService.createOrganization({
      name: body.nome,
      description: body.descricao,
      managementStart: body.inicioGestao,
      managementEnd: body.fimGestao,
      creatorUserId: getAuthenticatedUserId(request),
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateOrganization(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = organizationIdParamSchema.parse(request.params);
    const body = updateOrganizationBodySchema.parse(request.body);

    const result = await organizationService.updateOrganization(params.id, {
      name: body.nome,
      description: body.descricao,
      managementStart: body.inicioGestao,
      managementEnd: body.fimGestao,
    });

    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
