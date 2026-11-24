import { prisma } from '../database/client.js';
import type { Role } from '../domain/auth-context.js';

async function findAll() {
  return prisma.user.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });
}

// O contains do Prisma não escapa % e _, então eles são escapados aqui para valerem como texto.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// Usuários com vínculo ativo na organização. `search` é um trecho do nome ou do e-mail.
async function findAllByOrganization(organizationId: bigint, search?: string) {
  const pattern = search ? escapeLikePattern(search) : undefined;

  return prisma.user.findMany({
    where: {
      memberships: {
        some: {
          organizationId,
          active: true,
        },
      },
      ...(pattern
        ? {
            OR: [
              { name: { contains: pattern, mode: 'insensitive' } },
              { email: { contains: pattern, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function findByIdInOrganization(id: bigint, organizationId: bigint) {
  return prisma.user.findFirst({
    where: {
      id,
      memberships: {
        some: {
          organizationId,
          active: true,
        },
      },
    },
  });
}

async function findById(id: bigint) {
  return prisma.user.findUnique({
    where: {
      id,
    },
  });
}

async function findByEmail(email: string) {
  return prisma.user.findUnique({
    where: {
      email,
    },
  });
}

// Quem digita o e-mail com outra caixa ("Maria@grupo.org") ainda e a mesma pessoa. A busca exata
// vem antes porque contas antigas, de antes da regra de 2026-10-18, podem diferir so na caixa.
async function findByEmailPreferringExact(email: string) {
  const exact = await findByEmail(email);
  if (exact) return exact;

  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    orderBy: { id: 'asc' },
  });
}

async function findByEmailIgnoringCase(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
}

// Conta e vinculo numa so escrita: se o vinculo falhar, a conta nao fica criada sem organizacao.
async function createWithMembership(data: {
  name: string;
  email: string;
  passwordHash: string;
  organizationId: bigint;
  role: Role;
  linkedAt: Date;
}) {
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      active: true,
      createdAt: new Date(),
      memberships: {
        create: {
          organizationId: data.organizationId,
          role: data.role,
          linkedAt: data.linkedAt,
          active: true,
        },
      },
    },
  });
}

async function create(data: {
  name: string;
  email: string;
  passwordHash: string;
  active?: boolean;
  createdAt?: Date;
}) {
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      active: data.active ?? true,
      createdAt: data.createdAt ?? new Date(),
    },
  });
}

async function update(
  id: bigint,
  data: {
    name?: string;
    email?: string;
    passwordHash?: string;
    active?: boolean;
  },
) {
  return prisma.user.update({
    where: {
      id,
    },
    data,
  });
}

async function deleteById(id: bigint) {
  return prisma.user.delete({
    where: {
      id,
    },
  });
}

async function deactivateInOrganization(id: bigint, organizationId: bigint) {
  const result = await prisma.user.updateMany({
    where: { id, active: true, memberships: { some: { organizationId, active: true } } },
    data: { active: false },
  });
  return result.count === 1;
}

// Retorna somente organizacoes em que o usuario possui vinculo ativo.
// A senha e outros dados privados do usuario nao sao selecionados.
async function findOrganizationsByUser(userId: bigint) {
  return prisma.membership.findMany({
    where: {
      userId,
      active: true,
    },
    select: {
      id: true,
      role: true,
      linkedAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          description: true,
          managementStart: true,
          managementEnd: true,
          publicLink: true,
          transparencyActive: true,
        },
      },
    },
    orderBy: {
      organization: {
        name: 'asc',
      },
    },
  });
}

export default {
  findAll,
  findAllByOrganization,
  findByIdInOrganization,
  findById,
  findByEmail,
  findByEmailPreferringExact,
  findByEmailIgnoringCase,
  create,
  createWithMembership,
  update,
  deleteById,
  deactivateInOrganization,
  findOrganizationsByUser,
};
