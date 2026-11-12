import { Brand, CreateBrandData } from '#repositories/brand.repository.js';
import BrandService from '#services/brand.service.js';
import BaseController from '#controllers/base.controller.js';
import { Request, Response } from 'express';
import { parseFilters } from '#utils/parse-filter.util.js';

export default class BrandController extends BaseController<Brand, CreateBrandData> {
  constructor(protected override service = new BrandService()) {
    super(service);
  }

  override find = async (req: Request, res: Response): Promise<Response> => {
    const filters = parseFilters(req.query);
    const tenantId = req.user?.tenantId;
    const items = await this.service.find(filters, tenantId);
    return res.status(200).json({ items });
  };

  override findById = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const item = await this.service.findById(id as string, tenantId);
    return res.status(200).json({ item });
  };

  override create = async (req: Request, res: Response): Promise<Response> => {
    const tenantId = req.user?.tenantId;
    const item = await this.service.create(req.body, tenantId);
    return res.status(201).json({ item });
  };

  override update = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const item = await this.service.update(id as string, req.body, tenantId);
    return res.status(200).json({ item });
  };

  override delete = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const item = await this.service.delete(id as string, tenantId);
    return res.status(200).json({ item });
  };
}
