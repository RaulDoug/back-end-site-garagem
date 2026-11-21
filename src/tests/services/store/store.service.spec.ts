import { describe, it, expect, vi, beforeEach } from 'vitest';
import StoreService from '#services/store.service.js';
import { StoreRepository, type Store } from '#repositories/store.repository.js';
import { TenantRepository, type Tenant } from '#repositories/tenant.repository.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

const mockStore: Store = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  tenant_id: 'tenant-123',
  name: 'Loja Exemplo',
  phone: '(37) 98888-7777',
  cnpj: '12345678000195',
  zip_code: '35500000',
  street: 'Rua Central',
  number: '100',
  neighborhood: 'Centro',
  city: 'Divinópolis',
  state: 'MG',
  complement: null,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
};

const mockTenant: Tenant = {
  id: 'tenant-123',
  corporate_name: 'Holding Exemplo Ltda',
  trade_name: 'Garagem Exemplo',
  cnpj: '12345678000195',
  is_active: true,
  created_at: new Date(),
  deleted_at: null,
};

const storePayload = {
  name: 'Loja Exemplo',
  phone: '(37) 98888-7777',
  cnpj: '12345678000195',
  zip_code: '35500000',
  street: 'Rua Central',
  number: '100',
  neighborhood: 'Centro',
  city: 'Divinópolis',
  state: 'MG',
};

