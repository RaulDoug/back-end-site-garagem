import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';
import {
  createVehicleSchema,
  updateVehicleSchema,
  findVehicleSchema,
  findByIdVehicleSchema,
  deleteVehicleSchema,
  compareVehiclesSchema,
} from '#schemas/vehicle.schema.js';

// UUIDs v4 RFC-4122 válidos (versão 4, variante 1)
const VALID_UUID_STORE = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const VALID_UUID_MODEL = '2b3c4d5e-6f7a-4b9c-8d1e-2f3a4b5c6d7e';
const VALID_UUID_FEATURE_1 = '3c4d5e6f-7a8b-4c0d-9e2f-3a4b5c6d7e8f';
const VALID_UUID_FEATURE_2 = '4d5e6f7a-8b9c-4d1e-8f3a-4b5c6d7e8f9a';
const VALID_UUID_FEATURE_3 = '5e6f7a8b-9c0d-4e2f-9a4b-5c6d7e8f9a0b';

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

const validBaseVehicle = () => ({
  store_id: VALID_UUID_STORE,
  model_id: VALID_UUID_MODEL,
  title: 'Toyota Corolla 2.0 XEi Automático',
  description: 'Veículo em estado impecável, todas as revisões feitas na concessionária.',
  sale_price: 125000,
  manufacture_year: 2022,
  model_year: 2023,
  mileage: 35000,
  transmission: 'AUTOMATICO',
  color: 'Prata',
  category: 'SEDÃ',
  fuel_type: 'FLEX',
  steering: 'Elétrica',
  doors: 4,
  full_license_plate: 'ABC1D23',
});

