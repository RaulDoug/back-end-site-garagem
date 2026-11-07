import { BrandRepository, Brand, CreateBrandData } from '#repositories/brand.repository.js';
import BaseService from '#services/base.service.js';

export default class BrandService extends BaseService<Brand, CreateBrandData> {
  constructor (protected override repository = new BrandRepository()) {
    super(repository);
  }
}
