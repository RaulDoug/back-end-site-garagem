import { z } from 'zod';
import { baseFindQuerySchema } from './base.schema';

const idValidation = z.string().uuid('ID da marca inválido');
const nameValidation = z.string()
  .min(2, 'O nome da marca deve ter no mínimo 2 caracteres')
  .max(255, 'O nome da marca deve ter no máximo 255 caracteres');

export const createBrandSchema = z.object({
  body: z.object({ name: nameValidation })
});

export const updateBrandSchema = z.object({
  params: z.object({ id: idValidation }),
  body: z.object({ name: nameValidation })
});

export const deleteBrandSchema = z.object({
  params: z.object({ id: idValidation })
});

export const findByIdBrandSchema = z.object({
  params: z.object({ id: idValidation })
});

export const findBrandSchema = z.object({
  query: baseFindQuerySchema.extend({ 
    name: z.string().optional(),
    name_like: z.string().optional()
  })
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>['body'];
export type UpdateBrandParams = z.infer<typeof updateBrandSchema>['params'];
export type UpdateBrandBody = z.infer<typeof updateBrandSchema>['body'];
export type DeleteBrandInput = z.infer<typeof deleteBrandSchema>['params']
export type FindByIdBrandInput = z.infer<typeof findByIdBrandSchema>['params']
export type FindBrandInput = z.infer<typeof findBrandSchema>['query'];