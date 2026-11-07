import { z } from 'zod';

const deleteActiveEnumValidate = z.enum(['true', 'false'], 'Este campo aceita apenas "true" ou "false"').optional();
const dateValidation = z.string().date().optional();

export const baseFindQuerySchema = z.object({
  include_deleted: z.string().optional(),
  is_active: deleteActiveEnumValidate,
  created_at_gte: dateValidation,
  created_at_lte: dateValidation,
  page: z.coerce.number().min(1, 'A paginação não pode ser menor que 1').optional(),
  limit: z.coerce.number().min(1, 'O limte da consulta não pode ser menor que 1').optional()
});