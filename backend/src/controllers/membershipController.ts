import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { roles } from '../domain/auth-context.js';
import { identifierSchema } from '../schemas/identifier.js';
import { getContexto } from '../middlewares/load-context.js';
import * as membershipService from '../services/membershipService.js';

const listMembersQuerySchema = z.object({}).strict();

const addMemberBodySchema = z
  .object({
    email: z.string({ error: 'Informe o e-mail do usuário' }).trim().pipe(z.email()),
  })
  .strict();

const updateMemberRoleParamsSchema = z.object({ id: identifierSchema }).strict();

const updateMemberRoleBodySchema = z
  .object({
    papel: z.enum(roles),
  })
  .strict();

export async function listMembers(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    listMembersQuerySchema.parse(request.query);
    const result = await membershipService.listActiveMembers(getContexto(request).organizacaoId);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function addMember(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = addMemberBodySchema.parse(request.body);
    const result = await membershipService.addMember(
      getContexto(request).organizacaoId,
      body.email,
    );
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /membros/:id/papel
 *
 * Body: { "papel": "TESOUREIRO" | "CONSULTOR" }
 */
export async function updateMemberRole(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = updateMemberRoleParamsSchema.parse(request.params);
    const body = updateMemberRoleBodySchema.parse(request.body);

    const result = await membershipService.changeMemberRole(
      getContexto(request).organizacaoId,
      params.id,
      body.papel,
    );

    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
