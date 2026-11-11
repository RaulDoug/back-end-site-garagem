import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import VehicleService from '#services/vehicle.service.js';
import {
  VehicleRepository,
  type Vehicle,
  type DetailedVehicle,
} from '#repositories/vehicle.repository.js';
import { sanitizeVehicleForRole } from '#utils/vehicle-sanitizer.util.js';
import { viewTracker } from '#utils/view-tracker.util.js';
import { NotFoundError, BadRequestError } from '#src/errors/app.error.js';

const mockVehicle: Vehicle = {
  id: '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
  store_id: '2b3c4d5e-6f7a-4b9c-8d1e-2f3a4b5c6d7e',
  registered_by_user_id: '3c4d5e6f-7a8b-4c0d-9e2f-3a4b5c6d7e8f',
  sold_by_user_id: null,
  model_id: '4d5e6f7a-8b9c-4d1e-8f3a-4b5c6d7e8f9a',
  promotion_id: null,
  sale_type: 'PROPRIO',
  title: 'Corolla XEi 2.0',
  description: 'Impecável',
  sale_price: 120000,
  purchase_price: 100000,
  owner_price: null,
  store_commission_rate: null,
  owner_name: 'Privado da Silva',
  owner_contact: '(37) 99999-8888',
  fipe_price: 118000,
  min_down_payment: 20000,
  max_installments: 48,
  manufacture_year: 2022,
  model_year: 2023,
  mileage: 30000,
  transmission: 'AUTOMATICO',
  color: 'Prata',
  category: 'SEDÃ',
  horsepower: 177,
  fuel_type: 'FLEX',
  steering: 'Elétrica',
  doors: 4,
  full_license_plate: 'BRA2E19',
  plate_last_digit: 9,
  status: 'ATIVO',
  reservation_expires_at: null,
  video_url: null,
  inspection_report_url: null,
  total_views: 10,
  sold_at: null,
  buyer_name: null,
  buyer_contact: null,
  website_lead_origin: null,
  created_at: new Date(),
  updated_at: null,
  deleted_at: null,
};

const mockDetailedVehicle: DetailedVehicle = {
  ...mockVehicle,
  brand: { id: '5e6f7a8b-9c0d-4e2f-9a4b-5c6d7e8f9a0b', name: 'Toyota' },
  model: { id: mockVehicle.model_id, name: 'Corolla' },
  features: [{ id: '6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c', name: 'Ar-condicionado' }],
  photos: [],
};

