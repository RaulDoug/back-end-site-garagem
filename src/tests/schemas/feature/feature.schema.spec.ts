import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';
import {
  createFeatureSchema,
  deleteFeatureSchema,
  findFeatureSchema,
  findByIdFeatureSchema,
  updateFeatureSchema,
} from '#schemas/feature.schema.js';

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

describe('Feature Schemas', () => {
  describe('createFeatureSchema', () => {
    it('deve aceitar payload válido para criação de opcional', () => {
      const result = createFeatureSchema.safeParse({
        body: { name: 'Ar-condicionado' },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.body.name).toBe('Ar-condicionado');
    });

    it('deve rejeitar body sem o campo name', () => {
      const result = createFeatureSchema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expectIssue(result, ['body', 'name']);
    });

    it('deve rejeitar nome menor que 2 caracteres', () => {
      const result = createFeatureSchema.safeParse({
        body: { name: 'X' },
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['body', 'name'], 'no mínimo 2 caracteres');
    });
  });

  describe('updateFeatureSchema', () => {
    it('deve aceitar id e nome válidos', () => {
      const result = updateFeatureSchema.safeParse({
        params: { id: VALID_UUID },
        body: { name: 'Teto Solar Panorâmico' },
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar se id nos params for inválido', () => {
      const result = updateFeatureSchema.safeParse({
        params: { id: 'nao-e-uuid' },
        body: { name: 'Teto Solar' },
      });
      expect(result.success).toBe(false);
      expectIssue(result, ['params', 'id'], 'ID do opcional inválido');
    });
  });

  describe('deleteFeatureSchema & findByIdFeatureSchema', () => {
    it('deve aceitar id válido nos params', () => {
      const resFind = findByIdFeatureSchema.safeParse({ params: { id: VALID_UUID } });
      const resDel = deleteFeatureSchema.safeParse({ params: { id: VALID_UUID } });

      expect(resFind.success).toBe(true);
      expect(resDel.success).toBe(true);
    });

    it('deve rejeitar id inválido', () => {
      const result = deleteFeatureSchema.safeParse({ params: { id: 'invalido' } });
      expect(result.success).toBe(false);
      expectIssue(result, ['params', 'id']);
    });
  });

  describe('findFeatureSchema', () => {
    it('deve aceitar filtros básicos de paginação e nome', () => {
      const result = findFeatureSchema.safeParse({
        query: {
          name: 'Direção',
          name_like: 'Dir',
          page: '1',
          limit: '20',
        },
      });

      expect(result.success).toBe(true);
    });

    it('deve rejeitar limite menor que 1', () => {
      const result = findFeatureSchema.safeParse({
        query: { limit: '0' },
      });

      expect(result.success).toBe(false);
      expectIssue(result, ['query', 'limit'], 'não pode ser menor que 1');
    });
  });
});
