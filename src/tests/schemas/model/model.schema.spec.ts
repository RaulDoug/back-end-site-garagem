import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';
import {
  createModelSchema,
  deleteModelSchema,
  findModelSchema,
  findByIdModelSchema,
  updateModelSchema,
} from '#schemas/model.schema.js';

const VALID_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const VALID_BRAND_ID = '3a8d1c2b-7a61-4e59-9b0a-2c3d4e5f6a7b';

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

describe('Model Schemas', () => {
  describe('createModelSchema', () => {
    it('deve aceitar payload válido com brand_id e name', () => {
      const result = createModelSchema.safeParse({
        body: {
          brand_id: VALID_BRAND_ID,
          name: 'Corolla',
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.body.name).toBe('Corolla');
      expect(result.data.body.brand_id).toBe(VALID_BRAND_ID);
    });

    it('deve rejeitar se faltar brand_id', () => {
      const result = createModelSchema.safeParse({
        body: { name: 'Civic' },
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['body', 'brand_id']);
    });

    it('deve rejeitar brand_id com formato inválido', () => {
      const result = createModelSchema.safeParse({
        body: { brand_id: '1234', name: 'Civic' },
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['body', 'brand_id'], 'ID da marca inválido');
    });

    it('deve rejeitar se faltar name', () => {
      const result = createModelSchema.safeParse({
        body: { brand_id: VALID_BRAND_ID },
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['body', 'name']);
    });
  });

  describe('updateModelSchema', () => {
    it('deve aceitar atualização parcial apenas com name', () => {
      const result = updateModelSchema.safeParse({
        params: { id: VALID_UUID },
        body: { name: 'Corolla Cross' },
      });
      expect(result.success).toBe(true);
    });

    it('deve aceitar atualização parcial apenas com brand_id', () => {
      const result = updateModelSchema.safeParse({
        params: { id: VALID_UUID },
        body: { brand_id: VALID_BRAND_ID },
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar body vazio no update', () => {
      const result = updateModelSchema.safeParse({
        params: { id: VALID_UUID },
        body: {},
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['body'], 'Ao menos um campo deve ser informado');
    });
  });

  describe('deleteModelSchema & findByIdModelSchema', () => {
    it('deve aceitar id válido nos params', () => {
      const resFind = findByIdModelSchema.safeParse({ params: { id: VALID_UUID } });
      const resDel = deleteModelSchema.safeParse({ params: { id: VALID_UUID } });

      expect(resFind.success).toBe(true);
      expect(resDel.success).toBe(true);
    });

    it('deve rejeitar id inválido nos params', () => {
      const result = deleteModelSchema.safeParse({ params: { id: 'invalido' } });
      expect(result.success).toBe(false);
      expectIssue(result, ['params', 'id']);
    });
  });

  describe('findModelSchema', () => {
    it('deve aceitar filtros incluindo brand_id', () => {
      const result = findModelSchema.safeParse({
        query: {
          brand_id: VALID_BRAND_ID,
          name_like: 'Cor',
          is_active: 'true',
        },
      });

      expect(result.success).toBe(true);
    });

    it('deve rejeitar brand_id inválido na query', () => {
      const result = findModelSchema.safeParse({
        query: { brand_id: 'invalido' },
      });

      expect(result.success).toBe(false);
      expectIssue(result, ['query', 'brand_id'], 'ID da marca inválido');
    });
  });
});
