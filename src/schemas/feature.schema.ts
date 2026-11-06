import { z } from 'zod';

const idValidation = z.string().uuid('ID do opcional inválido');
const nameValidation = z.string()
  .min(2, 'O nome do opcional deve ter no mínimo 2 caracteres')
  .max(255, 'O nome do opcional deve ter no máximo 255 caracteres');

export const createFeatureSchema = z.object({
  body: z.object({ name: nameValidation })
});

export const updateFeatureSchema = z.object({
  params: z.object({ id: idValidation }),
  body: z.object({ name: nameValidation })
});

export const deleteFeatureSchema = z.object({
  params: z.object({ id: idValidation })
});

export const findByIdFeatureSchema = z.object({
  params: z.object({ id: idValidation })
});

export const findFeatureSchema = z.object({
  query: z.object({
    name: z.string().optional(),
    name_like: z.string().optional(),
    page: z.coerce.number().min(1, 'A paginação não pode ser menor que 1').optional(),
    limit: z.coerce.number().min(1, 'O limite da consulta não pode ser menor que 1').optional()
  })
});

export type CreateFeatureInput = z.infer<typeof createFeatureSchema>['body'];
export type UpdateFeatureParams = z.infer<typeof updateFeatureSchema>['params'];
export type UpdateFeatureBody = z.infer<typeof updateFeatureSchema>['body'];
export type DeleteFeatureInput = z.infer<typeof deleteFeatureSchema>['params'];
export type FindByIdFeatureInput = z.infer<typeof findByIdFeatureSchema>['params'];
export type FindFeatureInput = z.infer<typeof findFeatureSchema>['query'];
