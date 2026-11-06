import { Feature, CreateFeatureData } from '#repositories/feature.repository.js';
import FeatureService from '#services/feature.service.js';
import BaseController from './base.controller';

export default class FeatureController extends BaseController<Feature, CreateFeatureData> {
  constructor(protected override service = new FeatureService()) {
    super(service);
  }
}
