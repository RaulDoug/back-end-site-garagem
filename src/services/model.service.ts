import { ModelRepository, Model, CreateModelData } from '#repositories/model.repository.js';
import BaseService from './base.service';

export default class ModelService extends BaseService<Model, CreateModelData> {
  constructor(protected override repository = new ModelRepository()) {
    super(repository);
  }
}
