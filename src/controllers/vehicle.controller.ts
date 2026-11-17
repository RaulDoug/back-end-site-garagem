import { Request, Response } from 'express';
import BaseController from '#controllers/base.controller.js';
import VehicleService from '#services/vehicle.service.js';
import { type Vehicle, type CreateVehicleData } from '#repositories/vehicle.repository.js';
import { AppError } from '#src/errors/app.error.js';

export default class VehicleController extends BaseController<Vehicle, CreateVehicleData> {
  constructor(protected override service = new VehicleService()) {
    super(service);
  }

  findPublic = async (req: Request, res: Response): Promise<Response> => {
    const tenantId = req.tenantContext?.tenantId;
    if (!tenantId) {
      throw new AppError('Contexto da empresa ou loja é obrigatório', 400);
    }
    const filterStoreId = req.tenantContext?.storeId ?? null;
    const result = await this.service.findPublic(req.query, { tenantId, filterStoreId });
    return res.status(200).json(result);
  };

  findAdmin = async (req: Request, res: Response): Promise<Response> => {
    const role = req.user?.role || 'VISUALIZADOR';
    const tenantId = req.user!.tenantId;
    const userStoreId = req.user!.storeId;
    const filterStoreId = (req.query.store_id as string) ?? null;
    const result = await this.service.findAdmin(req.query, role, { tenantId, userStoreId, filterStoreId });
    return res.status(200).json(result);
  };

  findByIdPublic = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';
    const tenantId = req.tenantContext?.tenantId;
    const filterStoreId = req.tenantContext?.storeId ?? null;

    const item = await this.service.findByIdPublic(
      id as string,
      ip,
      userAgent,
      tenantId ? { tenantId, filterStoreId } : undefined
    );
    return res.status(200).json({ item });
  };

  findByIdAdmin = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const role = req.user?.role || 'VISUALIZADOR';
    const tenantId = req.user!.tenantId;
    const userStoreId = req.user!.storeId;

    const item = await this.service.findByIdAdmin(id as string, role, { tenantId, userStoreId });
    return res.status(200).json({ item });
  };

  comparePublic = async (req: Request, res: Response): Promise<Response> => {
    const rawIds = req.query.ids;
    const ids = Array.isArray(rawIds)
      ? (rawIds as string[])
      : typeof rawIds === 'string'
        ? rawIds.split(',').map((s) => s.trim())
        : [];
    const tenantId = req.tenantContext?.tenantId;
    const filterStoreId = req.tenantContext?.storeId ?? null;

    const items = await this.service.comparePublic(
      ids,
      tenantId ? { tenantId, filterStoreId } : undefined
    );
    return res.status(200).json({ items });
  };

  override create = async (req: Request, res: Response): Promise<Response> => {
    const registered_by_user_id = req.user!.id;
    const tenantId = req.user!.tenantId;
    const userStoreId = req.user!.storeId;
    const item = await this.service.create(
      {
        ...req.body,
        registered_by_user_id,
      },
      undefined,
      { tenantId, userStoreId }
    );
    return res.status(201).json({ item });
  };

  override update = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userStoreId = req.user!.storeId;
    const item = await this.service.update(id as string, req.body, undefined, { tenantId, userStoreId });
    return res.status(200).json({ item });
  };

  override delete = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userStoreId = req.user!.storeId;
    const item = await this.service.delete(id as string, { tenantId, userStoreId });
    return res.status(200).json({ item });
  };
}