describe('StoreService', () => {
  let storeRepository: StoreRepository;
  let tenantRepository: TenantRepository;
  let storeService: StoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    storeRepository = {
      findById: vi.fn(),
      findByCNPJ: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      find: vi.fn(),
      findByIdAndTenant: vi.fn(),
      hasActiveDependencies: vi.fn().mockResolvedValue(false),
    } as unknown as StoreRepository;

    tenantRepository = {
      findById: vi.fn().mockResolvedValue(mockTenant),
    } as unknown as TenantRepository;

    storeService = new StoreService(storeRepository, tenantRepository);
  });

  describe('create', () => {
    it('deve criar uma nova loja com sucesso quando o CNPJ for inédito e tenantId for informado', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(null);
      vi.mocked(storeRepository.create).mockResolvedValue(mockStore);

      const result = await storeService.create(storePayload, 'tenant-123');

      expect(storeRepository.findByCNPJ).toHaveBeenCalledWith('12345678000195');
      expect(storeRepository.create).toHaveBeenCalledWith({
        ...storePayload,
        tenant_id: 'tenant-123',
      });
      expect(result).toEqual(mockStore);
    });

    it('deve lançar AppError (401) se tenantId não for informado', async () => {
      await expect(
        storeService.create(storePayload, '')
      ).rejects.toThrow(new AppError('Tenant não identificado', 401));

      expect(storeRepository.create).not.toHaveBeenCalled();
    });

    it('deve lançar AppError com status 409 se o CNPJ já estiver cadastrado', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(mockStore);

      await expect(
        storeService.create(
          {
            ...storePayload,
            name: 'Loja Clonada',
          },
          'tenant-123'
        )
      ).rejects.toThrow(new AppError('CNPJ já cadastrado', 409));

      expect(storeRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('find', () => {
    it('deve filtrar por tenant_id ao listar lojas', async () => {
      vi.mocked(storeRepository.find).mockResolvedValue([mockStore]);

      const result = await storeService.find({ filters: [] }, 'tenant-123');

      expect(storeRepository.find).toHaveBeenCalledWith({ filters: [] }, 'tenant-123');
      expect(result).toEqual([mockStore]);
    });
  });

  describe('findById', () => {
    it('deve retornar a loja quando o ID existir para o tenantId', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);

      const result = await storeService.findById(mockStore.id, 'tenant-123');

      expect(storeRepository.findById).toHaveBeenCalledWith(mockStore.id, 'tenant-123');
      expect(result).toEqual(mockStore);
    });

    it('deve lançar NotFoundError (404) quando o ID não for encontrado no tenant', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(null);

      await expect(storeService.findById('id-inexistente', 'tenant-123')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('findPublicById', () => {
    it('deve retornar dados públicos da loja quando o ID existir', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);

      const result = await storeService.findPublicById(mockStore.id);

      expect(storeRepository.findById).toHaveBeenCalledWith(mockStore.id);
      expect(result).toEqual(mockStore);
    });

    it('deve lançar NotFoundError (404) quando a loja pública não existir', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(null);

      await expect(storeService.findPublicById('id-inexistente')).rejects.toThrow(
        NotFoundError
      );
    });

    it('deve lançar NotFoundError (404) quando a loja pública estiver inativa (is_active: false)', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue({
        ...mockStore,
        is_active: false,
      });

      await expect(storeService.findPublicById(mockStore.id)).rejects.toThrow(
        NotFoundError
      );
    });

    it('deve lançar NotFoundError (404) quando a loja pública estiver soft-deleted (deleted_at preenchido)', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue({
        ...mockStore,
        deleted_at: new Date(),
      });

      await expect(storeService.findPublicById(mockStore.id)).rejects.toThrow(
        NotFoundError
      );
    });

    it('deve lançar NotFoundError (404) quando o tenant da loja não existir ou estiver inativo (is_active: false)', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);
      vi.mocked(tenantRepository.findById).mockResolvedValue({
        ...mockTenant,
        is_active: false,
      });

      await expect(storeService.findPublicById(mockStore.id)).rejects.toThrow(
        NotFoundError
      );

      vi.mocked(tenantRepository.findById).mockResolvedValue(null);

      await expect(storeService.findPublicById(mockStore.id)).rejects.toThrow(
        NotFoundError
      );
    });

    it('deve lançar NotFoundError (404) quando o tenant da loja estiver soft-deleted (deleted_at preenchido)', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);
      vi.mocked(tenantRepository.findById).mockResolvedValue({
        ...mockTenant,
        deleted_at: new Date(),
      });

      await expect(storeService.findPublicById(mockStore.id)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('findByCNPJ', () => {
    it('deve retornar a loja quando o CNPJ for encontrado', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(mockStore);

      const result = await storeService.findByCNPJ(mockStore.cnpj, 'tenant-123');

      expect(storeRepository.findByCNPJ).toHaveBeenCalledWith(mockStore.cnpj);
      expect(result).toEqual(mockStore);
    });

    it('deve lançar NotFoundError (404) quando o CNPJ não for encontrado', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(null);

      await expect(storeService.findByCNPJ('99999999000199', 'tenant-123')).rejects.toThrow(
        NotFoundError
      );
    });

    it('deve lançar NotFoundError (404) quando a loja encontrada pelo CNPJ pertencer a outro tenant', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue({
        ...mockStore,
        tenant_id: 'outro-tenant',
      });

      await expect(
        storeService.findByCNPJ(mockStore.cnpj, 'tenant-123')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('deve atualizar dados da loja sem alterar CNPJ', async () => {
      const updatedStore = { ...mockStore, name: 'Novo Nome' };
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.update).mockResolvedValue(updatedStore);

      const result = await storeService.update(mockStore.id, {
        name: 'Novo Nome',
      }, 'tenant-123');

      expect(storeRepository.findById).toHaveBeenCalledWith(mockStore.id, 'tenant-123');
      expect(storeRepository.findByCNPJ).not.toHaveBeenCalled();
      expect(storeRepository.update).toHaveBeenCalledWith(
        mockStore.id,
        { name: 'Novo Nome' },
        'tenant-123'
      );
      expect(result).toEqual(updatedStore);
    });

    it('deve permitir atualizar CNPJ quando o novo CNPJ não estiver em uso', async () => {
      const newCnpj = '98765432000110';
      const updatedStore = { ...mockStore, cnpj: newCnpj };

      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(null);
      vi.mocked(storeRepository.update).mockResolvedValue(updatedStore);

      const result = await storeService.update(mockStore.id, { cnpj: newCnpj }, 'tenant-123');

      expect(storeRepository.findByCNPJ).toHaveBeenCalledWith(newCnpj);
      expect(storeRepository.update).toHaveBeenCalledWith(
        mockStore.id,
        { cnpj: newCnpj },
        'tenant-123'
      );
      expect(result).toEqual(updatedStore);
    });

    it('deve permitir atualizar mantendo o mesmo CNPJ da própria loja', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.update).mockResolvedValue(mockStore);

      const result = await storeService.update(mockStore.id, { cnpj: mockStore.cnpj }, 'tenant-123');

      expect(storeRepository.update).toHaveBeenCalledWith(
        mockStore.id,
        { cnpj: mockStore.cnpj },
        'tenant-123'
      );
      expect(result).toEqual(mockStore);
    });

    it('deve lançar AppError (409) se o novo CNPJ pertencer a outra loja', async () => {
      const otherStore: Store = {
        ...mockStore,
        id: 'outra-loja-uuid',
        cnpj: '98765432000110',
      };

      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(otherStore);

      await expect(
        storeService.update(mockStore.id, { cnpj: otherStore.cnpj }, 'tenant-123')
      ).rejects.toThrow(new AppError('CNPJ já em uso por outra loja', 409));

      expect(storeRepository.update).not.toHaveBeenCalled();
    });

    it('deve lançar NotFoundError (404) se a loja a ser atualizada não existir no tenant', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(null);

      await expect(
        storeService.update('id-inexistente', { name: 'Loja' }, 'tenant-123')
      ).rejects.toThrow(NotFoundError);
    });

    it('deve lançar AppError (401) se tenantId não for informado ao atualizar', async () => {
      await expect(
        storeService.update(mockStore.id, { name: 'Novo Nome' }, '')
      ).rejects.toThrow(new AppError('Tenant não identificado', 401));

      expect(storeRepository.update).not.toHaveBeenCalled();
    });

    it('deve higienizar CNPJ com máscara antes de persistir no repositório e comparar IDs de forma case-insensitive', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.update).mockResolvedValue(mockStore);

      const result = await storeService.update(
        mockStore.id.toUpperCase(),
        { cnpj: '12.345.678/0001-95' },
        'tenant-123'
      );

      expect(storeRepository.findByCNPJ).toHaveBeenCalledWith('12345678000195');
      expect(storeRepository.update).toHaveBeenCalledWith(
        mockStore.id.toUpperCase(),
        { cnpj: '12345678000195' },
        'tenant-123'
      );
      expect(result).toEqual(mockStore);
    });
  });

  describe('delete', () => {
    it('deve lançar AppError (401) se tenantId não for informado ao deletar', async () => {
      await expect(
        storeService.delete(mockStore.id, '')
      ).rejects.toThrow(new AppError('Tenant não identificado', 401));

      expect(storeRepository.delete).not.toHaveBeenCalled();
    });

    it('deve lançar AppError (409) ao tentar excluir a própria filial vinculada ao usuário logado', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);

      await expect(
        storeService.delete(mockStore.id, 'tenant-123', mockStore.id.toUpperCase())
      ).rejects.toThrow(
        new AppError('Não é permitido excluir a própria filial vinculada ao usuário', 409)
      );

      expect(storeRepository.delete).not.toHaveBeenCalled();
    });

    it('deve lançar AppError (409) ao tentar excluir filial que possui usuários ou veículos ativos vinculados', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.hasActiveDependencies).mockResolvedValue(true);

      await expect(
        storeService.delete(mockStore.id, 'tenant-123', null)
      ).rejects.toThrow(
        new AppError('Não é possível excluir loja com usuários ou veículos ativos vinculados', 409)
      );

      expect(storeRepository.delete).not.toHaveBeenCalled();
    });
    it('deve remover a loja com sucesso dentro do tenant', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.delete).mockResolvedValue(mockStore);

      const result = await storeService.delete(mockStore.id, 'tenant-123');

      expect(storeRepository.findById).toHaveBeenCalledWith(mockStore.id, 'tenant-123');
      expect(storeRepository.delete).toHaveBeenCalledWith(mockStore.id, 'tenant-123');
      expect(result).toEqual(mockStore);
    });

    it('deve lançar NotFoundError (404) ao tentar deletar loja inexistente no tenant', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(null);

      await expect(storeService.delete('id-inexistente', 'tenant-123')).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
