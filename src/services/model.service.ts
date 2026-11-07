import { ModelRepository, Model, CreateModelData } from '#repositories/model.repository.js';
import BaseService from '#services/base.service.js';

export default class ModelService extends BaseService<Model, CreateModelData> {
  constructor(protected override repository = new ModelRepository()) {
    super(repository);
  }
}
