import bcrypt from 'bcrypt';

import { todayCivilDate } from '../domain/civil-date.js';
import { AppError } from '../errors/app-error.js';
import { Prisma } from '../generated/prisma/client.js';
import type { User } from '../generated/prisma/client.js';
import userRepository from '../repositories/userRepository.js';
import type { NewAccountInput } from '../schemas/new-account.js';

const EMAIL_IN_USE = 'E-mail já cadastrado';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// Cria a conta ja vinculada a organizacao de quem cadastra (US03). O motivo do vinculo e o risco
// que sobra estao em docs/DECISIONS.md, em 2026-10-18.
export async function createAccountInOrganization(
  organizationId: bigint,
  input: NewAccountInput,
): Promise<User> {
  // O indice unico do banco diferencia maiusculas, e "Maria@grupo.org" e "maria@grupo.org" sao a
  // mesma caixa de correio.
  if (await userRepository.findByEmailIgnoringCase(input.email)) {
    throw new AppError(400, EMAIL_IN_USE);
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  try {
    return await userRepository.createWithMembership({
      name: input.name,
      email: input.email,
      passwordHash,
      organizationId,
      role: input.papel,
      linkedAt: todayCivilDate(),
    });
  } catch (error) {
    // Dois cadastros simultaneos passam juntos pela consulta acima; o indice unico barra o segundo.
    if (isUniqueViolation(error)) {
      throw new AppError(400, EMAIL_IN_USE);
    }

    throw error;
  }
}
