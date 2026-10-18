import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import type { User } from '../generated/prisma/client.js';
import type { AuthRequest } from '../middlewares/auth.js';
import { getContexto } from '../middlewares/load-context.js';
import revokedTokenRepository from '../repositories/revokedTokenRepository.js';
import userRepository from '../repositories/userRepository.js';
import { newAccountSchema } from '../schemas/new-account.js';
import * as userAccountService from '../services/userAccountService.js';
import { signUserToken } from '../utils/jwtUtils.js';

function serializeUser(user: User) {
  return {
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    active: user.active,
    createdAt: user.createdAt,
  };
}

// Mesmo cadastro de POST /users, com a resposta no formato antigo desta rota.
async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = newAccountSchema.parse(req.body);
    const user = await userAccountService.createAccountInOrganization(
      getContexto(req).organizacaoId,
      input,
    );

    return res.status(201).json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
}

async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        erro: 'Preencha e-mail e senha',
      });
    }

    const user = await userRepository.findByEmail(email);

    if (!user) {
      return res.status(401).json({
        erro: 'E-mail ou senha inválidos',
      });
    }

    if (!user.active) {
      return res.status(403).json({
        erro: 'Usuário inativo',
      });
    }

    const passwordIsValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordIsValid) {
      return res.status(401).json({
        erro: 'E-mail ou senha inválidos',
      });
    }

    const token = signUserToken(user);

    return res.json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      erro: 'Erro ao fazer login',
    });
  }
}

// O token fica na lista de revogados ate a data em que expiraria de qualquer forma.
// Antes daqui o logout so respondia uma mensagem, e o token seguia valido.
async function logout(req: Request, res: Response) {
  const token = (req as AuthRequest).token;
  const usuarioId = (req as AuthRequest).user?.id;

  if (!token || !usuarioId) {
    return res.status(401).json({
      erro: 'Token de autenticação não fornecido.',
    });
  }

  try {
    const decoded = jwt.decode(token);
    const exp = typeof decoded === 'object' && decoded !== null ? decoded.exp : undefined;
    const expiresAt = exp ? new Date(exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    await revokedTokenRepository.revoke(token, BigInt(usuarioId), expiresAt);
    // Aproveita a saida para descartar revogações que ja passaram da validade.
    await revokedTokenRepository.deleteExpired();

    return res.status(204).send();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      erro: 'Erro ao encerrar a sessão',
    });
  }
}

export default {
  register,
  login,
  logout,
};
