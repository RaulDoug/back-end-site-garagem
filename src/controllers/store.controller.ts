import { Store } from '#repositories/store.repository.js';
import StoreService from '#services/store.service.js';
import { NextFunction, Request, Response } from 'express';
import { BaseController } from './base.controller';

export default class StoreController extends BaseController<Store> {
  constructor(private storeService = new StoreService()) {
    super(storeService);
  }

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body;

      const newStore = await this.storeService.create({ ...data });

      return res.status(201).json({
        message: 'Loja cadastrada com sucesso!',
        store: newStore,
      });
    } catch (error) {
      console.log(error);
      return next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data = req.body;

      const updatedStore = await this.storeService.update(id as string, { ...data });

      let messageToUser;

      if (updatedStore.updated === true) {
        messageToUser = 'Loja atualizada com sucesso!';
      } else {
        messageToUser = 'Nenhuma informação atualizada';
      }

      return res.status(200).json({ message: messageToUser, store: updatedStore.store });
    } catch (error) {
      console.log(error);
      return next(error);
    }
  };
}