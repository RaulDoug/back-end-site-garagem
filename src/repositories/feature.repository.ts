import BaseRepository from './base.repository';

export interface Feature {
  id: string;
  name: string;
}

export interface CreateFeatureData {
  name: string;
}

export class FeatureRepository extends BaseRepository<Feature, CreateFeatureData> {
  constructor() {
    super('features', { softDelete: false, hasActiveStatus: false });
  }
}
