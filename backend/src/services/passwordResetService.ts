import { createHash, randomBytes } from 'node:crypto';

import bcrypt from 'bcrypt';

import { readEnvironment } from '../config/environment.js';
import { AppError } from '../errors/app-error.js';
import { passwordResetNotifier } from '../notifications/passwordResetNotifier.js';
import * as passwordResetRepository from '../repositories/passwordResetRepository.js';

export const PASSWORD_RESET_REQUESTED =
  'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.';
export const PASSWORD_RESET_DONE = 'Senha redefinida. Entre com a nova senha.';
export const INVALID_RESET_LINK = 'Link de redefinição inválido ou expirado. Solicite um novo.';

const TOKEN_VALIDITY_MS = 60 * 60 * 1000;

// O mesmo custo usado no cadastro e na alteracao de usuario.
const BCRYPT_ROUNDS = 10;

// O banco guarda so o hash: quem ler a tabela nao consegue montar um link valido.
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildResetLink(token: string): string {
  const frontendUrl = readEnvironment().CORS_ORIGIN.replace(/\/+$/, '');

  return `${frontendUrl}/redefinir-senha?token=${token}`;
}

/**
 * Gera um link de redefinicao para o e-mail informado.
 *
 * E-mail desconhecido e conta inativa recebem a mesma resposta de quem existe, sem gerar token, para
 * a tela nao revelar quais e-mails tem conta. Falha no envio tambem nao muda a resposta: ela fica no
 * log e a pessoa pode pedir de novo.
 */
export async function requestPasswordReset(email: string, now: Date = new Date()): Promise<void> {
  const user = await passwordResetRepository.findUserByEmail(email);

  if (!user || !user.active) {
    return;
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + TOKEN_VALIDITY_MS);

  await passwordResetRepository.replacePendingTokens({
    userId: user.id,
    tokenHash: hashResetToken(token),
    expiresAt,
    createdAt: now,
  });

  try {
    await passwordResetNotifier.send({
      name: user.name,
      email: user.email,
      link: buildResetLink(token),
      expiresAt,
    });
  } catch (error) {
    console.error('Falha ao enviar o link de redefinição de senha', error);
  }
}

export async function resetPassword(
  token: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const updated = await passwordResetRepository.consumeTokenAndUpdatePassword(
    hashResetToken(token),
    passwordHash,
    now,
  );

  if (!updated) {
    throw new AppError(400, INVALID_RESET_LINK);
  }
}
