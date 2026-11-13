import { CreateStoreData, Store } from '#repositories/store.repository.js';
import StoreService from '#services/store.service.js';
import { Request, Response } from 'express';
import BaseController from '#controllers/base.controller.js';
import { parseFilters } from '#utils/parse-filter.util.js';

export default class StoreController extends BaseController<Store, CreateStoreData> {
  constructor(protected override service = new StoreService()) {
    super(service);
  }

  override create = async (req: Request, res: Response): Promise<Response> => {
    const tenantId = req.user!.tenantId;
    const item = await this.service.create(req.body, tenantId);

    return res.status(201).json({ item });
  };

  override find = async (req: Request, res: Response): Promise<Response> => {
    const filters = parseFilters(req.query);
    const tenantId = req.user!.tenantId;
    const items = await this.service.find(filters, tenantId);

    return res.status(200).json({ items });
  };

  override findById = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const item = await this.service.findById(id as string, tenantId);

    return res.status(200).json({ item });
  };

  override update = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const item = await this.service.update(id as string, req.body, tenantId);

    return res.status(200).json({ item });
  };

  override delete = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const item = await this.service.delete(id as string, tenantId);

    return res.status(200).json({ item });
  };

  getPublicById = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const item = await this.service.findPublicById(id as string);

    return res.status(200).json({ item });
  };

  findByCNPJ = async (req: Request, res: Response): Promise<Response> => {
    const { cnpj } = req.params;
    const tenantId = req.user!.tenantId;
    const store = await this.service.findByCNPJ(cnpj as string, tenantId);

    return res.status(200).json({ store });
  };
}
