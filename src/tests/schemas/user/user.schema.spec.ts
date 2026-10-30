import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';
import {
  createUserSchema,
  deleteUserSchema,
  findByIdUserSchema,
  loginUserSchema,
  updateUserSchema,
} from '#schemas/user.schema.js';

const VALID_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Mariana Costa',
  email: 'mariana.costa@garagem.com',
  password: 'SenhaForte123!',
  phone: '(37) 98888-7777',
  ...overrides,
});

const parseCreate = (overrides: Record<string, unknown> = {}) =>
  createUserSchema.safeParse({ body: validBody(overrides) });

const issuesOf = (result: { success: boolean; error?: ZodError }) => {
  if (result.success || !result.error) {
    throw new Error('Esperava uma falha de validação do Zod');
  }

  return result.error.issues;
};

const expectIssue = (
  result: { success: boolean; error?: ZodError },
  path: Array<string | number>,
  message: string
) => {
  expect(result.success).toBe(false);
  expect(issuesOf(result)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path,
        message,
      }),
    ])
  );
};

describe('createUserSchema', () => {
  it('deve aceitar um body válido e normalizar name e email', () => {
    const result = parseCreate({
      name: '  Mariana Costa  ',
      email: '  MARIANA.COSTA@GARAGEM.COM  ',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.body.name).toBe('Mariana Costa');
    expect(result.data.body.email).toBe('mariana.costa@garagem.com');
    expect(result.data.body.phone).toBe('(37) 98888-7777');
  });

  it('deve exigir name, email, password e phone', () => {
    const result = createUserSchema.safeParse({ body: {} });

    expect(result.success).toBe(false);
    const fields = issuesOf(result).map((issue) => issue.path.join('.'));
    expect(fields).toEqual(
      expect.arrayContaining([
        'body.name',
        'body.email',
        'body.password',
        'body.phone',
      ])
    );
  });

  it.each([
    ['válida', 'SenhaForte123!', null],
    [
      'com menos de 8 caracteres',
      'Ab1!',
      'A senha deve ter pelo menos 8 caracteres',
    ],
    [
      'sem letra maiúscula',
      'senhaforte123!',
      'A senha deve conter ao menos uma letra maiúscula',
    ],
    [
      'sem letra minúscula',
      'SENHAFORTE123!',
      'A senha deve conter ao menos uma letra minúscula',
    ],
    [
      'sem número',
      'SenhaForte!',
      'A senha deve conter ao menos um número',
    ],
    [
      'sem caractere especial',
      'SenhaForte123',
      'A senha deve conter ao menos um caractere especial',
    ],
  ])(
    'deve validar senha %s',
    (_descricao, password, expectedMessage) => {
      const result = parseCreate({ password });

      if (expectedMessage === null) {
        expect(result.success).toBe(true);
        return;
      }

      expectIssue(result, ['body', 'password'], expectedMessage);
    }
  );

  it.each([
    ['apenas números', '37999999999'],
    ['com máscara', '(37) 98888-7777'],
    ['com máscara sem espaço', '(37)98888-7777'],
    ['com DDD e espaço', '37 98888-7777'],
  ])('deve aceitar telefone %s', (_descricao, phone) => {
    const result = parseCreate({ phone });

    expect(result.success).toBe(true);
  });

  it.each([
    ['curto', '1234'],
    ['sem DDD', '988887777'],
    ['com letras', '(37) 98888-ABCD'],
    ['com dígitos a mais', '379999999999'],
  ])('deve rejeitar telefone %s', (_descricao, phone) => {
    const result = parseCreate({ phone });

    expectIssue(
      result,
      ['body', 'phone'],
      'Formato de telefone inválido. Use (XX) XXXXX-XXXX ou apenas números'
    );
  });

  it.each([
    ['sem arroba', 'paula.mendes-sem-arroba'],
    ['sem domínio', 'paula@'],
    ['sem usuário', '@garagem.com'],
  ])('deve rejeitar e-mail %s', (_descricao, email) => {
    const result = parseCreate({ email });

    expectIssue(result, ['body', 'email'], 'Formato de e-mail inválido');
  });

  it.each([0, 12.5, 100])(
    'deve aceitar commission_rates=%s',
    (commissionRates) => {
      const result = parseCreate({ commission_rates: commissionRates });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.body.commission_rates).toBe(commissionRates);
    }
  );

  it.each([
    ['menor que zero', -1, 'A comissão mínima é 0%'],
    ['maior que cem', 101, 'A comissão máxima é 100%'],
    [
      'enviada como string',
      '10',
      'A taxa de comissão deve ser um número',
    ],
    ['nula', null, 'A taxa de comissão deve ser um número'],
  ])(
    'deve rejeitar commission_rates %s',
    (_descricao, commissionRates, expectedMessage) => {
      const result = parseCreate({ commission_rates: commissionRates });

      expectIssue(result, ['body', 'commission_rates'], expectedMessage);
    }
  );

  it.each(['ADMIN', 'VENDEDOR', 'VISUALIZADOR', 'PUBLICO'])(
    'deve aceitar a role %s',
    (role) => {
      const result = parseCreate({ role });

      expect(result.success).toBe(true);
    }
  );

  it('deve rejeitar role desconhecida com a mensagem do schema', () => {
    const result = parseCreate({ role: 'GERENTE' });

    expectIssue(
      result,
      ['body', 'role'],
      'Tipo inválido. Dever ser: \'ADMIN\', \'VENDEDOR\', \'VISUALIZADOR\', \'PUBLICO\''
    );
  });
});

describe('loginUserSchema', () => {
  it('deve aceitar credenciais válidas', () => {
    const result = loginUserSchema.safeParse({
      body: {
        email: '  MARIANA@GARAGEM.COM  ',
        password: 'qualquer-senha',
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.body.email).toBe('mariana@garagem.com');
  });

  it('deve rejeitar senha vazia', () => {
    const result = loginUserSchema.safeParse({
      body: {
        email: 'mariana@garagem.com',
        password: '',
      },
    });

    expectIssue(result, ['body', 'password'], 'A senha é obrigatória');
  });

  it('deve rejeitar e-mail inválido', () => {
    const result = loginUserSchema.safeParse({
      body: {
        email: 'mariana-sem-arroba',
        password: 'SenhaForte123!',
      },
    });

    expectIssue(result, ['body', 'email'], 'Formato de e-mail inválido');
  });
});

describe('updateUserSchema', () => {
  it('deve aceitar UUID válido e body vazio', () => {
    const result = updateUserSchema.safeParse({
      params: { id: VALID_UUID },
      body: {},
    });

    expect(result.success).toBe(true);
  });

  it('deve rejeitar UUID inválido no params', () => {
    const result = updateUserSchema.safeParse({
      params: { id: 'id-invalido' },
      body: {},
    });

    expectIssue(result, ['params', 'id'], 'ID do usuário inválido');
  });
});

describe('deleteUserSchema e findByIdUserSchema', () => {
  it.each([
    ['deleteUserSchema', deleteUserSchema],
    ['findByIdUserSchema', findByIdUserSchema],
  ])('%s deve aceitar UUID válido', (_nome, schema) => {
    const result = schema.safeParse({ params: { id: VALID_UUID } });

    expect(result.success).toBe(true);
  });

  it.each([
    ['deleteUserSchema', deleteUserSchema],
    ['findByIdUserSchema', findByIdUserSchema],
  ])('%s deve rejeitar UUID inválido', (_nome, schema) => {
    const result = schema.safeParse({ params: { id: 'id-invalido' } });

    expectIssue(result, ['params', 'id'], 'ID do usuário inválido');
  });
});
