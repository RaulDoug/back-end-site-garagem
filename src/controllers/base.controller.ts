import { BaseService } from '#services/base.service.js';
import { NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';


export abstract class BaseController<T extends QueryResultRow> {
  constructor(protected readonly service: BaseService<T>) { }

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await this.service.findById(id as string);

      if (!result) {
        return res.status(404).json({ message: 'Registro não encontrado' });
      }

      return res.status(200).json({ result });
    } catch (error) {
      console.log(error);
      return next(error);
    }
  };

  find = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.query;

      const result = await this.service.find(data);

      return res.status(200).json({ result });
    } catch (error) {
      console.log(error);
      return next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await this.service.delete(id as string);

      if (!result) {
        return res.status(404).json({ message: 'Registro não encontrado' });
      }

      return res.status(200).json({ result });
    } catch (error) {
      console.log(error);
      return next(error);
    }
  };
}