describe('Vehicle Schemas', () => {
  describe('createVehicleSchema', () => {
    describe('Veículo PROPRIO', () => {
      it('deve aceitar payload válido de veículo PROPRIO com purchase_price', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'PROPRIO',
            purchase_price: 105000,
            feature_ids: [VALID_UUID_FEATURE_1, VALID_UUID_FEATURE_2],
          },
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.body.sale_type).toBe('PROPRIO');
        expect(result.data.body.purchase_price).toBe(105000);
        expect(result.data.body.full_license_plate).toBe('ABC1D23');
      });

      it('deve rejeitar veículo PROPRIO sem purchase_price informado', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'PROPRIO',
          },
        });

        expect(result.success).toBe(false);
        expectIssue(result, ['body', 'purchase_price']);
      });

      it('deve rejeitar veículo PROPRIO com purchase_price <= 0', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'PROPRIO',
            purchase_price: 0,
          },
        });

        expect(result.success).toBe(false);
        expectIssue(result, ['body', 'purchase_price']);
      });
    });

    describe('Veículo CONSIGNADO', () => {
      it('deve aceitar payload válido de veículo CONSIGNADO com dados do proprietário e comissão', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'CONSIGNADO',
            owner_name: 'Carlos Alberto Ferreira',
            owner_contact: '(37) 99999-1111',
            owner_price: 115000,
            store_commission_rate: 5.0,
          },
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.body.sale_type).toBe('CONSIGNADO');
        expect(result.data.body.owner_name).toBe('Carlos Alberto Ferreira');
        expect(result.data.body.owner_price).toBe(115000);
        expect(result.data.body.store_commission_rate).toBe(5.0);
      });

      it('deve rejeitar veículo CONSIGNADO se faltar owner_name ou owner_contact', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'CONSIGNADO',
            owner_price: 110000,
            store_commission_rate: 5.0,
          },
        });

        expect(result.success).toBe(false);
        expectIssue(result, ['body', 'owner_name']);
        expectIssue(result, ['body', 'owner_contact']);
      });

      it('deve rejeitar veículo CONSIGNADO se faltar owner_price ou store_commission_rate', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'CONSIGNADO',
            owner_name: 'João Silva',
            owner_contact: '(37) 98888-2222',
          },
        });

        expect(result.success).toBe(false);
        expectIssue(result, ['body', 'owner_price']);
        expectIssue(result, ['body', 'store_commission_rate']);
      });
    });

    describe('Validação e Normalização de Placa (Mercosul e Antiga)', () => {
      it('deve aceitar e normalizar placa Mercosul em minúsculas (bra2e19 -> BRA2E19)', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'PROPRIO',
            purchase_price: 90000,
            full_license_plate: 'bra2e19',
          },
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.body.full_license_plate).toBe('BRA2E19');
      });

      it('deve aceitar e normalizar placa padrão antigo com hífen (abc-1234 -> ABC1234)', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'PROPRIO',
            purchase_price: 90000,
            full_license_plate: 'abc-1234',
          },
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.body.full_license_plate).toBe('ABC1234');
      });

      it('deve rejeitar placas em formato inválido', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'PROPRIO',
            purchase_price: 90000,
            full_license_plate: '1234567',
          },
        });

        expect(result.success).toBe(false);
        expectIssue(result, ['body', 'full_license_plate']);
      });
    });

    describe('Validação de feature_ids', () => {
      it('deve rejeitar se feature_ids contiver string que não seja UUID', () => {
        const result = createVehicleSchema.safeParse({
          body: {
            ...validBaseVehicle(),
            sale_type: 'PROPRIO',
            purchase_price: 90000,
            feature_ids: [VALID_UUID_FEATURE_1, 'uuid-invalido'],
          },
        });

        expect(result.success).toBe(false);
        expectIssue(result, ['body', 'feature_ids', 1]);
      });
    });
  });

  describe('updateVehicleSchema', () => {
    it('deve aceitar id válido nos params e atualização parcial no body (incluindo status)', () => {
      const result = updateVehicleSchema.safeParse({
        params: { id: VALID_UUID_STORE },
        body: { sale_price: 120000, mileage: 40000, status: 'RESERVADO' },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.body.sale_price).toBe(120000);
      expect(result.data.body.status).toBe('RESERVADO');
    });

    it('deve rejeitar body vazio no update', () => {
      const result = updateVehicleSchema.safeParse({
        params: { id: VALID_UUID_STORE },
        body: {},
      });

      expect(result.success).toBe(false);
      expectIssue(result, ['body']);
    });
  });

  describe('findVehicleSchema', () => {
    it('deve aceitar limit permitido (12, 24, 36, 48) e filtros opcionais', () => {
      const result = findVehicleSchema.safeParse({
        query: {
          page: '2',
          limit: '24',
          category: 'SEDÃ',
          fuel_type: 'GASOLINA',
          transmission: 'AUTOMATICO',
          min_price: '50000',
          max_price: '150000',
          min_year: '2020',
          max_year: '2024',
          plate_last_digit: '3',
          feature_ids: `${VALID_UUID_FEATURE_1},${VALID_UUID_FEATURE_2}`,
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.query.page).toBe(2);
      expect(result.data.query.limit).toBe(24);
      expect(result.data.query.plate_last_digit).toBe(3);
    });

    it('deve rejeitar feature_ids na query se contiver UUID inválido', () => {
      const result = findVehicleSchema.safeParse({
        query: {
          feature_ids: `${VALID_UUID_FEATURE_1},nao-e-uuid`,
        },
      });

      expect(result.success).toBe(false);
      expectIssue(result, ['query', 'feature_ids']);
    });

    it('deve assumir defaults de page=1 e limit=12 quando omitidos', () => {
      const result = findVehicleSchema.safeParse({ query: {} });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.query.page).toBe(1);
      expect(result.data.query.limit).toBe(12);
    });

    it('deve rejeitar limit fora do conjunto permitido (12, 24, 36, 48)', () => {
      const result = findVehicleSchema.safeParse({
        query: { limit: '10' },
      });

      expect(result.success).toBe(false);
      expectIssue(result, ['query', 'limit']);
    });

    it('deve rejeitar plate_last_digit menor que 0 ou maior que 9', () => {
      const result = findVehicleSchema.safeParse({
        query: { plate_last_digit: '15' },
      });

      expect(result.success).toBe(false);
      expectIssue(result, ['query', 'plate_last_digit']);
    });
  });

  describe('compareVehiclesSchema', () => {
    it('deve aceitar query com 2 ou 3 UUIDs válidos separados por vírgula', () => {
      const result2 = compareVehiclesSchema.safeParse({
        query: { ids: `${VALID_UUID_FEATURE_1},${VALID_UUID_FEATURE_2}` },
      });
      const result3 = compareVehiclesSchema.safeParse({
        query: { ids: `${VALID_UUID_FEATURE_1},${VALID_UUID_FEATURE_2},${VALID_UUID_FEATURE_3}` },
      });

      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
    });

    it('deve rejeitar se houver menos de 2 UUIDs', () => {
      const result = compareVehiclesSchema.safeParse({
        query: { ids: VALID_UUID_FEATURE_1 },
      });

      expect(result.success).toBe(false);
      expectIssue(result, ['query', 'ids']);
    });

    it('deve rejeitar se houver mais de 3 UUIDs', () => {
      const result = compareVehiclesSchema.safeParse({
        query: {
          ids: `${VALID_UUID_FEATURE_1},${VALID_UUID_FEATURE_2},${VALID_UUID_FEATURE_3},${VALID_UUID_STORE}`,
        },
      });

      expect(result.success).toBe(false);
      expectIssue(result, ['query', 'ids']);
    });

    it('deve rejeitar se algum dos IDs não for um UUID válido', () => {
      const result = compareVehiclesSchema.safeParse({
        query: { ids: `${VALID_UUID_FEATURE_1},invalido` },
      });

      expect(result.success).toBe(false);
      expectIssue(result, ['query', 'ids']);
    });
  });

  describe('deleteVehicleSchema & findByIdVehicleSchema', () => {
    it('deve aceitar id válido nos params', () => {
      const findRes = findByIdVehicleSchema.safeParse({ params: { id: VALID_UUID_STORE } });
      const delRes = deleteVehicleSchema.safeParse({ params: { id: VALID_UUID_STORE } });

      expect(findRes.success).toBe(true);
      expect(delRes.success).toBe(true);
    });

    it('deve rejeitar id inválido nos params', () => {
      const result = deleteVehicleSchema.safeParse({ params: { id: '123' } });
      expect(result.success).toBe(false);
      expectIssue(result, ['params', 'id']);
    });
  });
});
