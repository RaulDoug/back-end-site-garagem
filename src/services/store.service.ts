import { Store, storeRepository } from '#repositories/store.repository.js';
import { CreateStoreInput, UpdateStoreBody } from '#schemas/store.schema.js';
import { buildAddress } from '#utils/utils.js';
import { BaseService } from './base.service';
import AppError from '#src/errors/AppError.js';

export default class StoreService extends BaseService<Store> {
  constructor(private storeRepo = storeRepository) {
    super(storeRepo);
  }

  async create(data: CreateStoreInput): Promise<Store> {
    const { address, ...payload } = data;

    const cnpj = await this.storeRepo.findCnpj(payload.cnpj);

    if (cnpj !== null) {
      throw new AppError('CNPJ já cadastrado', 409);
    }

    const addressToUse = buildAddress(address);

    return await this.storeRepo.create({ address: addressToUse, ...payload });
  }

  async update(id: string, data: UpdateStoreBody): Promise<{ updated: boolean, store: Store }> {
    const { address, ...dataWithoutAddress } = data;

    const store = await this.storeRepo.findById(id);

    if (store === null) {
      throw new AppError('Nenhum cadastro de loja localizado para o ID informado', 404);
    }

    const addressToUse = address ? buildAddress(address) : undefined;

    const payload: Partial<Omit<Store, 'id' | 'created_at'>> = {
      address: addressToUse,
      ...dataWithoutAddress
    };

    const fieldsToUpdate: Record<string, unknown> = {};

    for (const key in payload) {
      const field = key as keyof Omit<Store, 'id' | 'created_at'>;

      if (payload[field] === undefined) continue;

      if (payload[field] !== store[field as keyof Store]) {
        fieldsToUpdate[key] = payload[field];
      }
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      return {
        updated: false,
        store
      };
    };

    if (fieldsToUpdate.cnpj) {
      const cnpj = await this.storeRepo.findCnpj(fieldsToUpdate.cnpj as string);

      if (cnpj !== null) throw new AppError('CNPJ já cadastrado', 409);
    }

    const result = await this.storeRepo.update(id, fieldsToUpdate);

    if (result === null) throw new AppError('Falha ao atualizar o cadastro', 500);

    return {
      updated: true,
      store: result,
    };
  };
}