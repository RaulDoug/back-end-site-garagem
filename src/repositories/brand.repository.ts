import BaseRepository from '#repositories/base.repository.js';

export interface Brand {
  id: string;
  name: string;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
}

export interface CreateBrandData {
  name: string;
}

export class BrandRepository extends BaseRepository<Brand, CreateBrandData> {
  constructor () {
    super('brands');
  }
}