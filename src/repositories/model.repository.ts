import BaseRepository from './base.repository';

export interface Model {
  id: string;
  brand_id: string;
  name: string;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
}

export interface CreateModelData {
  brand_id: string;
  name: string;
}

export class ModelRepository extends BaseRepository<Model, CreateModelData> {
  constructor() {
    super('models');
  }
}
