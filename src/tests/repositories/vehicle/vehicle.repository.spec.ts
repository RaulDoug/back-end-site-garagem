import 'dotenv/config';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import pool from '#src/config/database.js';
import {
  VehicleRepository,
  type CreateVehicleData,
} from '#repositories/vehicle.repository.js';
import { StoreRepository } from '#repositories/store.repository.js';
import { BrandRepository } from '#repositories/brand.repository.js';
import { ModelRepository } from '#repositories/model.repository.js';
import { FeatureRepository } from '#repositories/feature.repository.js';

const vehicleRepository = new VehicleRepository();
const storeRepository = new StoreRepository();
const brandRepository = new BrandRepository();
const modelRepository = new ModelRepository();
const featureRepository = new FeatureRepository();

const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const createdVehicleIds = new Set<string>();
const createdStoreIds = new Set<string>();
const createdBrandIds = new Set<string>();
const createdModelIds = new Set<string>();
const createdFeatureIds = new Set<string>();
let sequence = 0;

let testUserId: string;

const createHelperStore = async () => {
  const cnpj = `${RUN_ID.replace(/\D/g, '').padEnd(10, '0').slice(0, 10)}${String(++sequence).padStart(4, '0')}`.slice(0, 14);
  const store = await storeRepository.create({
    name: `Loja_Repo_${RUN_ID}_${sequence}`,
    phone: '(37) 98888-7777',
    cnpj,
    zip_code: '35500000',
    street: 'Av. Teste',
    number: '100',
    neighborhood: 'Centro',
    city: 'Divinópolis',
    state: 'MG',
  });
  createdStoreIds.add(store.id);
  return store;
};

const createHelperBrandAndModel = async () => {
  const brand = await brandRepository.create({
    name: `Marca_${RUN_ID}_${++sequence}`,
  });
  createdBrandIds.add(brand.id);

  const model = await modelRepository.create({
    brand_id: brand.id,
    name: `Modelo_${RUN_ID}_${sequence}`,
  });
  createdModelIds.add(model.id);

  return { brand, model };
};

const createHelperFeature = async (name: string) => {
  const feature = await featureRepository.create({
    name: `${name}_${RUN_ID}_${++sequence}`,
  });
  createdFeatureIds.add(feature.id);
  return feature;
};

const uniquePlate = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l1 = letters[Math.floor(Math.random() * 26)];
  const l2 = letters[Math.floor(Math.random() * 26)];
  const l3 = letters[Math.floor(Math.random() * 26)];
  const l4 = letters[Math.floor(Math.random() * 26)];
  const d1 = Math.floor(Math.random() * 10);
  const d2 = Math.floor(Math.random() * 10);
  const d3 = Math.floor(Math.random() * 10);
  return `${l1}${l2}${l3}${d1}${l4}${d2}${d3}`;
};

const makeVehicleData = (
  storeId: string,
  modelId: string,
  overrides: Partial<CreateVehicleData> = {}
): CreateVehicleData => {
  const plate = overrides.full_license_plate || uniquePlate();
  const lastDigit = Number(plate.slice(-1)) || 0;

  return {
    store_id: storeId,
    registered_by_user_id: testUserId,
    model_id: modelId,
    sale_type: 'PROPRIO',
    title: `Veículo Teste ${RUN_ID} ${++sequence}`,
    description: 'Descrição de teste com histórico completo',
    sale_price: 95000,
    purchase_price: 80000,
    owner_price: null,
    store_commission_rate: null,
    owner_name: null,
    owner_contact: null,
    manufacture_year: 2021,
    model_year: 2022,
    mileage: 40000,
    transmission: 'AUTOMATICO',
    color: 'Branco',
    category: 'SEDÃ',
    fuel_type: 'FLEX',
    steering: 'Elétrica',
    doors: 4,
    full_license_plate: plate,
    plate_last_digit: lastDigit,
    status: 'ATIVO',
    ...overrides,
  };
};

