import { Model, CreateModelData } from '#repositories/model.repository.js';
import ModelService from '#services/model.service.js';
import BaseController from './base.controller';

export default class ModelController extends BaseController<Model, CreateModelData> {
  constructor(protected override service = new ModelService()) {
    super(service);
  }
}