describe('VehicleService e Utilitários', () => {
  let vehicleRepository: VehicleRepository;
  let vehicleService: VehicleService;

  beforeEach(() => {
    vi.resetAllMocks();
    viewTracker.clear();

    vehicleRepository = {
      createWithFeatures: vi.fn(),
      updateWithFeatures: vi.fn(),
      findCatalog: vi.fn(),
      findDetailedById: vi.fn(),
      findByIds: vi.fn(),
      incrementViewMetrics: vi.fn(),
      findById: vi.fn(),
      findByPlate: vi.fn(),
      delete: vi.fn(),
    } as unknown as VehicleRepository;

    vehicleService = new VehicleService(vehicleRepository);
  });

  describe('RN003: Sanitização LGPD (sanitizeVehicleForRole)', () => {
    it('deve ocultar dados sensíveis quando perfil for PUBLICO ou deslogado', () => {
      const sanitized = sanitizeVehicleForRole(mockDetailedVehicle, 'PUBLICO');

      expect(sanitized).not.toHaveProperty('full_license_plate');
      expect(sanitized).not.toHaveProperty('purchase_price');
      expect(sanitized).not.toHaveProperty('owner_price');
      expect(sanitized).not.toHaveProperty('owner_name');
      expect(sanitized).not.toHaveProperty('owner_contact');
      expect(sanitized).not.toHaveProperty('store_commission_rate');

      // Campos que devem permanecer
      expect(sanitized.plate_last_digit).toBe(9);
      expect(sanitized.sale_price).toBe(120000);
      expect(sanitized.title).toBe('Corolla XEi 2.0');
    });

    it('deve ocultar dados sensíveis quando perfil for VISUALIZADOR', () => {
      const sanitized = sanitizeVehicleForRole(mockDetailedVehicle, 'VISUALIZADOR');

      expect(sanitized).not.toHaveProperty('full_license_plate');
      expect(sanitized).not.toHaveProperty('purchase_price');
      expect(sanitized).not.toHaveProperty('owner_price');
      expect(sanitized.plate_last_digit).toBe(9);
    });

    it('deve preservar todos os dados para perfil ADMIN e VENDEDOR', () => {
      const adminView = sanitizeVehicleForRole(mockDetailedVehicle, 'ADMIN');
      const sellerView = sanitizeVehicleForRole(mockDetailedVehicle, 'VENDEDOR');

      expect(adminView.full_license_plate).toBe('BRA2E19');
      expect(adminView.purchase_price).toBe(100000);
      expect(sellerView.full_license_plate).toBe('BRA2E19');
      expect(sellerView.owner_name).toBe('Privado da Silva');
    });
  });

  describe('Criação e atualização com extração automática de plate_last_digit', () => {
    it('deve extrair plate_last_digit da full_license_plate ao criar veículo', async () => {
      vi.mocked(vehicleRepository.createWithFeatures).mockResolvedValue(mockVehicle);

      const payload = {
        store_id: mockVehicle.store_id,
        registered_by_user_id: mockVehicle.registered_by_user_id,
        model_id: mockVehicle.model_id,
        title: mockVehicle.title,
        description: mockVehicle.description,
        sale_price: mockVehicle.sale_price,
        purchase_price: mockVehicle.purchase_price,
        manufacture_year: mockVehicle.manufacture_year,
        model_year: mockVehicle.model_year,
        mileage: mockVehicle.mileage,
        transmission: mockVehicle.transmission,
        color: mockVehicle.color,
        category: mockVehicle.category,
        fuel_type: mockVehicle.fuel_type,
        steering: mockVehicle.steering,
        doors: mockVehicle.doors,
        full_license_plate: 'ABC1D28',
      };

      await vehicleService.create(payload as unknown as Parameters<typeof vehicleService.create>[0], ['feat-1']);

      expect(vehicleRepository.createWithFeatures).toHaveBeenCalledWith(
        expect.objectContaining({
          full_license_plate: 'ABC1D28',
          plate_last_digit: 8,
        }),
        ['feat-1']
      );
    });

    it('deve recalcular plate_last_digit ao atualizar full_license_plate no update', async () => {
      vi.mocked(vehicleRepository.findById).mockResolvedValue(mockVehicle);
      vi.mocked(vehicleRepository.updateWithFeatures).mockResolvedValue(mockVehicle);

      await vehicleService.update(mockVehicle.id, { full_license_plate: 'XYZ9K45' }, ['feat-2']);

      expect(vehicleRepository.updateWithFeatures).toHaveBeenCalledWith(
        mockVehicle.id,
        expect.objectContaining({
          full_license_plate: 'XYZ9K45',
          plate_last_digit: 5,
        }),
        ['feat-2']
      );
    });

    it('deve lançar BadRequestError no update ao mudar para CONSIGNADO sem dados do proprietário', async () => {
      vi.mocked(vehicleRepository.findById).mockResolvedValue(mockVehicle);

      await expect(
        vehicleService.update(mockVehicle.id, { sale_type: 'CONSIGNADO' })
      ).rejects.toThrow(BadRequestError);

      expect(vehicleRepository.updateWithFeatures).not.toHaveBeenCalled();
    });

    it('deve ignorar include_deleted=true na busca pública (findPublic)', async () => {
      vi.mocked(vehicleRepository.findCatalog).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 12,
      });

      await vehicleService.findPublic({ include_deleted: 'true' });

      expect(vehicleRepository.findCatalog).toHaveBeenCalledWith(
        expect.objectContaining({
          publicOnly: true,
          include_deleted: false,
        })
      );
    });
  });

  describe('RN007: Anti-Fraude em Visualizações (ViewTracker + findByIdPublic)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('primeiro acesso deve incrementar métrica de visualização e refletir no total_views retornado', async () => {
      vi.mocked(vehicleRepository.findDetailedById).mockResolvedValue(mockDetailedVehicle);

      const res = await vehicleService.findByIdPublic(mockVehicle.id, '192.168.1.1', 'Mozilla/5.0');

      expect(vehicleRepository.incrementViewMetrics).not.toHaveBeenCalled();
      expect(viewTracker.getPendingViews(mockVehicle.id)).toBe(1);
      expect(res.total_views).toBe(mockDetailedVehicle.total_views + 1);
    });

    it('segundo acesso do mesmo IP e User-Agent após 10 minutos NÃO deve incrementar', async () => {
      vi.mocked(vehicleRepository.findDetailedById).mockResolvedValue(mockDetailedVehicle);

      await vehicleService.findByIdPublic(mockVehicle.id, '192.168.1.1', 'Mozilla/5.0');
      expect(viewTracker.getPendingViews(mockVehicle.id)).toBe(1);

      // Avança 10 minutos
      vi.advanceTimersByTime(10 * 60 * 1000);

      await vehicleService.findByIdPublic(mockVehicle.id, '192.168.1.1', 'Mozilla/5.0');
      expect(viewTracker.getPendingViews(mockVehicle.id)).toBe(1);
      expect(vehicleRepository.incrementViewMetrics).not.toHaveBeenCalled();
    });

    it('acesso após 31 minutos deve incrementar novamente', async () => {
      vi.mocked(vehicleRepository.findDetailedById).mockResolvedValue(mockDetailedVehicle);

      await vehicleService.findByIdPublic(mockVehicle.id, '192.168.1.1', 'Mozilla/5.0');
      expect(viewTracker.getPendingViews(mockVehicle.id)).toBe(1);

      // Avança 31 minutos
      vi.advanceTimersByTime(31 * 60 * 1000);

      await vehicleService.findByIdPublic(mockVehicle.id, '192.168.1.1', 'Mozilla/5.0');
      expect(viewTracker.getPendingViews(mockVehicle.id)).toBe(2);
      expect(vehicleRepository.incrementViewMetrics).not.toHaveBeenCalled();
    });

    it('findByIdAdmin NUNCA deve incrementar métrica de visualização pública', async () => {
      vi.mocked(vehicleRepository.findDetailedById).mockResolvedValue(mockDetailedVehicle);

      await vehicleService.findByIdAdmin(mockVehicle.id, 'ADMIN');

      expect(vehicleRepository.incrementViewMetrics).not.toHaveBeenCalled();
    });

    it('findByIdPublic deve lançar NotFoundError se veículo não for encontrado', async () => {
      vi.mocked(vehicleRepository.findDetailedById).mockResolvedValue(null);

      await expect(
        vehicleService.findByIdPublic('id-inexistente', '127.0.0.1', 'curl')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('comparePublic (UC02)', () => {
    it('deve retornar os veículos comparados sanitizados para perfil público', async () => {
      vi.mocked(vehicleRepository.findByIds).mockResolvedValue([
        mockDetailedVehicle,
        { ...mockDetailedVehicle, id: '2a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d' },
      ]);

      const result = await vehicleService.comparePublic([
        mockDetailedVehicle.id,
        '2a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
      ]);

      expect(result.length).toBe(2);
      expect(result[0]).not.toHaveProperty('full_license_plate');
      expect(result[0]).not.toHaveProperty('purchase_price');
    });

    it('deve lançar BadRequestError se quantidade de IDs for menor que 2 ou maior que 3', async () => {
      await expect(vehicleService.comparePublic(['id-1'])).rejects.toThrow(BadRequestError);
      await expect(
        vehicleService.comparePublic(['id-1', 'id-2', 'id-3', 'id-4'])
      ).rejects.toThrow(BadRequestError);
    });
  });
});
