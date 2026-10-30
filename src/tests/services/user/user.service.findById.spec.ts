import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserService from '#services/user.service.js';
import {
  USER_ID,
  buildUser,
  safeUser,
} from './user.service.fixtures.js';
import {
  asUserRepository,
  createMockUserRepository,
} from './user.service.mocks.js';

vi.mock('bcrypt');
vi.mock('jsonwebtoken');

describe('UserService.findById', () => {
  const mockUserRepository = createMockUserRepository();
  let userService: UserService;

  beforeEach(() => {
    vi.resetAllMocks();
    userService = new UserService(asUserRepository(mockUserRepository));
  });

  it('deve buscar o usuário por id e retornar sem password_hash', async () => {
    mockUserRepository.findById.mockResolvedValue(buildUser());

    const resultado = await userService.findById(USER_ID);

    expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.findById).toHaveBeenCalledWith(USER_ID);
    expect(resultado).toEqual(safeUser);
    expect(resultado).not.toHaveProperty('password_hash');
  });

  it('deve lançar erro quando o usuário não for encontrado por id', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(userService.findById(USER_ID)).rejects.toThrow(
      'Usuário inexistente.'
    );

    expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.findById).toHaveBeenCalledWith(USER_ID);
  });
});
