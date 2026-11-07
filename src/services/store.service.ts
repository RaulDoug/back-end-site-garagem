import { CreateStoreData, Store, StoreRepository } from '#repositories/store.repository.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';
import BaseService from '#services/base.service.js';

export default class StoreService extends BaseService<Store, CreateStoreData> {
  constructor(protected override repository = new StoreRepository()) {
    super(repository);
  }

  async findByCNPJ(cnpj: string): Promise<Store | null> {
    const store = await this.repository.findByCNPJ(cnpj);

    if (store === null) {
      throw new NotFoundError(`Loja com CNPJ ${cnpj} não encontrada`);
    }

    return store;
  }

  async create(data: CreateStoreData): Promise<Store> {
    const existingStore = await this.repository.findByCNPJ(data.cnpj);

    if (existingStore !== null) {
      throw new AppError('CNPJ já cadastrado', 409);
    }

    return await super.create(data);
  }


  async update(id: string, data: Partial<CreateStoreData>): Promise<Store> {
    if (data.cnpj) {
      const existingStore = await this.repository.findByCNPJ(data.cnpj);

      if (existingStore !== null && existingStore.id !== id) {
        throw new AppError('CNPJ já em uso por outra loja', 409);
      }
    }

    return await super.update(id, data);
  }
}