import { describe, it, expect, afterAll } from 'vitest';
import { createUserE2EContext } from './user.e2e.helpers.js';

const {
  UUID_REGEX,
  pool,
  uniqueEmail,
  register,
  validRegisterPayload,
  signToken,
  cleanup,
} = createUserE2EContext();

describe('POST /api/user/register - validações e casos de borda', () => {
  afterAll(cleanup);

  describe('duplicidade de e-mail', () => {
    it('deve retornar 409 quando o e-mail já estiver cadastrado', async () => {
      const payload = validRegisterPayload({ email: uniqueEmail('duplicado') });

      const primeiraTentativa = await register(payload);
      expect(primeiraTentativa.status).toBe(201);

      const segundaTentativa = await register({
        ...payload,
        name: 'Outro Usuário',
      });

      expect(segundaTentativa.status).toBe(409);
      expect(segundaTentativa.body).toEqual({
        message: 'E-mail já cadastrado',
      });

      const resultado = await pool.query(
        'SELECT COUNT(*)::int AS total FROM users WHERE email = $1',
        [payload.email]
      );
      expect(resultado.rows[0].total).toBe(1);
    });

    it('não deve permitir e-mail duplicado com caixa diferente (bug 4.3)', async () => {
      const emailMinusculo = uniqueEmail('case');
      const emailMaiusculo = emailMinusculo.toUpperCase();

      const primeiraTentativa = await register({
        ...validRegisterPayload(),
        email: emailMinusculo,
      });
      expect(primeiraTentativa.status).toBe(201);

      const segundaTentativa = await register({
        ...validRegisterPayload(),
        email: emailMaiusculo,
      });

      // Comportamento esperado: e-mails devem ser únicos sem diferenciar
      // maiúsculas de minúsculas. O register deve retornar 409 e não criar
      // um segundo usuário.
      expect(segundaTentativa.status).toBe(409);
      expect(segundaTentativa.body).toEqual({
        message: 'E-mail já cadastrado',
      });

      const resultado = await pool.query(
        'SELECT COUNT(*)::int AS total FROM users WHERE LOWER(email) = LOWER($1)',
        [emailMinusculo]
      );
      expect(resultado.rows[0].total).toBe(1);
    });
  });

  describe('campos obrigatórios', () => {
    it.each(['name', 'email', 'password', 'phone'])(
      'deve retornar 400 quando o campo obrigatório %s estiver ausente',
      async (campo) => {
        const payload: Record<string, unknown> = {
          ...validRegisterPayload({ email: uniqueEmail(`sem_${campo}`) }),
        };
        delete payload[campo];

        const res = await register(payload);

        expect(res.status).toBe(400);
        expect(res.body.status).toBe('fail');
        expect(res.body.errors).toHaveLength(1);
        expect(res.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: `body.${campo}` }),
          ])
        );
      }
    );
  });

  describe('validação de e-mail', () => {
    it('deve retornar 400 quando o e-mail tiver formato inválido', async () => {
      const res = await register(
        validRegisterPayload({ email: 'mariana.costa-sem-arroba' })
      );

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('fail');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'body.email',
            message: 'Formato de e-mail inválido',
          }),
        ])
      );
    });
  });

  describe('validação de senha', () => {
    it.each([
      [
        'sem letra maiúscula',
        'senhaforte1!',
        'A senha deve conter ao menos uma letra maiúscula',
      ],
      [
        'sem letra minúscula',
        'SENHAFORTE1!',
        'A senha deve conter ao menos uma letra minúscula',
      ],
      [
        'sem número',
        'SenhaForte!',
        'A senha deve conter ao menos um número',
      ],
      [
        'sem caractere especial',
        'SenhaForte1',
        'A senha deve conter ao menos um caractere especial',
      ],
      [
        'com menos de 8 caracteres',
        'Ab1!',
        'A senha deve ter pelo menos 8 caracteres',
      ],
    ])(
      'deve retornar 400 para senha %s',
      async (_descricao, password, mensagemEsperada) => {
        const res = await register(
          validRegisterPayload({
            email: uniqueEmail('senha'),
            password,
          })
        );

        expect(res.status).toBe(400);
        expect(res.body.status).toBe('fail');
        expect(res.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: 'body.password',
              message: mensagemEsperada,
            }),
          ])
        );
      }
    );
  });

  describe('validação de nome', () => {
    it('deve retornar 400 quando o nome tiver menos de 2 caracteres', async () => {
      const res = await register(
        validRegisterPayload({
          email: uniqueEmail('nome_curto'),
          name: 'A',
        })
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
      const res = await register(
        validRegisterPayload({
          email: uniqueEmail('nome_longo'),
          name: 'A'.repeat(256),
        })
      );

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('fail');
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].field).toBe('body.name');
      expect(res.body.errors[0].message).toMatch(/255/);
    });
  });

  describe('validação de telefone', () => {
    it.each([
      ['apenas números', '37999999999'],
      ['com máscara', '(37) 98888-7777'],
    ])('deve aceitar telefone %s', async (_descricao, phone) => {
      const res = await register(
        validRegisterPayload({
          email: uniqueEmail(`telefone_valido_${phone.replace(/\D/g, '')}`),
          phone,
        })
      );

      expect(res.status).toBe(201);
      expect(res.body.user.phone).toBe(phone);
    });

    it.each([
      ['telefone curto', '1234'],
      ['sem DDD', '988887777'],
      ['com letras', '(37) 98888-ABCD'],
      ['com dígitos a mais', '379999999999'],
    ])(
      'deve retornar 400 para telefone inválido (%s)',
      async (_descricao, phone) => {
        const res = await register(
          validRegisterPayload({
            email: uniqueEmail('telefone_invalido'),
            phone,
          })
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
  });

  describe('validação de role', () => {
    it('deve retornar 400 quando a role for inválida', async () => {
      const res = await register(
        validRegisterPayload({
          email: uniqueEmail('role_invalida'),
          role: 'GERENTE',
        })
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
  });

  describe('validação de commission_rates', () => {
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
        const res = await register(
          validRegisterPayload({
            email: uniqueEmail('comissao_invalida'),
            commission_rates: commissionRates,
          })
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

    it('deve persistir commission_rates = 0', async () => {
      const res = await register(
        validRegisterPayload({
          email: uniqueEmail('comissao_zero'),
          commission_rates: 0,
        })
      );

      expect(res.status).toBe(201);

      console.log('res.body.user.commission_rates:', res.body.user.commission_rates);

      // Comportamento esperado: 0 é um valor válido e deve ser persistido
      // como 0, não convertido para null.
      expect(res.body.user.commission_rates).not.toBeNull();
      expect(Number(res.body.user.commission_rates)).toBe(0);

      const resultado = await pool.query(
        'SELECT commission_rates FROM users WHERE id = $1',
        [res.body.user.id]
      );
      expect(resultado.rows[0].commission_rates).not.toBeNull();
      expect(Number(resultado.rows[0].commission_rates)).toBe(0);
    });
  });

  describe('role padrão e criação privilegiada', () => {
    it('deve definir VENDEDOR como role padrão quando não informada', async () => {
      const payload = validRegisterPayload({
        email: uniqueEmail('role_padrao'),
      });
      expect(payload).not.toHaveProperty('role');

      const res = await register(payload);

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('VENDEDOR');

      const resultado = await pool.query(
        'SELECT role FROM users WHERE id = $1',
        [res.body.user.id]
      );
      expect(resultado.rows[0].role).toBe('VENDEDOR');
    });

    it('não deve permitir criar usuário sem autenticação', async () => {
      const res = await register(
        validRegisterPayload({
          email: uniqueEmail('sem_token'),
        }),
        null
      );

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Acesso negado. Token não fornecido ou inválido');
    });

    it('não deve permitir criar usuário com perfil não-ADMIN', async () => {
      const res = await register(
        validRegisterPayload({
          email: uniqueEmail('sem_permissao'),
        }),
        signToken('VENDEDOR')
      );

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Acesso proibido. Permissão insuficiente.');
    });

    it('deve permitir que ADMIN crie outro usuário ADMIN', async () => {
      const emailAdmin = uniqueEmail('novo_admin');
      const res = await register(
        validRegisterPayload({
          email: emailAdmin,
          role: 'ADMIN',
        })
      );

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('ADMIN');

      const resultado = await pool.query(
        'SELECT role FROM users WHERE id = $1',
        [res.body.user.id]
      );
      expect(resultado.rows[0].role).toBe('ADMIN');
    });
  });

  describe('campos extras no body', () => {
    it('não deve persistir campos extras enviados no body', async () => {
      const idInjetado = '00000000-0000-4000-8000-000000000000';

      const res = await register(
        validRegisterPayload({
          email: uniqueEmail('campos_extras'),
          id: idInjetado,
          is_active: false,
          deleted_at: '2026-01-01T00:00:00.000Z',
          password_hash: 'hash-injetado',
          foo: 'bar',
        })
      );

      expect(res.status).toBe(201);
      expect(res.body.user.id).toMatch(UUID_REGEX);
      expect(res.body.user.id).not.toBe(idInjetado);
      expect(res.body.user.is_active).toBe(true);
      expect(res.body.user.deleted_at).toBeNull();
      expect(res.body.user).not.toHaveProperty('password_hash');
      expect(res.body.user).not.toHaveProperty('foo');

      const resultado = await pool.query(
        'SELECT id, is_active, deleted_at, password_hash FROM users WHERE id = $1',
        [res.body.user.id]
      );

      expect(resultado.rows).toHaveLength(1);
      expect(resultado.rows[0].id).toBe(res.body.user.id);
      expect(resultado.rows[0].is_active).toBe(true);
      expect(resultado.rows[0].deleted_at).toBeNull();
      expect(resultado.rows[0].password_hash).not.toBe('hash-injetado');
      expect(resultado.rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('rate limit de register', () => {
    it('deve retornar 429 na sexta tentativa de registro do mesmo IP', async () => {
      const ipFixo = '203.0.113.77';
      const respostas = [];

      for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
        const res = await register(
          {
            email: uniqueEmail(`rate_limit_${tentativa}`),
          },
          ipFixo
        );
        respostas.push(res);
      }

      respostas.slice(0, 5).forEach((res) => {
        expect(res.status).toBe(400);
        expect(res.body.status).toBe('fail');
      });

      expect(respostas[5].status).toBe(429);
      expect(respostas[5].body).toEqual({
        message:
          'Muitas contas criadas a partir deste IP. Tente novamente em 1 hora.',
      });
    });
  });
});