describe('VehicleRepository - integração com PostgreSQL', () => {
  beforeAll(async () => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes de integração do repository exigem DB_NAME terminando em _test.'
      );
    }

    testUserId = '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b';
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, phone, role, is_active)
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', true)
       ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, is_active = TRUE;`,
      [
        testUserId,
        'Admin Repo Veiculo',
        'admin.vehicle.repo@teste.com',
        '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        '(37) 99999-0000',
      ]
    );
  });

  afterEach(async () => {
    if (createdVehicleIds.size > 0) {
      await pool.query('DELETE FROM vehicles WHERE id = ANY($1::uuid[])', [
        Array.from(createdVehicleIds),
      ]);
      createdVehicleIds.clear();
    }
    if (createdFeatureIds.size > 0) {
      await pool.query('DELETE FROM features WHERE id = ANY($1::uuid[])', [
        Array.from(createdFeatureIds),
      ]);
      createdFeatureIds.clear();
    }
    if (createdModelIds.size > 0) {
      await pool.query('DELETE FROM models WHERE id = ANY($1::uuid[])', [
        Array.from(createdModelIds),
      ]);
      createdModelIds.clear();
    }
    if (createdBrandIds.size > 0) {
      await pool.query('DELETE FROM brands WHERE id = ANY($1::uuid[])', [
        Array.from(createdBrandIds),
      ]);
      createdBrandIds.clear();
    }
    if (createdStoreIds.size > 0) {
      await pool.query('DELETE FROM stores WHERE id = ANY($1::uuid[])', [
        Array.from(createdStoreIds),
      ]);
      createdStoreIds.clear();
    }
  });

  describe('createWithFeatures (Transacional)', () => {
    it('deve criar veículo PROPRIO e vincular opcionais em vehicle_features em uma transação', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();
      const feat1 = await createHelperFeature('Ar');
      const feat2 = await createHelperFeature('Teto');

      const data = makeVehicleData(store.id, model.id);
      const vehicle = await vehicleRepository.createWithFeatures(data, [feat1.id, feat2.id]);
      createdVehicleIds.add(vehicle.id);

      expect(vehicle.id).toBeDefined();
      expect(vehicle.sale_type).toBe('PROPRIO');
      expect(Number(vehicle.purchase_price)).toBe(80000);

      const vfRows = await pool.query(
        'SELECT feature_id FROM vehicle_features WHERE vehicle_id = $1 ORDER BY feature_id',
        [vehicle.id]
      );
      const ids = vfRows.rows.map((r) => r.feature_id);
      expect(ids).toContain(feat1.id);
      expect(ids).toContain(feat2.id);
    });

    it('deve criar veículo CONSIGNADO com purchase_price nulo e dados do dono', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();

      const data = makeVehicleData(store.id, model.id, {
        sale_type: 'CONSIGNADO',
        purchase_price: null,
        owner_name: 'Antônio Prado',
        owner_contact: '(37) 99999-5555',
        owner_price: 90000,
        store_commission_rate: 6.0,
      });

      const vehicle = await vehicleRepository.createWithFeatures(data, []);
      createdVehicleIds.add(vehicle.id);

      expect(vehicle.id).toBeDefined();
      expect(vehicle.sale_type).toBe('CONSIGNADO');
      expect(vehicle.purchase_price).toBeNull();
      expect(vehicle.owner_name).toBe('Antônio Prado');
      expect(Number(vehicle.owner_price)).toBe(90000);
    });

    it('deve fazer rollback completo se um feature_id inválido for enviado', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();
      const uuidInexistente = '00000000-0000-4000-8000-000000000000';

      const plate = uniquePlate();
      const data = makeVehicleData(store.id, model.id, { full_license_plate: plate });

      await expect(
        vehicleRepository.createWithFeatures(data, [uuidInexistente])
      ).rejects.toThrow();

      // Confirma que o rollback cancelou a inserção do carro na tabela vehicles
      const checkVehicle = await pool.query(
        'SELECT * FROM vehicles WHERE full_license_plate = $1',
        [plate]
      );
      expect(checkVehicle.rows.length).toBe(0);
    });
  });

  describe('updateWithFeatures', () => {
    it('deve atualizar dados do veículo e substituir opcionais anteriores', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();
      const feat1 = await createHelperFeature('Feat1');
      const feat2 = await createHelperFeature('Feat2');
      const feat3 = await createHelperFeature('Feat3');

      const vehicle = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id),
        [feat1.id, feat2.id]
      );
      createdVehicleIds.add(vehicle.id);

      const updated = await vehicleRepository.updateWithFeatures(
        vehicle.id,
        { sale_price: 99000 },
        [feat3.id]
      );

      expect(Number(updated?.sale_price)).toBe(99000);

      const vfRows = await pool.query(
        'SELECT feature_id FROM vehicle_features WHERE vehicle_id = $1',
        [vehicle.id]
      );
      expect(vfRows.rows.map((r) => r.feature_id)).toEqual([feat3.id]);
    });

    it('deve retornar null ao tentar atualizar um veículo já deletado (soft delete)', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();

      const vehicle = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id),
        []
      );
      createdVehicleIds.add(vehicle.id);

      await vehicleRepository.delete(vehicle.id);

      const updated = await vehicleRepository.updateWithFeatures(
        vehicle.id,
        { sale_price: 85000 }
      );
      expect(updated).toBeNull();
    });
  });

  describe('findCatalog com regras RN001 (Flex) e RN002 (Visibilidade)', () => {
    it('RN001: filtrar por GASOLINA deve retornar veículos GASOLINA e veículos FLEX', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();

      const carGasolina = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { fuel_type: 'GASOLINA' }),
        []
      );
      const carFlex = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { fuel_type: 'FLEX' }),
        []
      );
      const carDiesel = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { fuel_type: 'DIESEL' }),
        []
      );
      createdVehicleIds.add(carGasolina.id);
      createdVehicleIds.add(carFlex.id);
      createdVehicleIds.add(carDiesel.id);

      const result = await vehicleRepository.findCatalog({
        fuel_type: 'GASOLINA',
        publicOnly: true,
      });

      const ids = result.items.map((i) => i.id);
      expect(ids).toContain(carGasolina.id);
      expect(ids).toContain(carFlex.id);
      expect(ids).not.toContain(carDiesel.id);
    });

    it('RN001: filtrar por ALCOOL deve retornar veículos ALCOOL e veículos FLEX', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();

      const carAlcool = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { fuel_type: 'ALCOOL' }),
        []
      );
      const carFlex = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { fuel_type: 'FLEX' }),
        []
      );
      const carGasolina = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { fuel_type: 'GASOLINA' }),
        []
      );
      createdVehicleIds.add(carAlcool.id);
      createdVehicleIds.add(carFlex.id);
      createdVehicleIds.add(carGasolina.id);

      const result = await vehicleRepository.findCatalog({
        fuel_type: 'ALCOOL',
        publicOnly: true,
      });

      const ids = result.items.map((i) => i.id);
      expect(ids).toContain(carAlcool.id);
      expect(ids).toContain(carFlex.id);
      expect(ids).not.toContain(carGasolina.id);
    });

    it('RN002: vitrine pública (publicOnly: true) deve retornar apenas ATIVO e RESERVADO, enquanto publicOnly: false retorna todos', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();

      const carAtivo = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { status: 'ATIVO' }),
        []
      );
      const carReservado = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { status: 'RESERVADO' }),
        []
      );
      const carNegociacao = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { status: 'EM_NEGOCIACAO' }),
        []
      );
      const carVendido = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { status: 'VENDIDO' }),
        []
      );
      const carInativo = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { status: 'INATIVO' }),
        []
      );
      createdVehicleIds.add(carAtivo.id);
      createdVehicleIds.add(carReservado.id);
      createdVehicleIds.add(carNegociacao.id);
      createdVehicleIds.add(carVendido.id);
      createdVehicleIds.add(carInativo.id);

      const resultPublic = await vehicleRepository.findCatalog({ publicOnly: true, limit: 48 });
      const publicIds = resultPublic.items.map((i) => i.id);
      expect(publicIds).toContain(carAtivo.id);
      expect(publicIds).toContain(carReservado.id);
      expect(publicIds).not.toContain(carNegociacao.id);
      expect(publicIds).not.toContain(carVendido.id);
      expect(publicIds).not.toContain(carInativo.id);

      const resultAdmin = await vehicleRepository.findCatalog({ publicOnly: false, limit: 48 });
      const adminIds = resultAdmin.items.map((i) => i.id);
      expect(adminIds).toContain(carAtivo.id);
      expect(adminIds).toContain(carReservado.id);
      expect(adminIds).toContain(carNegociacao.id);
      expect(adminIds).toContain(carVendido.id);
      expect(adminIds).toContain(carInativo.id);
    });

    it('deve filtrar cumulativamente por múltiplos opcionais (feature_ids) e faixas (brand_id, min_price, max_price, plate_last_digit)', async () => {
      const store = await createHelperStore();
      const { brand, model } = await createHelperBrandAndModel();
      const featA = await createHelperFeature('GPS');
      const featB = await createHelperFeature('Couro');

      const plateMatch = `${uniquePlate().slice(0, 6)}7`;
      const plateOther = `${uniquePlate().slice(0, 6)}3`;

      const carCompleto = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, {
          sale_price: 120000,
          full_license_plate: plateMatch,
          plate_last_digit: 7,
        }),
        [featA.id, featB.id]
      );
      const carParcial = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, {
          sale_price: 120000,
          full_license_plate: plateOther,
          plate_last_digit: 3,
        }),
        [featA.id]
      );
      createdVehicleIds.add(carCompleto.id);
      createdVehicleIds.add(carParcial.id);

      const result = await vehicleRepository.findCatalog({
        brand_id: brand.id,
        min_price: 100000,
        max_price: 130000,
        plate_last_digit: 7,
        feature_ids: [featA.id, featB.id],
        publicOnly: true,
      });

      const ids = result.items.map((i) => i.id);
      expect(ids).toContain(carCompleto.id);
      expect(ids).not.toContain(carParcial.id);
    });
  });

  describe('findDetailedById e findByIds', () => {
    it('findDetailedById deve trazer marca, modelo, lista de opcionais e fotos ordenadas por display_order ASC', async () => {
      const store = await createHelperStore();
      const { brand, model } = await createHelperBrandAndModel();
      const feat = await createHelperFeature('Sensor');

      const vehicle = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id),
        [feat.id]
      );
      createdVehicleIds.add(vehicle.id);

      await pool.query(
        `INSERT INTO vehicle_photos (vehicle_id, thumb_path, full_path, display_order, is_primary)
         VALUES ($1, 'thumb2.webp', 'full2.webp', 2, false), ($1, 'thumb1.webp', 'full1.webp', 1, true)`,
        [vehicle.id]
      );

      const detailed = await vehicleRepository.findDetailedById(vehicle.id);

      expect(detailed).not.toBeNull();
      expect(detailed?.id).toBe(vehicle.id);
      expect(detailed?.model.id).toBe(model.id);
      expect(detailed?.brand.id).toBe(brand.id);
      expect(detailed?.features.some((f) => f.id === feat.id)).toBe(true);
      expect(detailed?.photos.length).toBe(2);
      expect(detailed?.photos[0].display_order).toBe(1);
      expect(detailed?.photos[0].thumb_path).toBe('thumb1.webp');
      expect(detailed?.photos[1].display_order).toBe(2);
    });

    it('findByIds deve retornar os veículos correspondentes para comparação', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();

      const car1 = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id),
        []
      );
      const car2 = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id),
        []
      );
      createdVehicleIds.add(car1.id);
      createdVehicleIds.add(car2.id);

      const list = await vehicleRepository.findByIds([car1.id, car2.id]);
      expect(list.length).toBe(2);
      expect(list.map((c) => c.id)).toContain(car1.id);
      expect(list.map((c) => c.id)).toContain(car2.id);
    });
  });

  describe('incrementViewMetrics & delete', () => {
    it('incrementViewMetrics deve somar total_views no veículo e views_count na data em vehicle_metrics', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();

      const vehicle = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id, { total_views: 0 }),
        []
      );
      createdVehicleIds.add(vehicle.id);

      await vehicleRepository.incrementViewMetrics(vehicle.id);
      await vehicleRepository.incrementViewMetrics(vehicle.id);

      const updated = await vehicleRepository.findById(vehicle.id);
      expect(updated?.total_views).toBe(2);

      const metrics = await pool.query(
        'SELECT views_count FROM vehicle_metrics WHERE vehicle_id = $1',
        [vehicle.id]
      );
      expect(metrics.rows.length).toBe(1);
      expect(metrics.rows[0].views_count).toBe(2);
    });

    it('delete deve atualizar deleted_at e status = INATIVO (soft delete)', async () => {
      const store = await createHelperStore();
      const { model } = await createHelperBrandAndModel();

      const vehicle = await vehicleRepository.createWithFeatures(
        makeVehicleData(store.id, model.id),
        []
      );
      createdVehicleIds.add(vehicle.id);

      const deleted = await vehicleRepository.delete(vehicle.id);
      expect(deleted?.deleted_at).not.toBeNull();
      expect(deleted?.status).toBe('INATIVO');

      const found = await vehicleRepository.findById(vehicle.id);
      expect(found).toBeNull();
    });
  });
});
