import { z } from 'zod';

export const vehicleSaleTypes = ['PROPRIO', 'CONSIGNADO'] as const;
export const vehicleTransmissionTypes = ['AUTOMATICO', 'MANUAL', 'AUTOMATIZADO'] as const;
export const vehicleCategoryTypes = [
  'HATCH',
  'SEDÃ',
  'SUV',
  'PICAPE',
  'CUPE',
  'CONVERSIVEL',
  'PERUA',
  'MINIVAN/VAN',
  'ESPORTIVO',
] as const;
export const vehicleFuelTypes = [
  'GASOLINA',
  'ALCOOL',
  'DIESEL',
  'FLEX',
  'ELETRICO',
  'HIBRIDO',
] as const;
export const vehicleStatusTypes = [
  'ATIVO',
  'RESERVADO',
  'EM_NEGOCIACAO',
  'VENDIDO',
  'INATIVO',
] as const;

export const saleTypeEnum = z.enum(vehicleSaleTypes);
export const transmissionEnum = z.enum(vehicleTransmissionTypes);
export const categoryEnum = z.enum(vehicleCategoryTypes);
export const fuelTypeEnum = z.enum(vehicleFuelTypes);
export const statusEnum = z.enum(vehicleStatusTypes);

const idValidation = z.string().uuid('ID do veículo inválido');

export const licensePlateValidation = z
  .string()
  .transform((val) => val.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/,
        'Placa inválida. Utilize o formato Mercosul (ex: ABC1D23) ou padrão antigo (ex: ABC1234)'
      )
  );

const baseVehicleBodySchema = z.object({
  store_id: z.string().uuid('ID da loja inválido'),
  model_id: z.string().uuid('ID do modelo inválido'),
  promotion_id: z.string().uuid('ID da promoção inválido').optional().nullable(),
  sale_type: saleTypeEnum,
  title: z
    .string()
    .min(3, 'O título deve ter no mínimo 3 caracteres')
    .max(255, 'O título deve ter no máximo 255 caracteres'),
  description: z.string().min(5, 'A descrição deve ter no mínimo 5 caracteres'),
  sale_price: z.coerce.number().positive('O preço de venda deve ser maior que zero'),
  purchase_price: z.coerce.number().optional().nullable(),
  owner_price: z.coerce.number().optional().nullable(),
  store_commission_rate: z.coerce
    .number()
    .min(0, 'A comissão da loja não pode ser negativa')
    .optional()
    .nullable(),
  owner_name: z.string().min(2, 'Nome do proprietário muito curto').max(255).optional().nullable(),
  owner_contact: z.string().min(8, 'Contato do proprietário inválido').max(15).optional().nullable(),
  fipe_price: z.coerce.number().positive().optional().nullable(),
  min_down_payment: z.coerce.number().min(0).optional().nullable(),
  max_installments: z.coerce.number().int().positive().optional().nullable(),
  manufacture_year: z.coerce
    .number()
    .int()
    .min(1900, 'Ano de fabricação inválido')
    .max(new Date().getFullYear() + 2, 'Ano de fabricação futuro inválido'),
  model_year: z.coerce
    .number()
    .int()
    .min(1900, 'Ano do modelo inválido')
    .max(new Date().getFullYear() + 2, 'Ano do modelo futuro inválido'),
  mileage: z.coerce.number().int().min(0, 'A quilometragem não pode ser negativa'),
  transmission: transmissionEnum,
  color: z.string().min(2, 'Cor inválida').max(20),
  category: categoryEnum,
  horsepower: z.coerce.number().int().positive().optional().nullable(),
  fuel_type: fuelTypeEnum,
  steering: z.string().min(2, 'Tipo de direção inválido').max(20),
  doors: z.coerce.number().int().min(1, 'Número de portas inválido').max(10),
  full_license_plate: licensePlateValidation,
  status: statusEnum.optional(),
  video_url: z.string().max(255).optional().nullable(),
  inspection_report_url: z.string().max(255).optional().nullable(),
  feature_ids: z.array(z.string().uuid('ID do opcional inválido')).optional(),
});

