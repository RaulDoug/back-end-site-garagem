import { CreateStoreData, Store } from '#repositories/store.repository.js';
import StoreService from '#services/store.service.js';
import { Request, Response } from 'express';
import BaseController from './base.controller';

export default class StoreController extends BaseController<Store, CreateStoreData> {
  constructor(protected override service = new StoreService()) {
    super(service);
  }


  findByCNPJ = async (req: Request, res: Response): Promise<Response> => {
    const { cnpj } = req.params;
    const store = await this.service.findByCNPJ(cnpj as string);

    return res.status(200).json({ store });
  };
}