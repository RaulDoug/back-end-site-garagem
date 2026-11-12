import { Request, Response, NextFunction } from 'express';
import BaseController from '#controllers/base.controller.js';
import TenantService from '#services/tenant.service.js';
import type { Tenant, CreateTenantData } from '#repositories/tenant.repository.js';

export default class TenantController extends BaseController<Tenant, CreateTenantData> {
  constructor(protected override service: TenantService = new TenantService()) {
    super(service);
  }

  onboard = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
      const result = await this.service.onboard(req.body);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
      const tenantId = req.user!.tenantId;
      const tenant = await this.service.getById(tenantId);
      return res.status(200).json({ tenant });
    } catch (error) {
      return next(error);
    }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
      const tenantId = req.user!.tenantId;
      const tenant = await this.service.update(tenantId, req.body);
      return res.status(200).json({ tenant });
    } catch (error) {
      return next(error);
    }
  };
}
