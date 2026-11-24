import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';

import type { User } from '../generated/prisma/client.js';
import { formatCivilDate } from '../domain/civil-date.js';
import type { AuthRequest } from '../middlewares/auth.js';
import { identifierSchema } from '../schemas/identifier.js';
import { getContexto } from '../middlewares/load-context.js';
import * as membershipRepository from '../repositories/membershipRepository.js';
import userRepository from '../repositories/userRepository.js';
import { newAccountSchema } from '../schemas/new-account.js';
import * as userAccountService from '../services/userAccountService.js';

function serializeUser(user: User) {
  return {
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    active: user.active,
    createdAt: user.createdAt,
  };
}

const listUsersQuerySchema = z
  .object({
    busca: z.string().trim().max(150, 'A busca deve ter no máximo 150 caracteres').optional(),
  })
  .strict();

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    email: z.string().trim().max(150).pipe(z.email()).optional(),
    password: z.string().min(8).max(72).optional(),
    active: z.boolean().optional(),
  })
  .strict();

async function getUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listUsersQuerySchema.parse(req.query);
    const { organizacaoId } = getContexto(req);
    const users = await userRepository.findAllByOrganization(organizacaoId, query.busca);

    return res.json(users.map(serializeUser));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(error);
    }

    console.error(error);

    return res.status(500).json({
      erro: 'Erro ao buscar usuários',
    });
  }
}

async function getUserById(req: Request, res: Response) {
  try {
    const { id: idParam } = req.params;

    if (!idParam || Array.isArray(idParam)) {
      return res.status(400).json({
        erro: 'ID de usuário inválido',
      });
    }

    const id = BigInt(idParam);

    //const id = BigInt(req.params.id)

    const user = await userRepository.findByIdInOrganization(id, getContexto(req).organizacaoId);

    if (!user) {
      return res.status(404).json({
        erro: 'Usuário não encontrado',
      });
    }

    return res.json(serializeUser(user));
  } catch (error) {
    console.error(error);

    return res.status(400).json({
      erro: 'ID de usuário inválido',
    });
  }
}

// Um `active` no corpo e ignorado: a conta sempre nasce ativa (CA-F03-03).
async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const input = newAccountSchema.parse(req.body);
    const user = await userAccountService.createAccountInOrganization(
      getContexto(req).organizacaoId,
      input,
    );

    return res.status(201).json(serializeUser(user));
  } catch (error) {
    next(error);
  }
}

async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = z.object({ id: identifierSchema }).strict().parse(req.params);
    const { name, email, password, active } = updateUserSchema.parse(req.body);
    const { usuarioId, organizacaoId } = getContexto(req);

    const existingUser = await userRepository.findByIdInOrganization(id, organizacaoId);

    if (!existingUser) {
      return res.status(404).json({
        erro: 'Usuário não encontrado',
      });
    }

    // A conta e global, mas o tesoureiro so responde pela propria organizacao. Sem estas
    // conferencias, vincular alguem pelo e-mail bastava para trocar a senha dessa pessoa e entrar
    // como ela nas outras organizacoes em que atua.
    const isOwnAccount = id === usuarioId;
    if (password !== undefined && !isOwnAccount)
      return res.status(403).json({ erro: 'A senha só pode ser alterada pelo próprio usuário' });
    if (isOwnAccount && active === false)
      return res.status(403).json({ erro: 'O usuário não pode inativar a própria conta' });
    const changesAccount = name !== undefined || email !== undefined || active !== undefined;
    if (
      !isOwnAccount &&
      changesAccount &&
      (await membershipRepository.hasActiveMembershipOutside(id, organizacaoId))
    ) {
      return res.status(403).json({
        erro: 'Os dados da conta de quem participa de outra organização só podem ser alterados pelo próprio usuário',
      });
    }

    if (email && email.toLowerCase() !== existingUser.email.toLowerCase()) {
      const emailInUse = await userRepository.findByEmailIgnoringCase(email);

      if (emailInUse) {
        return res.status(400).json({
          erro: 'E-mail já cadastrado',
        });
      }
    }

    const updatedUser = await userRepository.update(id, {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(password !== undefined ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      ...(active !== undefined ? { active } : {}),
    });

    return res.json(serializeUser(updatedUser));
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req: Request, res: Response) {
  try {
    const { id } = z.object({ id: identifierSchema }).strict().parse(req.params);

    //const id = BigInt(req.params.id)

    const existingUser = await userRepository.findByIdInOrganization(
      id,
      getContexto(req).organizacaoId,
    );

    if (!existingUser) {
      return res.status(404).json({
        erro: 'Usuário não encontrado',
      });
    }

    const deactivated = await userRepository.deactivateInOrganization(
      id,
      getContexto(req).organizacaoId,
    );
    if (!deactivated) return res.status(404).json({ erro: 'Usuário não encontrado ou já inativo' });
    return res.status(200).json({ id: id.toString(), active: false });
  } catch (error) {
    console.error(error);

    return res.status(400).json({
      erro: 'Não foi possível excluir o usuário',
    });
  }
}

// O usuario autenticado e identificado pelo token.
// Nao depende de X-Organizacao-Id nem de getContexto().
async function getMyOrganizations(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        erro: 'Usuário não autenticado',
      });
    }

    const parsedId = identifierSchema.safeParse(req.user.id);
    if (!parsedId.success) {
      return res.status(401).json({
        erro: 'Identificador do usuário autenticado inválido',
      });
    }

    const usuarioId = parsedId.data;
    const memberships = await userRepository.findOrganizationsByUser(usuarioId);

    const dados = memberships.map((membership) => ({
      vinculoId: membership.id.toString(),
      papel: membership.role,
      dataVinculo: formatCivilDate(membership.linkedAt),
      organizacao: {
        id: membership.organization.id.toString(),
        nome: membership.organization.name,
        descricao: membership.organization.description,
        inicioGestao: formatCivilDate(membership.organization.managementStart),
        fimGestao: formatCivilDate(membership.organization.managementEnd),
        linkPublico: membership.organization.publicLink,
        transparenciaAtiva: membership.organization.transparencyActive,
      },
    }));

    return res.status(200).json({ dados });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      erro: 'Erro ao buscar organizações do usuário',
    });
  }
}

export default {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getMyOrganizations,
};
