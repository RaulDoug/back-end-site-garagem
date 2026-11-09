import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pool from '#src/config/database.js';
import { VehiclePhotoRepository } from '#repositories/vehicle-photo.repository.js';
import { VehicleRepository } from '#repositories/vehicle.repository.js';
import { StoreRepository } from '#repositories/store.repository.js';
import { BrandRepository } from '#repositories/brand.repository.js';
import { ModelRepository } from '#repositories/model.repository.js';

const photoRepository = new VehiclePhotoRepository();
const vehicleRepository = new VehicleRepository();
const storeRepository = new StoreRepository();
const brandRepository = new BrandRepository();
const modelRepository = new ModelRepository();

const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

let testStoreId: string;
let testBrandId: string;
let testModelId: string;
let testVehicleId: string;
let testUserId: string;

describe('VehiclePhotoRepository & Vehicle inspection report (Integration)', () => {
  beforeAll(async () => {
    // Cria usuário dedicado para isolamento de integridade referencial
    const newUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, phone)
       VALUES ($1, $2, $3, 'ADMIN', '(37) 99999-8888') RETURNING id`,
      [`PhotoUser_${RUN_ID}`, `photouser_${RUN_ID}@teste.com`, 'hash']
    );
    testUserId = newUser.rows[0].id;

    const cnpj = `${Math.floor(10000000000000 + Math.random() * 90000000000000)}`;
    const store = await storeRepository.create({
      name: `Loja_Photo_${RUN_ID}`,
      phone: '(37) 99999-0000',
      cnpj,
      zip_code: '35500000',
      street: 'Rua das Fotos',
      number: '123',
      neighborhood: 'Bairro',
      city: 'Cidade',
      state: 'MG',
    });
    testStoreId = store.id;

    const brand = await brandRepository.create({ name: `Marca_Photo_${RUN_ID}` });
    testBrandId = brand.id;

    const model = await modelRepository.create({ brand_id: brand.id, name: `Modelo_Photo_${RUN_ID}` });
    testModelId = model.id;

    const randomNum = Math.floor(100 + Math.random() * 900);
    const fullPlate = `FOT${randomNum % 10}A${String(randomNum % 100).padStart(2, '0')}`;

    const vehicle = await vehicleRepository.create({
      store_id: testStoreId,
      model_id: testModelId,
      registered_by_user_id: testUserId,
      full_license_plate: fullPlate,
      plate_last_digit: Number(fullPlate.slice(-1)) || 0,
      title: `Veiculo Foto ${RUN_ID}`,
      description: 'Veiculo para teste de fotos e laudo',
      steering: 'Eletrica',
      manufacture_year: 2022,
      model_year: 2023,
      mileage: 15000,
      transmission: 'AUTOMATICO',
      category: 'SUV',
      fuel_type: 'FLEX',
      color: 'Preto',
      sale_price: 95000,
      sale_type: 'PROPRIO',
      doors: 4,
      status: 'ATIVO',
    });
    testVehicleId = vehicle.id;
  });

  afterAll(async () => {
    if (testVehicleId) {
      await pool.query('DELETE FROM vehicle_photos WHERE vehicle_id = $1', [testVehicleId]);
      await pool.query('DELETE FROM vehicles WHERE id = $1', [testVehicleId]);
    }
    if (testModelId) {
      await pool.query('DELETE FROM models WHERE id = $1', [testModelId]);
    }
    if (testBrandId) {
      await pool.query('DELETE FROM brands WHERE id = $1', [testBrandId]);
    }
    if (testStoreId) {
      await pool.query('DELETE FROM stores WHERE id = $1', [testStoreId]);
    }
    if (testUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  it('deve inserir fotos em lote com createMany e retornar os registros criados', async () => {
    const photosToCreate = [
      {
        thumb_path: '/uploads/vehicles/thumbs/photo1.webp',
        full_path: '/uploads/vehicles/full/photo1.webp',
        display_order: 0,
        is_primary: true,
      },
      {
        thumb_path: '/uploads/vehicles/thumbs/photo2.webp',
        full_path: '/uploads/vehicles/full/photo2.webp',
        display_order: 1,
        is_primary: false,
      },
    ];

    const created = await photoRepository.createMany(testVehicleId, photosToCreate);

    expect(created).toHaveLength(2);
    expect(created[0].vehicle_id).toBe(testVehicleId);
    expect(created[0].thumb_path).toBe('/uploads/vehicles/thumbs/photo1.webp');
    expect(created[0].display_order).toBe(0);
    expect(created[0].is_primary).toBe(true);

    expect(created[1].display_order).toBe(1);
    expect(created[1].is_primary).toBe(false);
  });

  it('deve listar fotos ordenadas por display_order ASC com findByVehicleId', async () => {
    const list = await photoRepository.findByVehicleId(testVehicleId);

    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].display_order).toBeLessThanOrEqual(list[1].display_order);
  });

  it('deve retornar contagem e maxOrder com countByVehicleId', async () => {
    const countData = await photoRepository.countByVehicleId(testVehicleId);

    expect(countData.count).toBe(2);
    expect(countData.maxOrder).toBe(1);
  });

  it('deve reordenar fotos atomicamente com reorder garantindo is_primary no índice 0 (RN008)', async () => {
    const list = await photoRepository.findByVehicleId(testVehicleId);
    const id0 = list[0].id;
    const id1 = list[1].id;

    // Inverte a ordem das fotos: id1 agora será o índice 0 (capa)
    const reordered = await photoRepository.reorder(testVehicleId, [id1, id0]);

    expect(reordered).toHaveLength(2);
    expect(reordered[0].id).toBe(id1);
    expect(reordered[0].display_order).toBe(0);
    expect(reordered[0].is_primary).toBe(true);

    expect(reordered[1].id).toBe(id0);
    expect(reordered[1].display_order).toBe(1);
    expect(reordered[1].is_primary).toBe(false);
  });

  it('deve fazer rollback e falhar ao tentar reordenar com photoId que não pertence ao veículo', async () => {
    const list = await photoRepository.findByVehicleId(testVehicleId);
    const foreignPhotoId = '00000000-0000-0000-0000-000000000099';

    await expect(
      photoRepository.reorder(testVehicleId, [foreignPhotoId, list[0].id])
    ).rejects.toThrow();

    // Confirma que a ordem anterior foi preservada
    const afterList = await photoRepository.findByVehicleId(testVehicleId);
    expect(afterList[0].id).toBe(list[0].id);
  });

  it('deve deletar uma foto por id com delete', async () => {
    const list = await photoRepository.findByVehicleId(testVehicleId);
    const photoToDelete = list[1];

    const deleted = await photoRepository.delete(photoToDelete.id);
    expect(deleted).toBe(true);

    const remaining = await photoRepository.findByVehicleId(testVehicleId);
    expect(remaining.some((p) => p.id === photoToDelete.id)).toBe(false);
  });

  it('deve atualizar inspection_report_url no VehicleRepository com updateInspectionReport', async () => {
    const reportUrl = '/uploads/vehicles/reports/laudo-test.pdf';

    const updated = await vehicleRepository.updateInspectionReport(testVehicleId, reportUrl);
    expect(updated).not.toBeNull();
    expect(updated?.inspection_report_url).toBe(reportUrl);

    // Limpa laudo passando null
    const cleared = await vehicleRepository.updateInspectionReport(testVehicleId, null);
    expect(cleared).not.toBeNull();
    expect(cleared?.inspection_report_url).toBeNull();
  });
});
