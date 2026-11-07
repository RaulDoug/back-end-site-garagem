import { z } from 'zod';
import { baseFindQuerySchema } from '#schemas/base.schema.js';

const idValidation = z.string().uuid('ID da loja inválido');
const nameValidation = z.string().trim().min(2, 'O nome deve conter no mínimo 2 caracteres').max(255);
const phoneValidation = z
  .string()
  .trim()
  .regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, 'Formato de telefone inválido. Use (XX) XXXXX-XXXX ou apenas números');
const zipCodeValidation = z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido').transform(val => val.replace(/\D/g, ''));
const streetValidation = z.string().trim().min(2, 'A rua deve ter no mínimo 2 caracteres').max(255, 'A rua deve ter no máximo 255 caracteres');
const numberValidation = z.string().trim().min(1, 'O número deve ter pelo menos 1 caracter').max(20, 'O número deve ter no máximo 20 caracteres');
const complementValidation = z.string().max(100, 'O complemento deve ter no máximo 100 caracteres').optional();
const neighborhoodValidation = z.string().trim().min(2, 'O bairro deve ter no mínimo 2 caracteres').max(100, 'O Bairro deve ter no máximo 100 caracteres');
const cityValidation = z.string().trim().min(2, 'A cidade deve ter no mínimo 2 caracteres').max(100, 'A cidade deve ter no máximo 100 caracteres');
const stateValidation = z.string().length(2, 'Estado deve ter exatamente 2 caracteres').toUpperCase();
const cnpjValidation =z.string().trim().transform(val => val.replace(/\D/g, '')).refine(val => val.length === 14, 'CNPJ deve conter 14 dígitos');

const storeBodySchema = z.object({
  name: nameValidation,
  phone: phoneValidation,
  cnpj: cnpjValidation,
  zip_code: zipCodeValidation,
  street: streetValidation,
  number: numberValidation,
  neighborhood: neighborhoodValidation,
  city: cityValidation,
  state: stateValidation,
  complement: complementValidation,
});

export const createStoreSchema = z.object({
  body: storeBodySchema
});

export const updateStoreSchema = z.object({
  params: z.object({ id: idValidation }),
  body: storeBodySchema.partial()
});

export const findStoreSchema = z.object({
  query: baseFindQuerySchema.extend({
    name_like: z.string().optional(),
    cnpj: cnpjValidation.optional(),
    city_like: z.string().optional(),
    state: z.string().min(1).max(2).optional()
  })
});

export const findByCnpjStoreSchema = z.object({
  params: z.object({ cnpj: cnpjValidation })
});

export const findByIdStoreSchema = z.object({
  params: z.object({ id: idValidation })
});

export const deleteStoreSchema = z.object({
  params: z.object({ id: idValidation })
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>['body'];
export type UpdateStoreParams = z.infer<typeof updateStoreSchema>['params'];
export type UpdateStoreBody = z.infer<typeof updateStoreSchema>['body'];
export type DeleteStoreInput = z.infer<typeof deleteStoreSchema>['params'];

