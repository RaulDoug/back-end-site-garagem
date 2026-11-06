import { Request, Response } from 'express';
import BaseController from './base.controller';
import VehicleService from '#services/vehicle.service.js';
import { type Vehicle, type CreateVehicleData } from '#repositories/vehicle.repository.js';

export default class VehicleController extends BaseController<Vehicle, CreateVehicleData> {
  constructor(protected override service = new VehicleService()) {
    super(service);
  }

  findPublic = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.service.findPublic(req.query);
    return res.status(200).json(result);
  };

  findAdmin = async (req: Request, res: Response): Promise<Response> => {
    const role = req.user?.role || 'VISUALIZADOR';
    const result = await this.service.findAdmin(req.query, role);
    return res.status(200).json(result);
  };

  findByIdPublic = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';

    const item = await this.service.findByIdPublic(id as string, ip, userAgent);
    return res.status(200).json({ item });
  };

  findByIdAdmin = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const role = req.user?.role || 'VISUALIZADOR';

    const item = await this.service.findByIdAdmin(id as string, role);
    return res.status(200).json({ item });
  };

  comparePublic = async (req: Request, res: Response): Promise<Response> => {
    const rawIds = req.query.ids;
    const ids = Array.isArray(rawIds)
      ? (rawIds as string[])
      : typeof rawIds === 'string'
        ? rawIds.split(',').map((s) => s.trim())
        : [];

    const items = await this.service.comparePublic(ids);
    return res.status(200).json({ items });
  };

  override create = async (req: Request, res: Response): Promise<Response> => {
    const registered_by_user_id = req.user!.id;
    const item = await this.service.create({
      ...req.body,
      registered_by_user_id,
    });
    return res.status(201).json({ item });
  };

  override update = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const item = await this.service.update(id as string, req.body);
    return res.status(200).json({ item });
  };

  override delete = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const item = await this.service.delete(id as string);
    return res.status(200).json({ item });
  };
}
