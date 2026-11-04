import BaseService from '#services/base.service.js';
import { Request, Response } from 'express';

export default class BaseController<
    T extends Record<string, unknown>,
    C = Record<string, unknown>
> {
  constructor(protected service: BaseService<T, C>) {}

  findById= async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;

    const item = await this.service.findById(id as string);

    return res.status(200).json({ item });
  };

  find = async (req: Request, res: Response): Promise<Response> => {
    const filters = req.query.include_deleted === 'true' ? { filters: [], includeDeleted: true } : { filters: [] };

    const items = await this.service.find(filters);

    return res.status(200).json({ items });
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const data: C = req.body;

    const item = await this.service.create(data);

    return res.status(201).json({ item });
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const data: Partial<C> = req.body;

    const item = await this.service.update(id as string, data);

    return res.status(200).json({ item });
  };

  delete = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;

    const item = await this.service.delete(id as string);

    return res.status(200).json({ item });
  };
}