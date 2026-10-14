import { validateCnpj } from '#utils/cnpj.util.js';
import { z } from 'zod';
import { updateUserSchema } from './user.schema';

const idValidation = z.string().uuid('Id da loja inválido');
const nameValidation = z.string().trim().min(2, 'O nome da loja cadastrada deve ter no mínimo 2 caracteres').max(255);
const phoneValidation = z
  .string()
  .trim()
  .regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, 'Formato de telefone inválido. Use (XX) XXXXX-XXXX ou apenas números');
const addressValidation = z.object({
  street: z.string().trim().min(2, 'O nome da rua deve ter no mínimo 2 caracteres'),
  neighborhood: z.string().trim().min(2, 'O nome do bairro deve ter pelo menos 2 caracteres'),
  number: z.number({ message: 'Deve informarmar apenas números' }),
  city: z.string().trim().min(2, 'O nome da cidade deve ter pelo menos 2 caracteres'),
  state: z.string().length(2, 'UF deve ter 2 letras'),
  zip_code: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
});
const cnpjValidation = z.string().refine(validateCnpj, { message: 'CNPJ inválido' });
const isActiveValidation = z.boolean().optional();


const storeBodySchema = z.object({
  name: nameValidation,
  phone: phoneValidation,
  address: addressValidation,
  cnpj: cnpjValidation,
});

export const createStoreSchema = z.object({
  body: storeBodySchema,
});

export const updateStoreSchema = z.object({
  params: z.object({
    id: idValidation,
  }),
  body: storeBodySchema.partial().extend({ is_active: isActiveValidation },)
});

export const deleteStoreSchema = z.object({
  params: z.object({
    id: idValidation,
  })
});

export const findByIdStoreSchema = z.object({
  query: z.object({ id: idValidation })
});

export const findStoreSchema = z.object({
  query: storeBodySchema.partial().extend({
    is_active: isActiveValidation,
    created_at: z.coerce.date({ message: 'Formato da data inválido' }).optional(),
  })
});

// Exportação de tipos
export type CreateStoreInput = z.infer<typeof createStoreSchema>['body'];
export type UpdateStoreParams = z.infer<typeof updateUserSchema>['params'];
export type UpdateStoreBody = z.infer<typeof updateStoreSchema>['body'];
export type FindStoreInput = z.infer<typeof findByIdStoreSchema>['query'];
export type AddressInput = z.infer<typeof addressValidation>;