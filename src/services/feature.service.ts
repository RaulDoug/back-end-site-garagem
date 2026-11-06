import { FeatureRepository, Feature, CreateFeatureData } from '#repositories/feature.repository.js';
import BaseService from './base.service';

export default class FeatureService extends BaseService<Feature, CreateFeatureData> {
  constructor(protected override repository = new FeatureRepository()) {
    super(repository);
  }
}
