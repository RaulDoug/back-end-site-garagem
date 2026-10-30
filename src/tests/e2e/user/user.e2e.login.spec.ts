import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  createUserE2EContext,
  JWT_SECRET,
} from './user.e2e.helpers.js';

const { pool, uniqueEmail, register, login, cleanup } = createUserE2EContext();

describe('POST /api/user/login - autenticação e casos de borda', () => {
  const INVALID_CREDENTIALS_MESSAGE = 'Credenciais inválidas';
  const loginUser = {
    name: 'Paula Mendes',
    email: uniqueEmail('login'),
    password: 'LoginSeguro123!',
    phone: '(37) 97777-6666',
  };

  let loginUserId: string;

  beforeAll(async () => {
    const cadastro = await register(loginUser);

    expect(cadastro.status).toBe(201);
    expect(cadastro.body.user.email).toBe(loginUser.email);

    loginUserId = cadastro.body.user.id;
  });

  afterAll(cleanup);

  it('deve autenticar com credenciais válidas e não expor password_hash', async () => {
    const res = await login({
      email: loginUser.email,
      password: loginUser.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Login realizado com sucesso!');
    expect(res.body.userInfo.user).toMatchObject({
      id: loginUserId,
      name: loginUser.name,
      email: loginUser.email,
      phone: loginUser.phone,
      role: 'VENDEDOR',
    });
    expect(res.body.userInfo.token).toEqual(expect.any(String));
    expect(res.body.userInfo.token.length).toBeGreaterThan(0);
    expect(res.body.userInfo.user).not.toHaveProperty('password_hash');
    expect(res.body.userInfo.user).not.toHaveProperty('password');
  });

  it('deve gerar token JWT com id, email e role do usuário', async () => {
    const res = await login({
      email: loginUser.email,
      password: loginUser.password,
    });

    expect(res.status).toBe(200);

    const decoded = jwt.verify(res.body.userInfo.token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
    };

    expect(decoded).toMatchObject({
      id: loginUserId,
      email: loginUser.email,
      role: 'VENDEDOR',
    });
    expect(decoded).not.toHaveProperty('password_hash');
  });

  it('deve retornar 401 quando a senha estiver incorreta', async () => {
    const res = await login({
      email: loginUser.email,
      password: 'SenhaIncorreta123!',
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: INVALID_CREDENTIALS_MESSAGE });
    expect(res.body).not.toHaveProperty('userInfo');
  });

  it('deve retornar 401 com a mesma mensagem quando o e-mail não existir', async () => {
    const res = await login({
      email: uniqueEmail('login_inexistente'),
      password: loginUser.password,
    });

    // Mesma mensagem do cenário de senha incorreta para não revelar se o
    // e-mail existe na base.
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: INVALID_CREDENTIALS_MESSAGE });
    expect(res.body).not.toHaveProperty('userInfo');
  });

  it('deve retornar 400 quando o e-mail tiver formato inválido', async () => {
    const res = await login({
      email: 'paula.mendes-sem-arroba',
      password: loginUser.password,
    });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'body.email',
          message: 'Formato de e-mail inválido',
        }),
      ])
    );
  });

  it('deve retornar 400 quando a senha estiver vazia', async () => {
    const res = await login({
      email: loginUser.email,
      password: '',
    });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'body.password',
          message: 'A senha é obrigatória',
        }),
      ])
    );
  });

  it('deve retornar 400 com os dois campos quando o corpo estiver vazio', async () => {
    const res = await login({});

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'body.email' }),
        expect.objectContaining({ field: 'body.password' }),
      ])
    );
  });

  it('não deve autenticar usuário com soft delete', async () => {
    const usuarioRemovido = {
      name: 'Usuário Removido',
      email: uniqueEmail('login_soft_deleted'),
      password: 'Removido123!',
      phone: '(37) 96666-5555',
    };

    const cadastro = await register(usuarioRemovido);
    expect(cadastro.status).toBe(201);

    await pool.query(
      'UPDATE users SET deleted_at = NOW(), is_active = false WHERE id = $1',
      [cadastro.body.user.id]
    );

    const usuarioNoBanco = await pool.query(
      'SELECT deleted_at, is_active FROM users WHERE id = $1',
      [cadastro.body.user.id]
    );
    expect(usuarioNoBanco.rows[0].deleted_at).not.toBeNull();
    expect(usuarioNoBanco.rows[0].is_active).toBe(false);

    const res = await login({
      email: usuarioRemovido.email,
      password: usuarioRemovido.password,
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: INVALID_CREDENTIALS_MESSAGE });
    expect(res.body).not.toHaveProperty('userInfo');
  });

  it('deve retornar 429 na sexta tentativa de login do mesmo IP', async () => {
    const ipFixo = '203.0.113.88';
    const payload = {
      email: uniqueEmail('login_rate_limit'),
      password: 'LoginSeguro123!',
    };
    const respostas = [];

    for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
      const res = await login(payload, ipFixo);
      respostas.push(res);
    }

    respostas.slice(0, 5).forEach((res) => {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: INVALID_CREDENTIALS_MESSAGE });
    });

    expect(respostas[5].status).toBe(429);
    expect(respostas[5].body).toEqual({
      message:
        'Muitas tentativas de login neste IP, tente novamente após 15 minutos.',
    });
  });
});
