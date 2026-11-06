import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';
import {
  createBrandSchema,
  deleteBrandSchema,
  findBrandSchema,
  findByIdBrandSchema,
  updateBrandSchema,
} from '#schemas/brand.schema.js';

const VALID_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

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

describe('Brand Schemas', () => {
  describe('createBrandSchema', () => {
    it('deve aceitar payload válido com nome correto', () => {
      const result = createBrandSchema.safeParse({
        body: { name: 'Toyota' },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.body.name).toBe('Toyota');
    });

    it('deve rejeitar quando body for vazio ou faltar nome', () => {
      const result = createBrandSchema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expectIssue(result, ['body', 'name']);
    });

    it('deve rejeitar nome com menos de 2 caracteres', () => {
      const result = createBrandSchema.safeParse({
        body: { name: 'A' },
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['body', 'name'], 'no mínimo 2 caracteres');
    });

    it('deve rejeitar nome com mais de 255 caracteres', () => {
      const result = createBrandSchema.safeParse({
        body: { name: 'A'.repeat(256) },
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['body', 'name'], 'no máximo 255 caracteres');
    });
  });

  describe('updateBrandSchema', () => {
    it('deve aceitar params e body válidos', () => {
      const result = updateBrandSchema.safeParse({
        params: { id: VALID_UUID },
        body: { name: 'Honda' },
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar id inválido nos params', () => {
      const result = updateBrandSchema.safeParse({
        params: { id: 'uuid-invalido' },
        body: { name: 'Honda' },
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['params', 'id'], 'ID da marca inválido');
    });
  });

  describe('deleteBrandSchema & findByIdBrandSchema', () => {
    it('deve aceitar id válido nos params para findById e delete', () => {
      const findRes = findByIdBrandSchema.safeParse({ params: { id: VALID_UUID } });
      const delRes = deleteBrandSchema.safeParse({ params: { id: VALID_UUID } });

      expect(findRes.success).toBe(true);
      expect(delRes.success).toBe(true);
    });

    it('deve rejeitar id inválido', () => {
      const result = deleteBrandSchema.safeParse({ params: { id: '123' } });
      expect(result.success).toBe(false);
      expectIssue(result, ['params', 'id']);
    });
  });

  describe('findBrandSchema', () => {
    it('deve aceitar query com filtros opcionais', () => {
      const result = findBrandSchema.safeParse({
        query: {
          name: 'Toyota',
          name_like: 'Toy',
          page: '1',
          limit: '10',
          is_active: 'true',
        },
      });

      expect(result.success).toBe(true);
    });

    it('deve rejeitar paginação negativa ou zero', () => {
      const result = findBrandSchema.safeParse({
        query: { page: '0' },
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['query', 'page'], 'não pode ser menor que 1');
    });
  });
});
