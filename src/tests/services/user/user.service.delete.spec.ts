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

describe('UserService.delete', () => {
  const mockUserRepository = createMockUserRepository();
  let userService: UserService;

  beforeEach(() => {
    vi.resetAllMocks();
    userService = new UserService(asUserRepository(mockUserRepository));
  });

  it('deve deletar o usuário e retornar o registro com deleted_at e is_active=false, sem password_hash', async () => {
    const deletedAt = new Date('2026-03-05T14:45:00.000Z');
    mockUserRepository.delete.mockResolvedValue(
      buildUser({ deleted_at: deletedAt, is_active: false })
    );

    const resultado = await userService.delete(USER_ID);

    expect(mockUserRepository.delete).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.delete).toHaveBeenCalledWith(USER_ID);
    expect(resultado).toEqual({
      ...safeUser,
      deleted_at: deletedAt,
      is_active: false,
    });
    expect(resultado).not.toHaveProperty('password_hash');
  });

  it('deve lançar erro quando o usuário a ser deletado não existir', async () => {
    mockUserRepository.delete.mockResolvedValue(null);

    await expect(userService.delete(USER_ID)).rejects.toThrow(
      'Usuário inexistente.'
    );

    expect(mockUserRepository.delete).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.delete).toHaveBeenCalledWith(USER_ID);
  });

  it('deve remover password_hash do usuário deletado', async () => {
    mockUserRepository.delete.mockResolvedValue(
      buildUser({
        deleted_at: new Date('2026-03-05T14:45:00.000Z'),
        is_active: false,
      })
    );

    const resultado = await userService.delete(USER_ID);

    expect(resultado).not.toHaveProperty('password_hash');
    expect(Object.keys(resultado)).not.toContain('password_hash');
    expect(resultado.is_active).toBe(false);
  });
});
