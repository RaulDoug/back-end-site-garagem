import { describe, expect, it } from 'vitest';
import {
  createTenantSchema,
  updateTenantSchema,
  onboardTenantSchema,
  validateCNPJ,
  validateCPF,
} from '#schemas/tenant.schema.js';

describe('Tenant Schemas & Validators', () => {
  const VALID_CNPJ = '12.345.678/0001-95';
  const VALID_CNPJ_RAW = '12345678000195';
  const INVALID_CNPJ = '12.345.678/0001-00';
  const VALID_CPF = '123.456.789-09';
  const VALID_CPF_RAW = '12345678909';
  const INVALID_CPF = '123.456.789-00';

  describe('validateCNPJ', () => {
    it('deve validar CNPJ com máscara e sem máscara', () => {
      expect(validateCNPJ(VALID_CNPJ)).toBe(true);
      expect(validateCNPJ(VALID_CNPJ_RAW)).toBe(true);
      expect(validateCNPJ('45.723.174/0001-10')).toBe(true);
    });

    it('deve rejeitar CNPJ com dígitos verificadores incorretos', () => {
      expect(validateCNPJ(INVALID_CNPJ)).toBe(false);
    });

    it('deve rejeitar CNPJs com todos os dígitos iguais ou comprimento inválido', () => {
      expect(validateCNPJ('00.000.000/0000-00')).toBe(false);
      expect(validateCNPJ('11.111.111/1111-11')).toBe(false);
      expect(validateCNPJ('12345')).toBe(false);
    });
  });

  describe('validateCPF', () => {
    it('deve validar CPF com máscara e sem máscara', () => {
      expect(validateCPF(VALID_CPF)).toBe(true);
      expect(validateCPF(VALID_CPF_RAW)).toBe(true);
    });

    it('deve rejeitar CPF inválido ou com dígitos repetidos', () => {
      expect(validateCPF(INVALID_CPF)).toBe(false);
      expect(validateCPF('111.111.111-11')).toBe(false);
      expect(validateCPF('123')).toBe(false);
    });
  });

  describe('createTenantSchema', () => {
    it('deve aprovar payload válido de criação de tenant', () => {
      const result = createTenantSchema.safeParse({
        corporate_name: 'Minha Empresa Ltda',
        trade_name: 'Minha Empresa',
        cnpj: VALID_CNPJ,
        is_active: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.corporate_name).toBe('Minha Empresa Ltda');
        expect(result.data.is_active).toBe(true);
      }
    });

    it('deve rejeitar quando CNPJ for inválido', () => {
      const result = createTenantSchema.safeParse({
        corporate_name: 'Minha Empresa Ltda',
        trade_name: 'Minha Empresa',
        cnpj: INVALID_CNPJ,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(i => i.path.includes('cnpj'));
        expect(issue?.message).toContain('CNPJ inválido');
      }
    });

    it('deve rejeitar quando corporate_name ou trade_name tiverem menos de 2 caracteres', () => {
      const result = createTenantSchema.safeParse({
        corporate_name: 'A',
        trade_name: ' ',
        cnpj: VALID_CNPJ,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('updateTenantSchema', () => {
    it('deve permitir atualização parcial de campos', () => {
      const result = updateTenantSchema.safeParse({
        trade_name: 'Novo Nome Fantasia',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('onboardTenantSchema', () => {
    const validOnboardPayload = {
      tenant: {
        corporate_name: 'Garagem Central Ltda',
        trade_name: 'Garagem Central',
        cnpj: VALID_CNPJ,
      },
      store: {
        name: 'Matriz Garagem Central',
        phone: '(37) 98888-7777',
        cnpj: '45.723.174/0001-10',
        zip_code: '35500-000',
        street: 'Av. Brasil',
        number: '100',
        neighborhood: 'Centro',
        city: 'Divinópolis',
        state: 'MG',
      },
      admin: {
        name: 'Administrador Geral',
        email: 'admin@garagemcentral.com',
        password: 'Password123!',
        phone: '(37) 99999-8888',
        cpf: VALID_CPF,
      },
    };

    it('deve validar com sucesso um payload completo de onboarding', () => {
      const result = onboardTenantSchema.safeParse(validOnboardPayload);
      expect(result.success).toBe(true);
    });

    it('deve falhar se o CNPJ do tenant for inválido', () => {
      const result = onboardTenantSchema.safeParse({
        ...validOnboardPayload,
        tenant: {
          ...validOnboardPayload.tenant,
          cnpj: INVALID_CNPJ,
        },
      });

      expect(result.success).toBe(false);
    });

    it('deve falhar se o CPF do admin for inválido', () => {
      const result = onboardTenantSchema.safeParse({
        ...validOnboardPayload,
        admin: {
          ...validOnboardPayload.admin,
          cpf: INVALID_CPF,
        },
      });

      expect(result.success).toBe(false);
    });

    it('deve falhar se a senha do admin for menor que 8 caracteres', () => {
      const result = onboardTenantSchema.safeParse({
        ...validOnboardPayload,
        admin: {
          ...validOnboardPayload.admin,
          password: 'short',
        },
      });

      expect(result.success).toBe(false);
    });
  });
});
