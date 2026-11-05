import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createUserE2EContext } from './user.e2e.helpers.js';

const { app, request, pool, uniqueEmail, register, signToken, cleanup } =
  createUserE2EContext();

describe('PUT /api/users/:id - atualização e casos de borda', () => {
  const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
  const UUID_INJETADO = '11111111-1111-4111-8111-111111111111';

  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');

  const updateUser = (
    id: string,
    body: Record<string, unknown>,
    token?: string
  ) => {
    const req = request(app).put(`/api/users/${id}`).send(body);

    return token === undefined
      ? req
      : req.set('Authorization', `Bearer ${token}`);
  };

  const baseUser = (label: string) => ({
    name: 'Usuário de Atualização',
    email: uniqueEmail(label),
    password: 'Atualizacao123!',
    phone: '(37) 90000-0000',
  });

  const validationUser = baseUser('put_validacao');
  const deletedUser = baseUser('put_deleted');
  const extraEmails = new Set<string>();

  let validationUserId: string;
  let deletedUserId: string;

  beforeAll(async () => {
    const validationResponse = await register(validationUser);
    expect(validationResponse.status).toBe(201);
    validationUserId = validationResponse.body.user.id;

    const deletedResponse = await register(deletedUser);
    expect(deletedResponse.status).toBe(201);
    deletedUserId = deletedResponse.body.user.id;

    await pool.query(
      'UPDATE users SET deleted_at = NOW(), is_active = false WHERE id = $1',
      [deletedUserId]
    );

    const deletedRow = await pool.query(
      'SELECT deleted_at, is_active FROM users WHERE id = $1',
      [deletedUserId]
    );
    expect(deletedRow.rows[0].deleted_at).not.toBeNull();
    expect(deletedRow.rows[0].is_active).toBe(false);
  });

  afterAll(async () => {
    if (extraEmails.size > 0) {
      await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [
        Array.from(extraEmails),
      ]);
    }

    await cleanup();
  });

  it('deve atualizar name, phone, role e commission_rates com ADMIN', async () => {
    const created = await register(baseUser('put_update_all'));
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const res = await updateUser(
      id,
      {
        name: 'Renato Alves',
        phone: '(37) 97777-6666',
        role: 'VISUALIZADOR',
        commission_rates: 12.5,
      },
      adminToken
    );

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Usuário atualizado com sucesso!');
    expect(res.body.userInfo).toMatchObject({
      id,
      name: 'Renato Alves',
      phone: '(37) 97777-6666',
      role: 'VISUALIZADOR',
    });
    expect(Number(res.body.userInfo.commission_rates)).toBe(12.5);
    expect(res.body.userInfo).not.toHaveProperty('password_hash');

    const resultado = await pool.query(
      'SELECT name, phone, role, commission_rates FROM users WHERE id = $1',
      [id]
    );
    expect(resultado.rows).toHaveLength(1);
    expect(resultado.rows[0]).toMatchObject({
      name: 'Renato Alves',
      phone: '(37) 97777-6666',
      role: 'VISUALIZADOR',
    });
    expect(Number(resultado.rows[0].commission_rates)).toBe(12.5);
  });

  it('deve permitir que ADMIN atualize um usuário', async () => {
    const res = await updateUser(
      validationUserId,
      { name: 'Nome Atualizado pelo ADMIN' },
      adminToken
    );

    expect(res.status).toBe(200);
    expect(res.body.userInfo).toMatchObject({
      id: validationUserId,
      name: 'Nome Atualizado pelo ADMIN',
    });
  });

  it('deve retornar 401 quando não houver token', async () => {
    const res = await updateUser(validationUserId, {
      name: 'Tentativa sem token',
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
  });

  it('deve retornar 403 para usuário VENDEDOR', async () => {
    const res = await updateUser(
      validationUserId,
      { name: 'Tentativa do VENDEDOR' },
      vendedorToken
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Acesso proibido. Permissão insuficiente.',
    });
  });

  it('deve retornar 400 quando o id não for um UUID', async () => {
    const res = await updateUser(
      'id-invalido',
      { name: 'ID inválido' },
      adminToken
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      status: 'fail',
      errors: [
        {
          field: 'params.id',
          message: 'ID do usuário inválido',
        },
      ],
    });
  });

  it('deve retornar 404 quando o UUID não existir', async () => {
    const res = await updateUser(
      UUID_INEXISTENTE,
      { name: 'Usuário Inexistente' },
      adminToken
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Usuário inexistente.' });
  });

  it('deve retornar 404 quando o usuário estiver deletado', async () => {
    const res = await updateUser(
      deletedUserId,
      { name: 'Tentativa em deletado' },
      adminToken
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Usuário inexistente.' });
  });

  it('deve retornar 400 quando o body estiver vazio', async () => {
    const res = await updateUser(validationUserId, {}, adminToken);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: 'Nenhum campo informado para atualização.',
    });
  });

  it('deve retornar 400 quando o nome tiver menos de 2 caracteres', async () => {
    const res = await updateUser(
      validationUserId,
      { name: 'A' },
      adminToken
    );

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'body.name',
          message: 'O nome deve conter no mínimo 2 caracteres',
        }),
      ])
    );
  });

  it('deve retornar 400 quando o nome tiver mais de 255 caracteres', async () => {
    const res = await updateUser(
      validationUserId,
      { name: 'A'.repeat(256) },
      adminToken
    );

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].field).toBe('body.name');
    expect(res.body.errors[0].message).toMatch(/255/);
  });

  it.each([
    ['telefone curto', '1234'],
    ['sem DDD', '988887777'],
    ['com letras', '(37) 98888-ABCD'],
    ['com dígitos a mais', '379999999999'],
  ])(
    'deve retornar 400 para telefone inválido (%s)',
    async (_descricao, phone) => {
      const res = await updateUser(
        validationUserId,
        { phone },
        adminToken
      );

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('fail');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'body.phone',
            message:
              'Formato de telefone inválido. Use (XX) XXXXX-XXXX ou apenas números',
          }),
        ])
      );
    }
  );

  it('deve retornar 400 quando a role for inválida', async () => {
    const res = await updateUser(
      validationUserId,
      { role: 'GERENTE' },
      adminToken
    );

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'body.role',
          message:
            'Tipo inválido. Dever ser: \'ADMIN\', \'VENDEDOR\', \'VISUALIZADOR\', \'PUBLICO\'',
        }),
      ])
    );
  });

  it.each([
    ['menor que zero', -1, 'A comissão mínima é 0%'],
    ['maior que cem', 101, 'A comissão máxima é 100%'],
    [
      'enviada como string',
      '10',
      'A taxa de comissão deve ser um número',
    ],
  ])(
    'deve retornar 400 para commission_rates %s',
    async (_descricao, commissionRates, mensagemEsperada) => {
      const res = await updateUser(
        validationUserId,
        { commission_rates: commissionRates },
        adminToken
      );

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('fail');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'body.commission_rates',
            message: mensagemEsperada,
          }),
        ])
      );
    }
  );

  it('deve retornar 400 quando commission_rates for null', async () => {
    const res = await updateUser(
      validationUserId,
      { commission_rates: null },
      adminToken
    );

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toEqual({
      field: 'body.commission_rates',
      message: 'A taxa de comissão deve ser um número',
    });
  });

  it('não deve alterar password_hash quando enviado no body', async () => {
    const created = await register(baseUser('put_mass_password_hash'));
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const antes = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [id]
    );
    const hashOriginal = antes.rows[0].password_hash;

    const res = await updateUser(
      id,
      {
        name: 'Nome Seguro',
        password_hash: 'hash-injetado',
      },
      adminToken
    );

    expect(res.status).toBe(200);
    expect(res.body.userInfo.name).toBe('Nome Seguro');
    expect(res.body.userInfo).not.toHaveProperty('password_hash');

    const depois = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [id]
    );

    console.log('ANTES:', hashOriginal);
    console.log('DEPOIS:', depois.rows[0].password_hash);
    expect(depois.rows).toHaveLength(1);
    expect(depois.rows[0].password_hash).toBe(hashOriginal);
  });

  it('não deve alterar email quando enviado no body', async () => {
    const created = await register(baseUser('put_mass_email'));
    expect(created.status).toBe(201);
    const id = created.body.user.id;
    const emailOriginal = created.body.user.email;
    const emailInjetado = uniqueEmail('put_email_injetado');
    extraEmails.add(emailInjetado);

    const res = await updateUser(
      id,
      {
        name: 'Nome Seguro',
        email: emailInjetado,
      },
      adminToken
    );

    expect(res.status).toBe(200);
    expect(res.body.userInfo.name).toBe('Nome Seguro');
    expect(res.body.userInfo.email).toBe(emailOriginal);

    const resultado = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [id]
    );
    expect(resultado.rows).toHaveLength(1);
    expect(resultado.rows[0].email).toBe(emailOriginal);

    const injetado = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [emailInjetado]
    );
    expect(injetado.rows).toHaveLength(0);
  });

  it('não deve alterar is_active quando enviado no body', async () => {
    const created = await register(baseUser('put_mass_is_active'));
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const res = await updateUser(
      id,
      {
        name: 'Nome Seguro',
        is_active: false,
      },
      adminToken
    );

    expect(res.status).toBe(200);
    expect(res.body.userInfo.name).toBe('Nome Seguro');
    expect(res.body.userInfo.is_active).toBe(true);

    const resultado = await pool.query(
      'SELECT is_active FROM users WHERE id = $1',
      [id]
    );
    expect(resultado.rows).toHaveLength(1);
    expect(resultado.rows[0].is_active).toBe(true);
  });

  it('não deve alterar o id quando enviado no body', async () => {
    const created = await register(baseUser('put_mass_id'));
    expect(created.status).toBe(201);
    const idOriginal = created.body.user.id;

    const res = await updateUser(
      idOriginal,
      {
        name: 'Nome Seguro',
        id: UUID_INJETADO,
      },
      adminToken
    );

    expect(res.status).toBe(200);
    expect(res.body.userInfo.name).toBe('Nome Seguro');
    expect(res.body.userInfo.id).toBe(idOriginal);

    const resultado = await pool.query(
      'SELECT id, name FROM users WHERE id = $1',
      [idOriginal]
    );
    expect(resultado.rows).toHaveLength(1);
    expect(resultado.rows[0].id).toBe(idOriginal);
    expect(resultado.rows[0].name).toBe('Nome Seguro');

    const injetado = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [UUID_INJETADO]
    );
    expect(injetado.rows).toHaveLength(0);
  });

  it('não deve interpolar chaves maliciosas no SQL', async () => {
    const created = await register(baseUser('put_sql_injection'));
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const res = await updateUser(
      id,
      {
        name: 'Atualização Segura',
        'name = \'injetado\'': 'valor',
      },
      adminToken
    );

    expect(res.status).toBe(200);
    expect(res.body.userInfo.name).toBe('Atualização Segura');

    const resultado = await pool.query(
      'SELECT id, name, role FROM users WHERE id = $1',
      [id]
    );
    expect(resultado.rows).toHaveLength(1);
    expect(resultado.rows[0]).toMatchObject({
      id,
      name: 'Atualização Segura',
      role: 'VENDEDOR',
    });
  });
});
