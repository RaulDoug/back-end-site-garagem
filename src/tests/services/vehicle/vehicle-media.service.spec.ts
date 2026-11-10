import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VehicleMediaService } from '#services/vehicle-media.service.js';
import { VehicleRepository, type Vehicle } from '#repositories/vehicle.repository.js';
import { VehiclePhotoRepository, VehiclePhoto } from '#repositories/vehicle-photo.repository.js';
import * as imageProcessor from '#utils/image-processor.util.js';
import { StorageProvider } from '#utils/storage.util.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

vi.mock('#utils/image-processor.util.js');

describe('VehicleMediaService', () => {
  let service: VehicleMediaService;
  let vehicleRepo: VehicleRepository;
  let photoRepo: VehiclePhotoRepository;
  let mockStorage: StorageProvider;

  const vehicleId = '11111111-1111-1111-1111-111111111111';
  const photoId1 = '22222222-2222-2222-2222-222222222222';
  const photoId2 = '33333333-3333-3333-3333-333333333333';

  const fakeVehicle = {
    id: vehicleId,
    title: 'Carro Teste',
    inspection_report_url: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vehicleRepo = new VehicleRepository();
    photoRepo = new VehiclePhotoRepository();
    mockStorage = {
      save: vi.fn().mockImplementation(async (folder, filename) => `/uploads/vehicles/${folder}/${filename}`),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteTempFile: vi.fn().mockResolvedValue(undefined),
    };
    service = new VehicleMediaService(vehicleRepo, photoRepo, mockStorage);

    vi.spyOn(vehicleRepo, 'findById').mockResolvedValue(fakeVehicle as unknown as Vehicle);
    vi.spyOn(imageProcessor, 'processVehiclePhoto').mockResolvedValue({
      thumbBuffer: Buffer.from('fake-thumb-webp'),
      fullBuffer: Buffer.from('fake-full-webp'),
    });
    vi.spyOn(imageProcessor, 'deletePhotoFiles').mockResolvedValue(undefined);
    vi.spyOn(imageProcessor, 'deleteReportFile').mockResolvedValue(undefined);
  });

  describe('uploadPhotos', () => {
    it('deve lançar NotFoundError se o veículo não existir e limpar arquivos temporários', async () => {
      vi.spyOn(vehicleRepo, 'findById').mockResolvedValue(null);

      const files = [{ path: '/tmp/test.jpg' }] as Express.Multer.File[];

      await expect(service.uploadPhotos(vehicleId, files)).rejects.toThrow(NotFoundError);
      expect(mockStorage.deleteTempFile).toHaveBeenCalledWith('/tmp/test.jpg');
    });

    it('deve lançar AppError se a lista de arquivos estiver vazia', async () => {
      await expect(service.uploadPhotos(vehicleId, [])).rejects.toThrow(AppError);
    });

    it('deve definir a primeira foto como capa (is_primary = true) quando o veículo tiver 0 fotos', async () => {
      vi.spyOn(photoRepo, 'countByVehicleId').mockResolvedValue({ count: 0, maxOrder: -1 });
      const createManySpy = vi.spyOn(photoRepo, 'createMany').mockResolvedValue([]);

      const files = [
        { path: '/tmp/img1.jpg' },
        { path: '/tmp/img2.jpg' },
      ] as Express.Multer.File[];

      await service.uploadPhotos(vehicleId, files);

      expect(createManySpy).toHaveBeenCalledWith(
        vehicleId,
        expect.arrayContaining([
          expect.objectContaining({ display_order: 0, is_primary: true }),
          expect.objectContaining({ display_order: 1, is_primary: false }),
        ])
      );
      expect(mockStorage.deleteTempFile).toHaveBeenCalledTimes(2);
    });

    it('deve anexar novas fotos no final com is_primary = false quando o veículo já possuir fotos', async () => {
      vi.spyOn(photoRepo, 'countByVehicleId').mockResolvedValue({ count: 2, maxOrder: 1 });
      const createManySpy = vi.spyOn(photoRepo, 'createMany').mockResolvedValue([]);

      const files = [{ path: '/tmp/img3.jpg' }] as Express.Multer.File[];

      await service.uploadPhotos(vehicleId, files);

      expect(createManySpy).toHaveBeenCalledWith(
        vehicleId,
        expect.arrayContaining([
          expect.objectContaining({ display_order: 2, is_primary: false }),
        ])
      );
      expect(mockStorage.deleteTempFile).toHaveBeenCalledWith('/tmp/img3.jpg');
    });

    it('deve remover do disco as fotos já processadas no lote se ocorrer erro no banco (rollback compensatório)', async () => {
      vi.spyOn(photoRepo, 'countByVehicleId').mockResolvedValue({ count: 0, maxOrder: -1 });
      vi.spyOn(photoRepo, 'createMany').mockRejectedValue(new Error('DB failure'));

      const files = [
        { path: '/tmp/img1.jpg' },
        { path: '/tmp/img2.jpg' },
      ] as Express.Multer.File[];

      await expect(service.uploadPhotos(vehicleId, files)).rejects.toThrow('DB failure');

      expect(imageProcessor.deletePhotoFiles).toHaveBeenCalledTimes(2);
      expect(mockStorage.deleteTempFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('reorderPhotos', () => {
    it('deve lançar NotFoundError se o veículo não existir', async () => {
      vi.spyOn(vehicleRepo, 'findById').mockResolvedValue(null);

      await expect(service.reorderPhotos(vehicleId, [photoId1])).rejects.toThrow(NotFoundError);
    });

    it('deve lançar AppError se a quantidade de photoIds for diferente do total existente', async () => {
      vi.spyOn(photoRepo, 'countByVehicleId').mockResolvedValue({ count: 3, maxOrder: 2 });

      await expect(service.reorderPhotos(vehicleId, [photoId1, photoId2])).rejects.toThrow(
        /quantidade de fotos informada diverge/i
      );
    });

    it('deve delegar a reordenação ao repositório quando os dados forem válidos', async () => {
      vi.spyOn(photoRepo, 'countByVehicleId').mockResolvedValue({ count: 2, maxOrder: 1 });
      const reorderSpy = vi.spyOn(photoRepo, 'reorder').mockResolvedValue([]);

      await service.reorderPhotos(vehicleId, [photoId2, photoId1]);

      expect(reorderSpy).toHaveBeenCalledWith(vehicleId, [photoId2, photoId1]);
    });
  });

  describe('deletePhoto', () => {
    const existingPhoto: VehiclePhoto = {
      id: photoId1,
      vehicle_id: vehicleId,
      thumb_path: '/uploads/vehicles/thumbs/photo1.webp',
      full_path: '/uploads/vehicles/full/photo1.webp',
      display_order: 0,
      is_primary: true,
      created_at: new Date(),
    };

    it('deve lançar NotFoundError se veículo ou foto não existirem', async () => {
      vi.spyOn(photoRepo, 'findById').mockResolvedValue(null);

      await expect(service.deletePhoto(vehicleId, photoId1)).rejects.toThrow(NotFoundError);
    });

    it('deve lançar AppError se a foto pertencer a outro veículo', async () => {
      vi.spyOn(photoRepo, 'findById').mockResolvedValue({
        ...existingPhoto,
        vehicle_id: 'other-veh-id',
      });

      await expect(service.deletePhoto(vehicleId, photoId1)).rejects.toThrow(AppError);
    });

    it('deve deletar arquivos físicos e do banco, e eleger nova capa se a capa foi deletada', async () => {
      vi.spyOn(photoRepo, 'findById').mockResolvedValue(existingPhoto);
      vi.spyOn(photoRepo, 'delete').mockResolvedValue(true);

      const nextPhoto: VehiclePhoto = {
        id: photoId2,
        vehicle_id: vehicleId,
        thumb_path: '/uploads/vehicles/thumbs/photo2.webp',
        full_path: '/uploads/vehicles/full/photo2.webp',
        display_order: 1,
        is_primary: false,
        created_at: new Date(),
      };
      vi.spyOn(photoRepo, 'findByVehicleId').mockResolvedValue([nextPhoto]);
      const setPrimarySpy = vi.spyOn(photoRepo, 'setPrimary').mockResolvedValue(undefined);

      await service.deletePhoto(vehicleId, photoId1);

      expect(imageProcessor.deletePhotoFiles).toHaveBeenCalledWith(
        existingPhoto.thumb_path,
        existingPhoto.full_path
      );
      expect(photoRepo.delete).toHaveBeenCalledWith(photoId1);
      expect(setPrimarySpy).toHaveBeenCalledWith(vehicleId, nextPhoto.id);
    });
  });

  describe('uploadInspectionReport', () => {
    it('deve lançar NotFoundError se veículo não existir e limpar temporário', async () => {
      vi.spyOn(vehicleRepo, 'findById').mockResolvedValue(null);

      const file = { path: '/tmp/laudo.pdf' } as Express.Multer.File;

      await expect(service.uploadInspectionReport(vehicleId, file)).rejects.toThrow(NotFoundError);
      expect(mockStorage.deleteTempFile).toHaveBeenCalledWith('/tmp/laudo.pdf');
    });

    it('deve lançar AppError se arquivo for indefinido', async () => {
      await expect(
        service.uploadInspectionReport(vehicleId, undefined as unknown as Express.Multer.File)
      ).rejects.toThrow(AppError);
    });

    it('deve salvar PDF, remover anterior se houver, e atualizar repositório', async () => {
      vi.spyOn(vehicleRepo, 'findById').mockResolvedValue({
        ...fakeVehicle,
        inspection_report_url: '/uploads/vehicles/reports/antigo.pdf',
      } as unknown as Vehicle);

      const updateReportSpy = vi
        .spyOn(vehicleRepo, 'updateInspectionReport')
        .mockResolvedValue({
          ...fakeVehicle,
          inspection_report_url: '/uploads/vehicles/reports/novo.pdf',
        } as unknown as Vehicle);

      const file = { path: '/tmp/laudo.pdf' } as Express.Multer.File;

      await service.uploadInspectionReport(vehicleId, file);

      expect(imageProcessor.deleteReportFile).toHaveBeenCalledWith('/uploads/vehicles/reports/antigo.pdf');
      expect(mockStorage.save).toHaveBeenCalledWith('reports', expect.stringMatching(/\.pdf$/), '/tmp/laudo.pdf');
      expect(updateReportSpy).toHaveBeenCalledWith(
        vehicleId,
        expect.stringMatching(/\/uploads\/vehicles\/reports\/.*\.pdf$/)
      );
      expect(mockStorage.deleteTempFile).toHaveBeenCalledWith('/tmp/laudo.pdf');
    });

    it('não deve apagar o laudo antigo e deve remover o novo PDF se a atualização no banco falhar', async () => {
      vi.spyOn(vehicleRepo, 'findById').mockResolvedValue({
        ...fakeVehicle,
        inspection_report_url: '/uploads/vehicles/reports/antigo.pdf',
      } as unknown as Vehicle);

      vi.spyOn(vehicleRepo, 'updateInspectionReport').mockResolvedValue(null);

      const file = { path: '/tmp/laudo.pdf' } as Express.Multer.File;

      await expect(service.uploadInspectionReport(vehicleId, file)).rejects.toThrow(AppError);

      expect(imageProcessor.deleteReportFile).not.toHaveBeenCalledWith(
        '/uploads/vehicles/reports/antigo.pdf'
      );
      expect(imageProcessor.deleteReportFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/uploads\/vehicles\/reports\/.*\.pdf$/)
      );
      expect(mockStorage.deleteTempFile).toHaveBeenCalledWith('/tmp/laudo.pdf');
    });
  });

  describe('deleteInspectionReport', () => {
    it('deve remover laudo físico e limpar campo no banco', async () => {
      vi.spyOn(vehicleRepo, 'findById').mockResolvedValue({
        ...fakeVehicle,
        inspection_report_url: '/uploads/vehicles/reports/existente.pdf',
      } as unknown as Vehicle);
      const updateReportSpy = vi.spyOn(vehicleRepo, 'updateInspectionReport').mockResolvedValue(null);

      await service.deleteInspectionReport(vehicleId);

      expect(imageProcessor.deleteReportFile).toHaveBeenCalledWith(
        '/uploads/vehicles/reports/existente.pdf'
      );
      expect(updateReportSpy).toHaveBeenCalledWith(vehicleId, null);
    });
  });
});
