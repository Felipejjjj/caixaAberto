import { Request, Response } from 'express';
import bcrypt from 'bcrypt';

import type { User } from '../generated/prisma/client.js';
import { formatCivilDate } from '../domain/civil-date.js';
import type { AuthRequest } from '../middlewares/auth.js';
import { identifierSchema } from '../schemas/identifier.js';
import { getContexto } from '../middlewares/load-context.js';
import * as membershipRepository from '../repositories/membershipRepository.js';
import userRepository from '../repositories/userRepository.js';

function serializeUser(user: User) {
  return {
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    active: user.active,
    createdAt: user.createdAt,
  };
}

async function getUsers(req: Request, res: Response) {
  try {
    const { organizacaoId } = getContexto(req);
    const users = await userRepository.findAllByOrganization(organizacaoId);

    return res.json(users.map(serializeUser));
  } catch (error) {
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

async function createUser(req: Request, res: Response) {
  try {
    const { name, email, password, active } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        erro: 'Nome, e-mail e senha são obrigatórios',
      });
    }

    const existingUser = await userRepository.findByEmail(email);

    if (existingUser) {
      return res.status(400).json({
        erro: 'E-mail já cadastrado',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await userRepository.create({
      name,
      email,
      passwordHash,
      active,
    });

    return res.status(201).json(serializeUser(user));
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      erro: 'Erro ao criar usuário',
    });
  }
}

async function updateUser(req: Request, res: Response) {
  try {
    const { id: idParam } = req.params;

    if (!idParam || Array.isArray(idParam)) {
      return res.status(400).json({
        erro: 'ID de usuário inválido',
      });
    }

    const id = BigInt(idParam);

    //const id = BigInt(req.params.id)

    const { name, email, password, active } = req.body;
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
    const changesAccount = name !== undefined || email !== undefined || active !== undefined;

    if (password !== undefined && !isOwnAccount) {
      return res.status(403).json({
        erro: 'A senha só pode ser alterada pelo próprio usuário',
      });
    }

    // Quem inativa a propria conta nao consegue mais entrar para desfazer, e se atuar em duas
    // organizacoes nenhum tesoureiro pode reativa-la.
    if (isOwnAccount && active === false) {
      return res.status(403).json({
        erro: 'O usuário não pode inativar a própria conta',
      });
    }

    // So consulta os outros vinculos quando ha dado da conta a mudar, para que um PUT vazio nao
    // revele se o membro participa de outra organizacao.
    if (
      !isOwnAccount &&
      changesAccount &&
      (await membershipRepository.hasActiveMembershipOutside(id, organizacaoId))
    ) {
      return res.status(403).json({
        erro: 'Os dados da conta de quem participa de outra organização só podem ser alterados pelo próprio usuário',
      });
    }

    if (email && email !== existingUser.email) {
      const emailInUse = await userRepository.findByEmail(email);

      if (emailInUse) {
        return res.status(400).json({
          erro: 'E-mail já cadastrado',
        });
      }
    }

    const data: {
      name?: string;
      email?: string;
      passwordHash?: string;
      active?: boolean;
    } = {};

    if (name !== undefined) {
      data.name = name;
    }

    if (email !== undefined) {
      data.email = email;
    }

    if (password !== undefined) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    if (active !== undefined) {
      data.active = active;
    }

    const updatedUser = await userRepository.update(id, data);

    return res.json(serializeUser(updatedUser));
  } catch (error) {
    console.error(error);

    return res.status(400).json({
      erro: 'Erro ao atualizar usuário',
    });
  }
}

async function deleteUser(req: Request, res: Response) {
  try {
    const { id: idParam } = req.params;

    if (!idParam || Array.isArray(idParam)) {
      return res.status(400).json({
        erro: 'ID de usuário inválido',
      });
    }

    const id = BigInt(idParam);

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

    await userRepository.deleteById(id);

    return res.status(204).send();
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
