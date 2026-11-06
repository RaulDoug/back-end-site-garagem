import { Brand, CreateBrandData } from '#repositories/brand.repository.js';
import BrandService from '#services/brand.service.js';
import BaseController from './base.controller';

export default class BrandController extends BaseController<Brand, CreateBrandData> {
  constructor (protected override service = new BrandService()) {
    super(service);
  }
}