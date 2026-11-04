import { vi } from 'vitest';
import type { UserRepository } from '#repositories/user.repository.js';

export const createMockUserRepository = () => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

export type MockUserRepository = ReturnType<typeof createMockUserRepository>;

export const asUserRepository = (
  mockUserRepository: MockUserRepository
): UserRepository => mockUserRepository as unknown as UserRepository;
