import { prisma } from '../database/client.js';

export interface PasswordResetUser {
  id: bigint;
  name: string;
  email: string;
  active: boolean;
}

export interface NewPasswordResetData {
  userId: bigint;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

// O e-mail digitado na tela de recuperacao nem sempre repete as maiusculas do cadastro.
export async function findUserByEmail(email: string): Promise<PasswordResetUser | null> {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, name: true, email: true, active: true },
  });
}

// Um pedido novo descarta os links anteriores ainda nao usados: so o ultimo link enviado vale.
export async function replacePendingTokens(data: NewPasswordResetData): Promise<void> {
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: data.userId, usedAt: null },
      data: { usedAt: data.createdAt },
    }),
    prisma.passwordResetToken.create({ data }),
  ]);
}

/**
 * Consome o token e grava a senha nova na mesma transacao.
 *
 * O token so e aceito uma vez: a marcacao de uso exige usado_em vazio, entao duas requisicoes com o
 * mesmo link nao passam juntas. A troca tambem encerra as sessoes abertas. Devolve false quando o token nao existe, expirou, ja foi usado ou
 * pertence a uma conta inativa.
 */
export async function consumeTokenAndUpdatePassword(
  tokenHash: string,
  passwordHash: string,
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    const token = await transaction.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, user: { select: { active: true } } },
    });

    if (!token || !token.user.active) {
      return false;
    }

    const { count } = await transaction.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    if (count === 0) {
      return false;
    }

    // As sessoes abertas com a senha antiga caem junto com ela.
    await transaction.user.update({
      where: { id: token.userId },
      data: { passwordHash, sessionsValidFrom: now },
    });

    return true;
  });
}
