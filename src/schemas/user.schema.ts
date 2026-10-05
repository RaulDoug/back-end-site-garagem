import { z } from 'zod';


const nameValidation = z.string().trim().min(2, 'O nome deve conter no mínimo 2 caracteres').max(255);
const emailValidation = z.string().trim().email('Formato de e-mail inválido').toLowerCase();
const passwordValidation = z
  .string().min(8, 'A senha deve ter pelo menos 8 caracteres')
  .regex(/[A-Z]/, { message: 'A senha deve conter ao menos uma letra maiúscula' })
  .regex(/[a-z]/, { message: 'A senha deve conter ao menos uma letra minúscula' })
  .regex(/[0-9]/, { message: 'A senha deve conter ao menos um número' })
  .regex(/[^A-Za-z0-9]/, { message: 'A senha deve conter ao menos um caractere especial' });
const phoneValidation = z
  .string()
  .trim()
  .regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, 'Formato de telefone inválido. Use (XX) XXXXX-XXXX ou apenas números');
const roleValidation = z.enum(['ADMIN', 'VENDEDOR', 'VISUALIZADOR', 'PUBLICO'], {
  message: "Tipo inválido. Dever ser: 'ADMIN', 'VENDEDOR', 'VISUALIZADOR', 'PUBLICO'", // eslint-disable-line
}).optional();
const commissionRatesValidation = z
  .number({ message: 'A taxa de comissão deve ser um número' })
  .min(0, 'A comissão mínima é 0%')
  .max(100, 'A comissão máxima é 100%')
  .optional();



export const createUserSchema = z.object({
  body: z.object({
    name: nameValidation,
    email: emailValidation,
    password: passwordValidation,
    phone: phoneValidation,
    role: roleValidation,
    commission_rates: commissionRatesValidation,
  })
});

export const loginUserSchema = z.object({
  body: z.object({
    email: emailValidation,
    password: z.string().min(1, 'A senha é obrigatória'),
  }),
});

const idValidation = z.string().uuid('ID do usuário inválido');

export const updateUserSchema = z.object({
  params: z.object({
    id: idValidation,
  }),
  body: z.object({
    name: nameValidation.optional(),
    phone: phoneValidation.optional(),
    role: roleValidation.optional(),
    commission_rates: commissionRatesValidation,
  })
});

export const deleteUserSchema = z.object({
  query: {
    id: idValidation,
  }
});

export const findByIdUserSchema = z.object({
  params: z.object({ id: idValidation })
});

export const findByEmailUserSchema = z.object({
  query: z.object({ email: emailValidation })
});


// Exportação de tipos
export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
export type LoginUserInput = z.infer<typeof loginUserSchema>['body'];
export type UpdateUserParams = z.infer<typeof updateUserSchema>['params'];
export type UpdateUserBody = z.infer<typeof updateUserSchema>['body'];
