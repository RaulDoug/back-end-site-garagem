import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { VehicleRepository, type Vehicle } from '#repositories/vehicle.repository.js';
import {
  VehiclePhotoRepository,
  type VehiclePhoto,
  type CreatePhotoData,
} from '#repositories/vehicle-photo.repository.js';
import {
  processVehiclePhoto,
  deletePhotoFiles,
  deleteReportFile,
  ensureUploadDirs,
} from '#utils/image-processor.util.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

export class VehicleMediaService {
  constructor(
    private readonly vehicleRepository: VehicleRepository = new VehicleRepository(),
    private readonly vehiclePhotoRepository: VehiclePhotoRepository = new VehiclePhotoRepository()
  ) {}

  /**
   * Realiza upload de até 15 fotos para um veículo.
   * Aplica RN008: se o veículo tem 0 fotos, a primeira é definida como is_primary = true.
   */
  async uploadPhotos(vehicleId: string, files: Express.Multer.File[]): Promise<VehiclePhoto[]> {
    const vehicle = await this.vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Veículo não encontrado');
    }

    if (!files || files.length === 0) {
      throw new AppError('Nenhuma foto enviada para upload', 400);
    }

    const countData = await this.vehiclePhotoRepository.countByVehicleId(vehicleId);
    const photosToInsert: CreatePhotoData[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const photoId = crypto.randomUUID();

        const { thumb_path, full_path } = await processVehiclePhoto(
          file.buffer,
          vehicleId,
          photoId
        );

        const isPrimary = countData.count === 0 ? i === 0 : false;
        const displayOrder = countData.count === 0 ? i : countData.maxOrder + 1 + i;

        photosToInsert.push({
          thumb_path,
          full_path,
          display_order: displayOrder,
          is_primary: isPrimary,
        });
      }

      return await this.vehiclePhotoRepository.createMany(vehicleId, photosToInsert);
    } catch (error) {
      for (const photo of photosToInsert) {
        await deletePhotoFiles(photo.thumb_path, photo.full_path);
      }
      throw error;
    }
  }

  /**
   * Reordena a galeria de fotos do veículo.
   * O índice 0 torna-se automaticamente is_primary = true (RN008).
   */
  async reorderPhotos(vehicleId: string, photoIds: string[]): Promise<VehiclePhoto[]> {
    const vehicle = await this.vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Veículo não encontrado');
    }

    const countData = await this.vehiclePhotoRepository.countByVehicleId(vehicleId);
    if (countData.count !== photoIds.length) {
      throw new AppError('A quantidade de fotos informada diverge do total cadastrado para o veículo', 400);
    }

    return await this.vehiclePhotoRepository.reorder(vehicleId, photoIds);
  }

  /**
   * Remove uma foto da galeria e do disco.
   * Se a foto removida for a capa (is_primary = true), a próxima foto de menor display_order é eleita nova capa.
   */
  async deletePhoto(vehicleId: string, photoId: string): Promise<void> {
    const vehicle = await this.vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Veículo não encontrado');
    }

    const photo = await this.vehiclePhotoRepository.findById(photoId);
    if (!photo) {
      throw new NotFoundError('Foto não encontrada');
    }

    if (photo.vehicle_id !== vehicleId) {
      throw new AppError('A foto informada não pertence ao veículo especificado', 400);
    }

    // Remove arquivos físicos
    await deletePhotoFiles(photo.thumb_path, photo.full_path);

    // Remove do banco de dados
    await this.vehiclePhotoRepository.delete(photoId);

    // Se a foto deletada era a capa principal, elege a próxima disponível
    if (photo.is_primary) {
      const remaining = await this.vehiclePhotoRepository.findByVehicleId(vehicleId);
      if (remaining.length > 0) {
        await this.vehiclePhotoRepository.setPrimary(vehicleId, remaining[0].id);
      }
    }
  }

  /**
   * Realiza upload do laudo pericial (PDF). Remove laudo anterior do disco se existir.
   */
  async uploadInspectionReport(vehicleId: string, file: Express.Multer.File): Promise<Vehicle> {
    const vehicle = await this.vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Veículo não encontrado');
    }

    if (!file || !file.buffer) {
      throw new AppError('Arquivo de laudo não informado', 400);
    }

    ensureUploadDirs();

    const oldReportUrl = vehicle.inspection_report_url;
    const reportId = crypto.randomUUID();
    const relativePath = `/uploads/vehicles/reports/${reportId}.pdf`;
    const absolutePath = path.resolve(process.cwd(), relativePath.slice(1));

    await fs.promises.writeFile(absolutePath, file.buffer);

    let updated: Vehicle | null;
    try {
      updated = await this.vehicleRepository.updateInspectionReport(vehicleId, relativePath);
      if (!updated) {
        throw new AppError('Falha ao atualizar registro do laudo', 500);
      }
    } catch (error) {
      await deleteReportFile(relativePath);
      throw error;
    }

    if (oldReportUrl) {
      await deleteReportFile(oldReportUrl);
    }

    return updated;
  }

  /**
   * Exclui o laudo pericial (PDF) físico e desvincula do veículo.
   */
  async deleteInspectionReport(vehicleId: string): Promise<Vehicle | null> {
    const vehicle = await this.vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Veículo não encontrado');
    }

    if (vehicle.inspection_report_url) {
      await deleteReportFile(vehicle.inspection_report_url);
    }

    return await this.vehicleRepository.updateInspectionReport(vehicleId, null);
  }
}
