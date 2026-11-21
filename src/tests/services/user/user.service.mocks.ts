import { vi } from 'vitest';
import type { UserRepository } from '#repositories/user.repository.js';
import type { StoreRepository } from '#repositories/store.repository.js';

export const createMockUserRepository = () => ({
  findByEmail: vi.fn(),
  findAllActiveByEmail: vi.fn(),
  findAuthUserById: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

export const createMockStoreRepository = () => ({
  findById: vi.fn(),
  findByIdAndTenant: vi.fn(),
  findByCNPJ: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

export type MockUserRepository = ReturnType<typeof createMockUserRepository>;
export type MockStoreRepository = ReturnType<typeof createMockStoreRepository>;

export const asUserRepository = (
  mockUserRepository: MockUserRepository
): UserRepository => mockUserRepository as unknown as UserRepository;

export const asStoreRepository = (
  mockStoreRepository: MockStoreRepository
): StoreRepository => mockStoreRepository as unknown as StoreRepository;
