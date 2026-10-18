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

/**
 * Cria a conta ja vinculada a organizacao de quem cadastra (US03).
 *
 * Uma conta sem vinculo nenhum ficava solta: quem a criou sabia a senha, e se outra organizacao
 * vinculasse aquele e-mail depois, essa pessoa entrava e via os dados dela. Com o vinculo, a conta
 * nasce sob a responsabilidade de uma organizacao. O risco que sobra esta em docs/DECISIONS.md.
 */
export async function createAccountInOrganization(
  organizationId: bigint,
  input: NewAccountInput,
): Promise<User> {
  // "Maria@grupo.org" e "maria@grupo.org" sao a mesma caixa de correio; o indice unico do banco
  // diferencia as duas, entao a comparacao ignora maiusculas aqui.
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
