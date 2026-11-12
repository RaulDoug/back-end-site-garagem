import { z } from 'zod';
import { createStoreSchema } from '#schemas/store.schema.js';

export function validateCNPJ(val: string): boolean {
  const digits = val.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calcDigit = (slice: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += parseInt(slice[i], 10) * weights[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const d1 = calcDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== parseInt(digits[12], 10)) return false;

  const d2 = calcDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === parseInt(digits[13], 10);
}

export function validateCPF(val: string): boolean {
  const digits = val.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * (10 - i);
  }
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(digits[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i], 10) * (11 - i);
  }
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  return rem === parseInt(digits[10], 10);
}

export const createTenantSchema = z.object({
  corporate_name: z.string().trim().min(2, 'A razão social deve conter no mínimo 2 caracteres').max(255),
  trade_name: z.string().trim().min(2, 'O nome fantasia deve conter no mínimo 2 caracteres').max(255),
  cnpj: z
    .string()
    .trim()
    .min(14, 'CNPJ deve conter no mínimo 14 caracteres')
    .max(18, 'CNPJ deve conter no máximo 18 caracteres')
    .refine(validateCNPJ, { message: 'CNPJ inválido' }),
  is_active: z.boolean().optional().default(true),
});

export const updateTenantSchema = createTenantSchema.partial();

const storeInputSchema = z.union([
  createStoreSchema.shape.body,
  createStoreSchema.transform(s => s.body),
]);

const adminInputSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve conter no mínimo 2 caracteres').max(255),
  email: z.string().trim().email('Formato de e-mail inválido').toLowerCase(),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres').max(255),
  phone: z.string().trim().min(10, 'Telefone inválido').max(20),
  cpf: z.string().trim().refine(validateCPF, { message: 'CPF inválido' }),
  birth_date: z.string().optional().nullable(),
});

export const onboardTenantSchema = z.object({
  tenant: createTenantSchema,
  store: storeInputSchema,
  admin: adminInputSchema,
});

export const onboardTenantRouteSchema = z.object({
  body: onboardTenantSchema,
});

export const updateTenantRouteSchema = z.object({
  body: updateTenantSchema,
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type OnboardTenantInput = z.infer<typeof onboardTenantSchema>;
