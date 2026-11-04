import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserService from '#services/user.service.js';
import type { FindData } from '#repositories/base.repository.js';
import {
  PASSWORD_HASH,
  buildUser,
  otherSafeUser,
  safeUser,
} from './user.service.fixtures.js';
import {
  asUserRepository,
  createMockUserRepository,
} from './user.service.mocks.js';

vi.mock('bcrypt');
vi.mock('jsonwebtoken');

describe('UserService.find', () => {
  const mockUserRepository = createMockUserRepository();
  let userService: UserService;

  beforeEach(() => {
    vi.resetAllMocks();
    userService = new UserService(asUserRepository(mockUserRepository));
  });

  it('deve repassar filters ao repositório', async () => {
    mockUserRepository.find.mockResolvedValue([
      buildUser(),
      buildUser({ ...otherSafeUser, password_hash: PASSWORD_HASH }),
    ]);

    const filters: FindData = { filters: [], includeDeleted: true };
    const resultado = await userService.find(filters);

    expect(mockUserRepository.find).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.find).toHaveBeenCalledWith(filters);
    expect(resultado).toEqual([safeUser, otherSafeUser]);
  });

  it('deve retornar uma lista vazia quando o repositório não encontrar usuários', async () => {
    mockUserRepository.find.mockResolvedValue([]);

    const filters: FindData = { filters: [] };
    const resultado = await userService.find(filters);

    expect(resultado).toEqual([]);
    expect(resultado).toHaveLength(0);
    expect(mockUserRepository.find).toHaveBeenCalledWith(filters);
  });

  it('deve remover password_hash de todos os usuários retornados', async () => {
    mockUserRepository.find.mockResolvedValue([
      buildUser(),
      buildUser({ ...otherSafeUser, password_hash: PASSWORD_HASH }),
    ]);

    const filters: FindData = { filters: [], includeDeleted: false };
    const resultado = await userService.find(filters);

    expect(resultado).toHaveLength(2);
    resultado.forEach((user) => {
      expect(user).not.toHaveProperty('password_hash');
      expect(Object.keys(user)).not.toContain('password_hash');
    });
    expect(resultado).toEqual([safeUser, otherSafeUser]);
  });
});