export const createVehicleSchema = z.object({
  body: baseVehicleBodySchema
    .extend({
      sale_type: saleTypeEnum.default('PROPRIO'),
    })
    .superRefine((data, ctx) => {
      if (data.sale_type === 'PROPRIO') {
        if (
          data.purchase_price === undefined ||
          data.purchase_price === null ||
          data.purchase_price <= 0
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['purchase_price'],
            message: 'Preço de compra é obrigatório e deve ser maior que zero para veículos próprios',
          });
        }
      } else if (data.sale_type === 'CONSIGNADO') {
        if (!data.owner_name || data.owner_name.trim().length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['owner_name'],
            message: 'Nome do proprietário é obrigatório para veículos consignados',
          });
        }
        if (!data.owner_contact || data.owner_contact.trim().length < 8) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['owner_contact'],
            message: 'Contato do proprietário é obrigatório para veículos consignados',
          });
        }
        if (
          data.owner_price === undefined ||
          data.owner_price === null ||
          data.owner_price <= 0
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['owner_price'],
            message: 'Valor líquido do proprietário é obrigatório para veículos consignados',
          });
        }
        if (
          data.store_commission_rate === undefined ||
          data.store_commission_rate === null ||
          data.store_commission_rate < 0
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['store_commission_rate'],
            message: 'Taxa de comissão da loja é obrigatória para veículos consignados',
          });
        }
      }
    }),
});

export const updateVehicleSchema = z.object({
  params: z.object({ id: idValidation }),
  body: baseVehicleBodySchema
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Ao menos um campo deve ser informado para atualização',
    }),
});

export const deleteVehicleSchema = z.object({
  params: z.object({ id: idValidation }),
});

export const findByIdVehicleSchema = z.object({
  params: z.object({ id: idValidation }),
});

export const findVehicleSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1, 'A paginação não pode ser menor que 1').default(1),
    limit: z.coerce
      .number()
      .int()
      .refine(
        (val) => [12, 24, 36, 48].includes(val),
        'O limite por página deve ser 12, 24, 36 ou 48'
      )
      .default(12),
    category: categoryEnum.optional(),
    brand_id: z.string().uuid('ID da marca inválido').optional(),
    model_id: z.string().uuid('ID do modelo inválido').optional(),
    fuel_type: fuelTypeEnum.optional(),
    transmission: transmissionEnum.optional(),
    min_price: z.coerce.number().min(0, 'Preço mínimo não pode ser negativo').optional(),
    max_price: z.coerce.number().min(0, 'Preço máximo não pode ser negativo').optional(),
    min_year: z.coerce.number().int().min(1900).optional(),
    max_year: z.coerce.number().int().min(1900).optional(),
    max_mileage: z.coerce.number().int().min(0).optional(),
    plate_last_digit: z.coerce
      .number()
      .int()
      .min(0, 'Final de placa deve ser entre 0 e 9')
      .max(9, 'Final de placa deve ser entre 0 e 9')
      .optional(),
    feature_ids: z
      .string()
      .refine(
        (val) => {
          const ids = val
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          return ids.length > 0 && ids.every((id) => z.string().uuid().safeParse(id).success);
        },
        { message: 'Todos os feature_ids informados devem ser UUIDs válidos separados por vírgula' }
      )
      .optional(),
    status: statusEnum.optional(),
    search: z.string().optional(),
    include_deleted: z.string().optional(),
  }),
});

export const compareVehiclesSchema = z.object({
  query: z.object({
    ids: z
      .string()
      .transform((val) => val.split(',').map((s) => s.trim()))
      .superRefine((arr, ctx) => {
        if (arr.length < 2 || arr.length > 3) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'O comparador exige no mínimo 2 e no máximo 3 veículos',
          });
          return;
        }

        const hasInvalidUuid = arr.some((id) => !z.string().uuid().safeParse(id).success);
        if (hasInvalidUuid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Todos os identificadores informados devem ser UUIDs válidos',
          });
        }
      }),
  }),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>['body'];
export type UpdateVehicleParams = z.infer<typeof updateVehicleSchema>['params'];
export type UpdateVehicleBody = z.infer<typeof updateVehicleSchema>['body'];
export type FindVehicleQuery = z.infer<typeof findVehicleSchema>['query'];
export type CompareVehiclesQuery = z.infer<typeof compareVehiclesSchema>['query'];
