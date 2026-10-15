import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import * as passwordResetService from '../services/passwordResetService.js';

const requestResetBodySchema = z
  .object({
    email: z.string({ error: 'Informe o e-mail cadastrado' }).trim().pipe(z.email()),
  })
  .strict();

// O bcrypt so considera os primeiros 72 bytes, e uma senha maior seria aceita truncada em silencio.
const newPasswordSchema = z
  .string({ error: 'Informe a nova senha' })
  .min(8, 'A senha deve ter no mínimo 8 caracteres')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'A senha deve ter no máximo 72 bytes');

const resetPasswordBodySchema = z
  .object({
    token: z.string({ error: 'Informe o token do link' }).min(1, 'Informe o token do link'),
    novaSenha: newPasswordSchema,
  })
  .strict();

export async function requestPasswordReset(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = requestResetBodySchema.parse(request.body);
    await passwordResetService.requestPasswordReset(body.email);
    response.status(202).json({ mensagem: passwordResetService.PASSWORD_RESET_REQUESTED });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = resetPasswordBodySchema.parse(request.body);
    await passwordResetService.resetPassword(body.token, body.novaSenha);
    response.status(200).json({ mensagem: passwordResetService.PASSWORD_RESET_DONE });
  } catch (error) {
    next(error);
  }
}
