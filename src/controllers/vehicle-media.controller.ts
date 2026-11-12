import { Request, Response } from 'express';
import { VehicleMediaService } from '#services/vehicle-media.service.js';

export class VehicleMediaController {
  constructor(private readonly service: VehicleMediaService = new VehicleMediaService()) {}

  uploadPhotos = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const files = (req.files || []) as Express.Multer.File[];
    const tenantId = req.user!.tenantId;
    const storeId = req.user!.storeId;
    const photos = await this.service.uploadPhotos(id as string, files, tenantId, storeId);
    return res.status(201).json({ photos });
  };

  reorderPhotos = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const { photo_ids } = req.body;
    const tenantId = req.user!.tenantId;
    const storeId = req.user!.storeId;
    const photos = await this.service.reorderPhotos(id as string, photo_ids, tenantId, storeId);
    return res.status(200).json({ photos });
  };

  deletePhoto = async (req: Request, res: Response): Promise<Response> => {
    const { id, photoId } = req.params;
    const tenantId = req.user!.tenantId;
    const storeId = req.user!.storeId;
    await this.service.deletePhoto(id as string, photoId as string, tenantId, storeId);
    return res.status(200).json({ message: 'Foto excluída com sucesso' });
  };

  uploadInspectionReport = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const file = req.file as Express.Multer.File;
    const tenantId = req.user!.tenantId;
    const storeId = req.user!.storeId;
    const vehicle = await this.service.uploadInspectionReport(id as string, file, tenantId, storeId);
    return res.status(200).json({ vehicle, inspection_report_url: vehicle.inspection_report_url });
  };

  deleteInspectionReport = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const storeId = req.user!.storeId;
    await this.service.deleteInspectionReport(id as string, tenantId, storeId);
    return res.status(200).json({ message: 'Laudo pericial excluído com sucesso' });
  };
}
