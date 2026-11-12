import { describe, it, expect, vi, beforeEach } from 'vitest';
import TenantService from '#services/tenant.service.js';
import { TenantRepository, type Tenant } from '#repositories/tenant.repository.js';
import { StoreRepository, type Store } from '#repositories/store.repository.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

const mockTenant: Tenant = {
  id: 'tenant-uuid-1',
  corporate_name: 'Empresa Teste Ltda',
  trade_name: 'Empresa Teste',
  cnpj: '12.345.678/0001-95',
  is_active: true,
  created_at: new Date(),
  deleted_at: null,
};

const mockStore: Store = {
  id: 'store-uuid-1',
  tenant_id: 'tenant-uuid-1',
  name: 'Loja Matriz',
  phone: '(37) 98888-7777',
  cnpj: '45.723.174/0001-10',
  zip_code: '35500000',
  street: 'Rua Central',
  number: '100',
  neighborhood: 'Centro',
  city: 'Divinópolis',
  state: 'MG',
  complement: null,
  is_active: true,
  created_at: new Date(),
  deleted_at: null,
};

const mockAdmin = {
  id: 'admin-uuid-1',
  tenant_id: 'tenant-uuid-1',
  store_id: 'store-uuid-1',
  name: 'Admin Master',
  email: 'admin@empresa.com',
  phone: '(37) 99999-8888',
  role: 'ADMIN' as const,
  commission_rates: null,
  is_active: true,
  created_at: new Date(),
  deleted_at: null,
};

const validOnboardPayload = {
  tenant: {
    corporate_name: 'Empresa Teste Ltda',
    trade_name: 'Empresa Teste',
    cnpj: '12.345.678/0001-95',
  },
  store: {
    name: 'Loja Matriz',
    phone: '(37) 98888-7777',
    cnpj: '45.723.174/0001-10',
    zip_code: '35500-000',
    street: 'Rua Central',
    number: '100',
    neighborhood: 'Centro',
    city: 'Divinópolis',
    state: 'MG',
  },
  admin: {
    name: 'Admin Master',
    email: 'admin@empresa.com',
    password: 'Password123!',
    phone: '(37) 99999-8888',
    cpf: '123.456.789-09',
  },
};

describe('TenantService', () => {
  let tenantRepository: TenantRepository;
  let storeRepository: StoreRepository;
  let tenantService: TenantService;

  beforeEach(() => {
    vi.resetAllMocks();

    tenantRepository = {
      findById: vi.fn(),
      findByCNPJ: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      find: vi.fn(),
      onboardTenant: vi.fn(),
    } as unknown as TenantRepository;

    storeRepository = {
      findByCNPJ: vi.fn(),
      findById: vi.fn(),
    } as unknown as StoreRepository;

    tenantService = new TenantService(tenantRepository, storeRepository);
  });

  describe('onboard', () => {
    it('deve realizar onboarding com sucesso e retornar token', async () => {
      vi.mocked(tenantRepository.findByCNPJ).mockResolvedValue(null);
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(null);
      vi.mocked(tenantRepository.onboardTenant).mockResolvedValue({
        tenant: mockTenant,
        store: mockStore,
        admin: mockAdmin,
      });

      const result = await tenantService.onboard(validOnboardPayload);

      expect(tenantRepository.findByCNPJ).toHaveBeenCalledWith('12.345.678/0001-95');
      expect(storeRepository.findByCNPJ).toHaveBeenCalledWith('45723174000110');
      expect(tenantRepository.onboardTenant).toHaveBeenCalled();
      expect(result).toHaveProperty('tenant');
      expect(result).toHaveProperty('store');
      expect(result).toHaveProperty('admin');
      expect(result).toHaveProperty('token');
      expect(typeof result.token).toBe('string');
    });

    it('deve lançar AppError 409 se o CNPJ da empresa já estiver em uso', async () => {
      vi.mocked(tenantRepository.findByCNPJ).mockResolvedValue(mockTenant);

      await expect(tenantService.onboard(validOnboardPayload)).rejects.toThrow(
        new AppError('CNPJ da empresa já está em uso', 409)
      );
    });

    it('deve lançar AppError 409 se o CNPJ da loja já estiver em uso', async () => {
      vi.mocked(tenantRepository.findByCNPJ).mockResolvedValue(null);
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(mockStore);

      await expect(tenantService.onboard(validOnboardPayload)).rejects.toThrow(
        new AppError('CNPJ da loja já está em uso', 409)
      );
    });
  });

  describe('getById', () => {
    it('deve retornar o tenant quando existir', async () => {
      vi.mocked(tenantRepository.findById).mockResolvedValue(mockTenant);

      const result = await tenantService.getById('tenant-uuid-1');
      expect(result).toEqual(mockTenant);
    });

    it('deve lançar NotFoundError se tenant não existir', async () => {
      vi.mocked(tenantRepository.findById).mockResolvedValue(null);

      await expect(tenantService.getById('inexistente')).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('deve atualizar o tenant com sucesso', async () => {
      vi.mocked(tenantRepository.findById).mockResolvedValue(mockTenant);
      vi.mocked(tenantRepository.update).mockResolvedValue({
        ...mockTenant,
        trade_name: 'Novo Nome',
      });

      const result = await tenantService.update('tenant-uuid-1', {
        trade_name: 'Novo Nome',
      });

      expect(result.trade_name).toBe('Novo Nome');
    });

    it('deve lançar AppError 409 se alterar para CNPJ já em uso por outro tenant', async () => {
      vi.mocked(tenantRepository.findById).mockResolvedValue(mockTenant);
      vi.mocked(tenantRepository.findByCNPJ).mockResolvedValue({
        ...mockTenant,
        id: 'outro-tenant',
      });

      await expect(
        tenantService.update('tenant-uuid-1', {
          cnpj: '45.723.174/0001-10',
        })
      ).rejects.toThrow(new AppError('CNPJ da empresa já está em uso', 409));
    });
  });
});
