import { timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { InvalidTokenError, type TokenPayload, validateToken } from '#utils/jwt.util.js';
import { type User, userRepository } from '#repositories/user.repository.js';

export interface AuthUserFinder {
  findAuthUserById(id: string): Promise<User | null>;
}

export const createAuthMiddleware = (userRepo: AuthUserFinder = userRepository) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization?.trim();
    const match = authHeader ? /^Bearer\s+(\S+)$/i.exec(authHeader) : null;
    const token = match?.[1];

    if (!token) {
      return res.status(401).json({ message: 'Acesso negado. Token não fornecido ou inválido' });
    }

    let payload: TokenPayload;
    try {
      payload = validateToken(token);
    } catch (error) {
      if (error instanceof InvalidTokenError || error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ message: 'Token inválido ou expirado.' });
      }
      return next(error);
    }

    try {
      const user = await userRepo.findAuthUserById(payload.id);

      if (!user || user.deleted_at !== null || !user.is_active || !user.tenant_id) {
        return res.status(401).json({ message: 'Acesso negado. Token não fornecido ou inválido' });
      }

      req.user = {
        id: user.id,
        email: user.email ?? payload.email,
        role: user.role ?? payload.role,
        tenantId: user.tenant_id,
        storeId: user.store_id ?? null,
      };

      next();
    } catch (error) {
      return next(error);
    }
  };
};

export const authenticateJWT = createAuthMiddleware();

export const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { message: 'Muitas tentativas de login neste IP, tente novamente após 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});


export const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 5, // máx 5 cadastros por IP por hora
  message: { message: 'Muitas contas criadas a partir deste IP. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const getOnboardingSecret = (): string => {
  const secret = process.env.ONBOARDING_SECRET?.trim();
  if (!secret) {
    throw new Error('Variável de ambiente ONBOARDING_SECRET não configurada.');
  }
  return secret;
};

export const authenticateOnboardingSecret = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let expectedSecret: string;
  try {
    expectedSecret = getOnboardingSecret();
  } catch (error) {
    return next(error);
  }

  const rawHeader = req.headers['x-onboarding-secret'];
  if (typeof rawHeader !== 'string' || rawHeader.trim() === '') {
    return res.status(401).json({
      message: 'Acesso negado. Chave de provisionamento inválida ou ausente.',
    });
  }

  const providedBuf = Buffer.from(rawHeader.trim(), 'utf8');
  const expectedBuf = Buffer.from(expectedSecret, 'utf8');

  if (
    providedBuf.byteLength !== expectedBuf.byteLength ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return res.status(401).json({
      message: 'Acesso negado. Chave de provisionamento inválida ou ausente.',
    });
  }

  return next();
};