import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';
import {
  createStoreSchema,
  deleteStoreSchema,
  findByCnpjStoreSchema,
  findByIdStoreSchema,
  updateStoreSchema,
} from '#schemas/store.schema.js';

const VALID_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const VALID_CNPJ = '12345678000195';
const VALID_CNPJ_MASKED = '12.345.678/0001-95';

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Garagem Prime Veículos',
  phone: '(37) 98888-7777',
  cnpj: VALID_CNPJ_MASKED,
  zip_code: '35500-000',
  street: 'Av. das Nações',
  number: '1500',
  neighborhood: 'Centro',
  city: 'Divinópolis',
  state: 'MG',
  complement: 'Sala 10',
  ...overrides,
});

const issuesOf = (result: { success: boolean; error?: ZodError }) => {
  if (result.success || !result.error) {
    throw new Error('Esperava uma falha de validação do Zod');
  }
  return result.error.issues;
};

const expectIssue = (
  result: { success: boolean; error?: ZodError },
  path: Array<string | number>,
  message?: string
) => {
  expect(result.success).toBe(false);
  const issues = issuesOf(result);
  const matched = issues.find((issue) =>
    issue.path.every((segment, idx) => segment === path[idx])
  );
  expect(matched).toBeDefined();
  if (message && matched) {
    expect(matched.message).toContain(message);
  }
};

describe('createStoreSchema', () => {
  it('deve aceitar payload válido e normalizar cnpj para 14 dígitos numéricos', () => {
    const result = createStoreSchema.safeParse({
      body: validBody({
        name: '  Loja Central Veículos  ',
        street: '  Rua das Flores  ',
        cnpj: VALID_CNPJ_MASKED,
      }),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.body.name).toBe('Loja Central Veículos');
    expect(result.data.body.street).toBe('Rua das Flores');
    expect(result.data.body.cnpj).toBe(VALID_CNPJ);
    expect(result.data.body.zip_code).toBe('35500000');
    expect(result.data.body.state).toBe('MG');
  });

  it('deve aceitar CNPJ que já venha sem máscara apenas com 14 dígitos', () => {
    const result = createStoreSchema.safeParse({
      body: validBody({ cnpj: VALID_CNPJ }),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.body.cnpj).toBe(VALID_CNPJ);
  });

  it('deve rejeitar payload se faltarem campos obrigatórios', () => {
    const result = createStoreSchema.safeParse({ body: {} });

    expect(result.success).toBe(false);
    expectIssue(result, ['body', 'name']);
    expectIssue(result, ['body', 'phone']);
    expectIssue(result, ['body', 'cnpj']);
    expectIssue(result, ['body', 'zip_code']);
    expectIssue(result, ['body', 'street']);
    expectIssue(result, ['body', 'number']);
    expectIssue(result, ['body', 'neighborhood']);
    expectIssue(result, ['body', 'city']);
    expectIssue(result, ['body', 'state']);
  });

  it('deve rejeitar CNPJ com formato ou quantidade de dígitos inválida', () => {
    const invalidCnpjs = [
      '1234567800019',       // 13 dígitos
      '123456780001955',     // 15 dígitos
      '12.345.678/0001-9A',  // contém letras
      '              ',      // espaços vazios
    ];

    for (const cnpj of invalidCnpjs) {
      const result = createStoreSchema.safeParse({
        body: validBody({ cnpj }),
      });
      expectIssue(result, ['body', 'cnpj']);
    }
  });

  it('deve rejeitar telefone inválido', () => {
    const result = createStoreSchema.safeParse({
      body: validBody({ phone: '1234-5678' }), // sem DDD
    });

    expectIssue(result, ['body', 'phone']);
  });

  it('deve rejeitar limites de tamanho de name e campos de endereço', () => {
    const resultTooShort = createStoreSchema.safeParse({
      body: validBody({ name: 'A', street: 'R', number: '', neighborhood: 'B', city: 'C' }),
    });
    expectIssue(resultTooShort, ['body', 'name']);
    expectIssue(resultTooShort, ['body', 'street']);
    expectIssue(resultTooShort, ['body', 'number']);
    expectIssue(resultTooShort, ['body', 'neighborhood']);
    expectIssue(resultTooShort, ['body', 'city']);

    const resultTooLong = createStoreSchema.safeParse({
      body: validBody({ name: 'A'.repeat(256), street: 'B'.repeat(256) }),
    });
    expectIssue(resultTooLong, ['body', 'name']);
    expectIssue(resultTooLong, ['body', 'street']);
  });
});

describe('updateStoreSchema', () => {
  it('deve aceitar atualização parcial com apenas um dos campos', () => {
    const result = updateStoreSchema.safeParse({
      params: { id: VALID_UUID },
      body: { name: 'Novo Nome da Loja' },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.params.id).toBe(VALID_UUID);
    expect(result.data.body.name).toBe('Novo Nome da Loja');
    expect(result.data.body.cnpj).toBeUndefined();
  });

  it('deve normalizar CNPJ quando fornecido no update', () => {
    const result = updateStoreSchema.safeParse({
      params: { id: VALID_UUID },
      body: { cnpj: '98.765.432/0001-10' },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.body.cnpj).toBe('98765432000110');
  });

  it('deve rejeitar se o id em params não for um UUID válido', () => {
    const result = updateStoreSchema.safeParse({
      params: { id: 'id-invalido-123' },
      body: { name: 'Nome Atualizado' },
    });

    expectIssue(result, ['params', 'id']);
  });
});

describe('findByIdStoreSchema e deleteStoreSchema', () => {
  it('deve validar UUID em findByIdStoreSchema', () => {
    const valid = findByIdStoreSchema.safeParse({ params: { id: VALID_UUID } });
    expect(valid.success).toBe(true);

    const invalid = findByIdStoreSchema.safeParse({ params: { id: '123' } });
    expectIssue(invalid, ['params', 'id']);
  });

  it('deve validar UUID em deleteStoreSchema', () => {
    const valid = deleteStoreSchema.safeParse({ params: { id: VALID_UUID } });
    expect(valid.success).toBe(true);

    const invalid = deleteStoreSchema.safeParse({ params: { id: 'nao-uuid' } });
    expectIssue(invalid, ['params', 'id']);
  });
});

describe('findByCnpjStoreSchema', () => {
  it('deve aceitar CNPJ válido e normalizar para dígitos', () => {
    const result = findByCnpjStoreSchema.safeParse({
      params: { cnpj: VALID_CNPJ_MASKED },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.params.cnpj).toBe(VALID_CNPJ);
  });

  it('deve rejeitar CNPJ mal formatado na consulta', () => {
    const result = findByCnpjStoreSchema.safeParse({
      params: { cnpj: '12345' },
    });

    expectIssue(result, ['params', 'cnpj']);
  });
});
