import { BrandRepository, Brand, CreateBrandData } from '#repositories/brand.repository.js';
import BaseService from './base.service';

export default class BrandService extends BaseService<Brand, CreateBrandData> {
  constructor (protected override repository = new BrandRepository()) {
    super(repository);
  }
}
