import type { Role } from '../domain/auth-context.js';
import { formatCivilDate, todayCivilDate } from '../domain/civil-date.js';
import { AppError } from '../errors/app-error.js';
import { Prisma } from '../generated/prisma/client.js';
import * as membershipRepository from '../repositories/membershipRepository.js';
import type { MemberRecord } from '../repositories/membershipRepository.js';

const USER_NOT_FOUND = 'Usuário não encontrado';
const ALREADY_ACTIVE_MEMBER = 'Usuário já é membro ativo da organização';
const INACTIVE_USER = 'Usuário inativo não pode ser vinculado';
const MEMBER_NOT_FOUND = 'Membro ativo não encontrado na organização';

// Todo vinculo comeca como consultor. Dar o papel de tesoureiro e a alteracao de papel da US10.
const DEFAULT_ROLE: Role = 'CONSULTOR';

export interface MemberResponse {
  id: string;
  usuario: { id: string; nome: string; email: string };
  papel: string;
  dataVinculo: string;
  ativo: boolean;
}

function toResponse(member: MemberRecord): MemberResponse {
  return {
    id: member.id.toString(),
    usuario: {
      id: member.user.id.toString(),
      nome: member.user.name,
      email: member.user.email,
    },
    papel: member.role,
    dataVinculo: formatCivilDate(member.linkedAt),
    ativo: member.active,
  };
}

export interface MemberListResponse {
  dados: MemberResponse[];
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// Membro desvinculado sai da lista, mas o registro continua no banco: e ele que volta ativo quando
// a pessoa e vinculada de novo.
export async function listActiveMembers(organizationId: bigint): Promise<MemberListResponse> {
  const members = await membershipRepository.findActiveMembers(organizationId);

  return { dados: members.map(toResponse) };
}

export async function addMember(organizationId: bigint, email: string): Promise<MemberResponse> {
  const user = await membershipRepository.findUserByEmail(email);

  if (!user) {
    throw new AppError(404, USER_NOT_FOUND);
  }

  // Conta inativa nao entra em outra organizacao: com vinculo ativo em duas, nenhum tesoureiro
  // poderia reativa-la, e ela mesma nao consegue entrar para isso.
  if (!user.active) {
    throw new AppError(409, INACTIVE_USER);
  }

  const userId = user.id;
  const linkedAt = todayCivilDate();
  const existing = await membershipRepository.findMembership(userId, organizationId);

  if (existing?.active) {
    throw new AppError(409, ALREADY_ACTIVE_MEMBER);
  }

  // O banco guarda um unico vinculo por usuario e organizacao, entao quem ja saiu volta pelo mesmo
  // registro, com a data de hoje e o papel padrao, como um vinculo novo.
  if (existing) {
    const reactivated = await membershipRepository.reactivateMembership(
      existing.id,
      DEFAULT_ROLE,
      linkedAt,
    );

    if (!reactivated) {
      throw new AppError(409, ALREADY_ACTIVE_MEMBER);
    }

    return toResponse(reactivated);
  }

  try {
    const created = await membershipRepository.createMembership({
      userId,
      organizationId,
      role: DEFAULT_ROLE,
      linkedAt,
    });

    return toResponse(created);
  } catch (error) {
    // Dois pedidos simultaneos passam juntos pela consulta acima; o indice unico barra o segundo.
    if (isUniqueViolation(error)) {
      throw new AppError(409, ALREADY_ACTIVE_MEMBER);
    }

    throw error;
  }
}

/**
 * Altera o papel de um membro da organização atual.
 *
 * O membershipId é o ID do vínculo, não o ID do usuário.
 * A autorização para executar essa operação fica no middleware da rota.
 */
export async function changeMemberRole(
  organizationId: bigint,
  membershipId: bigint,
  role: Role,
): Promise<MemberResponse> {
  let updatedMember: MemberRecord | null;
  try {
    updatedMember = await membershipRepository.updateActiveMemberRole(
      membershipId,
      organizationId,
      role,
    );
  } catch (error) {
    if (error instanceof membershipRepository.LastActiveTreasurerError) {
      throw new AppError(409, error.message);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new AppError(409, 'Conflito ao alterar o papel. Tente novamente.');
    }
    throw error;
  }

  if (!updatedMember) {
    throw new AppError(404, MEMBER_NOT_FOUND);
  }

  return toResponse(updatedMember);
}
