import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  InvalidTokenError,
  generateToken,
  getSecretKey,
  validateToken,
} from '#utils/jwt.util.js';

describe('jwt.util', () => {
  const ORIGINAL_ENV = process.env;
  const TEST_SECRET = 'test-secret-key-for-jwt-util';

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV, JWT_SECRET: TEST_SECRET };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('getSecretKey', () => {
    it('deve lançar Error padrão (e não InvalidTokenError) quando JWT_SECRET estiver ausente', () => {
      delete process.env.JWT_SECRET;

      expect(() => getSecretKey()).toThrow('Variável de ambiente JWT_SECRET não configurada.');
      try {
        getSecretKey();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(InvalidTokenError);
      }
    });

    it('deve lançar Error padrão quando JWT_SECRET estiver vazio ou apenas espaços', () => {
      process.env.JWT_SECRET = '   ';

      expect(() => getSecretKey()).toThrow('Variável de ambiente JWT_SECRET não configurada.');
    });

    it('deve retornar o segredo configurado quando JWT_SECRET existir', () => {
      expect(getSecretKey()).toBe(TEST_SECRET);
    });
  });

  describe('generateToken e validateToken', () => {
    const validPayload = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'usuario@garagem.com',
      role: 'ADMIN',
      tenantId: '22222222-2222-4222-8222-222222222222',
      storeId: '33333333-3333-4333-8333-333333333333',
    };

    it('deve assinar com algorithm HS256 e expiresIn 1d e retornar payload completo no validateToken', () => {
      const signSpy = vi.spyOn(jwt, 'sign');
      const token = generateToken(validPayload);

      expect(signSpy).toHaveBeenCalledWith(
        {
          id: validPayload.id,
          email: validPayload.email,
          role: validPayload.role,
          tenantId: validPayload.tenantId,
          storeId: validPayload.storeId,
        },
        TEST_SECRET,
        { algorithm: 'HS256', expiresIn: '1d' }
      );

      const decodedComplete = jwt.decode(token, { complete: true });
      expect(decodedComplete?.header.alg).toBe('HS256');

      const decodedPayload = decodedComplete?.payload as jwt.JwtPayload;
      expect(decodedPayload.exp! - decodedPayload.iat!).toBe(86400);

      const validated = validateToken(token);
      expect(validated).toEqual(validPayload);
    });

    it('deve normalizar storeId omitido para null', () => {
      const token = generateToken({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'usuario@garagem.com',
        role: 'ADMIN',
        tenantId: '22222222-2222-4222-8222-222222222222',
      });

      expect(validateToken(token)).toEqual({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'usuario@garagem.com',
        role: 'ADMIN',
        tenantId: '22222222-2222-4222-8222-222222222222',
        storeId: null,
      });
    });

    it('deve lançar Error de configuração (e não InvalidTokenError) quando JWT_SECRET estiver ausente em validateToken', () => {
      const token = generateToken(validPayload);
      delete process.env.JWT_SECRET;

      try {
        validateToken(token);
        expect.unreachable('Deveria ter lançado erro de JWT_SECRET ausente');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(InvalidTokenError);
        expect((err as Error).message).toBe('Variável de ambiente JWT_SECRET não configurada.');
      }
    });

    it('deve lançar InvalidTokenError quando o token estiver expirado', () => {
      const expiredToken = jwt.sign(validPayload, TEST_SECRET, {
        algorithm: 'HS256',
        expiresIn: -10,
      });

      expect(() => validateToken(expiredToken)).toThrow(InvalidTokenError);
    });

    it('deve lançar InvalidTokenError quando a assinatura for inválida', () => {
      const tokenWrongSecret = jwt.sign(validPayload, 'wrong-secret', {
        algorithm: 'HS256',
        expiresIn: '1d',
      });

      expect(() => validateToken(tokenWrongSecret)).toThrow(InvalidTokenError);
    });

    it('deve lançar InvalidTokenError quando o token for assinado com algoritmo diferente de HS256 (ex: HS384)', () => {
      const tokenHs384 = jwt.sign(validPayload, TEST_SECRET, {
        algorithm: 'HS384',
        expiresIn: '1d',
      });

      expect(() => validateToken(tokenHs384)).toThrow(InvalidTokenError);
    });

    it.each([
      {
        desc: 'id ausente',
        payload: { email: 'a@b.com', role: 'ADMIN', tenantId: '22222222-2222-4222-8222-222222222222' },
      },
      {
        desc: 'id vazio',
        payload: { id: '  ', email: 'a@b.com', role: 'ADMIN', tenantId: '22222222-2222-4222-8222-222222222222' },
      },
      {
        desc: 'id não-UUID',
        payload: { id: 'user-nao-uuid', email: 'a@b.com', role: 'ADMIN', tenantId: '22222222-2222-4222-8222-222222222222' },
      },
      {
        desc: 'email ausente',
        payload: { id: '11111111-1111-4111-8111-111111111111', role: 'ADMIN', tenantId: '22222222-2222-4222-8222-222222222222' },
      },
      {
        desc: 'email vazio',
        payload: { id: '11111111-1111-4111-8111-111111111111', email: '', role: 'ADMIN', tenantId: '22222222-2222-4222-8222-222222222222' },
      },
      {
        desc: 'role ausente',
        payload: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', tenantId: '22222222-2222-4222-8222-222222222222' },
      },
      {
        desc: 'role vazio',
        payload: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: '', tenantId: '22222222-2222-4222-8222-222222222222' },
      },
      {
        desc: 'tenantId ausente',
        payload: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: 'ADMIN' },
      },
      {
        desc: 'tenantId vazio',
        payload: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: 'ADMIN', tenantId: ' ' },
      },
      {
        desc: 'tenantId não-UUID',
        payload: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: 'ADMIN', tenantId: 'tenant-nao-uuid' },
      },
      {
        desc: 'storeId com tipo inválido (número)',
        payload: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: 'ADMIN', tenantId: '22222222-2222-4222-8222-222222222222', storeId: 123 },
      },
      {
        desc: 'storeId string vazia',
        payload: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: 'ADMIN', tenantId: '22222222-2222-4222-8222-222222222222', storeId: '' },
      },
      {
        desc: 'storeId não-UUID',
        payload: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', role: 'ADMIN', tenantId: '22222222-2222-4222-8222-222222222222', storeId: 'store-nao-uuid' },
      },
    ])('deve lançar InvalidTokenError quando o payload for inválido: $desc', ({ payload }) => {
      const token = jwt.sign(payload, TEST_SECRET, {
        algorithm: 'HS256',
        expiresIn: '1d',
      });

      expect(() => validateToken(token)).toThrow(InvalidTokenError);
    });
  });
});
