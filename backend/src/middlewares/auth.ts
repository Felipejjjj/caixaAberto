import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

import { AppError } from '../errors/app-error.js';
import revokedTokenRepository from '../repositories/revokedTokenRepository.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não definido nas variáveis de ambiente');
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser | null;
  // O token cru fica disponivel para o logout poder revoga-lo.
  token?: string | null;
}

interface TokenPayload extends JwtPayload {
  sub?: string;
  id?: string;
  email: string;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.split(' ')[1] || null;
}

interface DecodedToken {
  user: AuthUser;
  // Segundos desde a epoca, como o iat do JWT.
  issuedAt: number;
}

function decodeToken(token: string): DecodedToken {
  // gambiarrazinha essa verificação de novo do JWT_SECRET
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET não definido nas variáveis de ambiente');
  }

  const decoded = jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;

  const id = decoded.sub ?? decoded.id;

  if (!id || !decoded.email || typeof decoded.iat !== 'number') {
    throw new Error('Payload do token inválido');
  }

  return {
    user: {
      id: String(id),
      email: decoded.email,
    },
    issuedAt: decoded.iat,
  };
}

function decodeUser(token: string): AuthUser {
  return decodeToken(token).user;
}

// O iat do JWT so tem precisao de segundos. Comparar pelo segundo inteiro mantem valido o login feito
// logo depois da troca de senha, no mesmo segundo; o preco e aceitar um token emitido nesse mesmo
// segundo antes da troca.
function issuedBeforeCutoff(issuedAt: number, cutoff: Date): boolean {
  return issuedAt < Math.floor(cutoff.getTime() / 1000);
}

/**
 * Bloqueia a rota quando não existe um JWT válido.
 *
 * Popula req.user com:
 * {
 *   id: string,
 *   email: string
 * }
 */
async function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    next(new AppError(401, 'Token de autenticação não fornecido.'));
    return;
  }

  let user: AuthUser;
  let issuedAt: number;

  try {
    ({ user, issuedAt } = decodeToken(token));
  } catch {
    next(new AppError(401, 'Token inválido ou expirado.'));
    return;
  }

  try {
    // Sem esta conferencia o logout nao encerra nada: o token assinado seguiria
    // sendo aceito ate expirar, mesmo depois de o usuario sair.
    if (await revokedTokenRepository.isRevoked(token)) {
      next(new AppError(401, 'Token inválido ou expirado.'));
      return;
    }

    // A redefinicao de senha encerra as sessoes abertas com a senha antiga.
    if (/^\d+$/.test(user.id)) {
      const cutoff = await revokedTokenRepository.findSessionsValidFrom(BigInt(user.id));

      if (cutoff && issuedBeforeCutoff(issuedAt, cutoff)) {
        next(new AppError(401, 'Sessão encerrada pela troca de senha. Entre novamente.'));
        return;
      }
    }
  } catch (error) {
    next(error);
    return;
  }

  req.user = user;
  req.token = token;
  next();
}

/**
 * Não bloqueia a rota.
 *
 * Se existir um JWT válido, popula req.user.
 * Caso contrário, continua como anônimo.
 */
function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = decodeUser(token);
  } catch {
    req.user = null;
  }

  next();
}

export { authenticate, optionalAuth };
