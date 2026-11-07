import { z } from 'zod';
import { baseFindQuerySchema } from '#schemas/base.schema.js';

const idValidation = z.string().uuid('ID do modelo inválido');
const brandIdValidation = z.string().uuid('ID da marca inválido');
const nameValidation = z.string()
  .min(2, 'O nome do modelo deve ter no mínimo 2 caracteres')
  .max(255, 'O nome do modelo deve ter no máximo 255 caracteres');

export const createModelSchema = z.object({
  body: z.object({
    brand_id: brandIdValidation,
    name: nameValidation
  })
});

export const updateModelSchema = z.object({
  params: z.object({ id: idValidation }),
  body: z.object({
    brand_id: brandIdValidation.optional(),
    name: nameValidation.optional()
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'Ao menos um campo deve ser informado para atualização'
  })
});

export const deleteModelSchema = z.object({
  params: z.object({ id: idValidation })
});

export const findByIdModelSchema = z.object({
  params: z.object({ id: idValidation })
});

export const findModelSchema = z.object({
  query: baseFindQuerySchema.extend({
    brand_id: z.string().uuid('ID da marca inválido').optional(),
    name: z.string().optional(),
    name_like: z.string().optional()
  })
});

export type CreateModelInput = z.infer<typeof createModelSchema>['body'];
export type UpdateModelParams = z.infer<typeof updateModelSchema>['params'];
export type UpdateModelBody = z.infer<typeof updateModelSchema>['body'];
export type DeleteModelInput = z.infer<typeof deleteModelSchema>['params'];
export type FindByIdModelInput = z.infer<typeof findByIdModelSchema>['params'];
export type FindModelInput = z.infer<typeof findModelSchema>['query'];
