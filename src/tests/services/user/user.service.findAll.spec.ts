import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserService from '#services/user.service.js';
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

describe('UserService.findAll', () => {
  const mockUserRepository = createMockUserRepository();
  let userService: UserService;

  beforeEach(() => {
    vi.resetAllMocks();
    userService = new UserService(asUserRepository(mockUserRepository));
  });

  it('deve repassar include_deleted=true ao repositório quando o solicitante for ADMIN', async () => {
    mockUserRepository.findAll.mockResolvedValue([
      buildUser(),
      buildUser({ ...otherSafeUser, password_hash: PASSWORD_HASH }),
    ]);

    const resultado = await userService.findAll(true, 'ADMIN');

    expect(mockUserRepository.findAll).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.findAll).toHaveBeenCalledWith(true);
    expect(resultado).toEqual([safeUser, otherSafeUser]);
  });

  it('deve repassar include_deleted=false ao repositório quando ADMIN não solicitar deletados', async () => {
    mockUserRepository.findAll.mockResolvedValue([]);

    const resultado = await userService.findAll(false, 'ADMIN');

    expect(mockUserRepository.findAll).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.findAll).toHaveBeenCalledWith(false);
    expect(resultado).toEqual([]);
  });

  it.each(['VENDEDOR', 'VISUALIZADOR', 'PUBLICO'] as const)(
    'deve forçar include_deleted=false quando o solicitante for %s',
    async (role) => {
      mockUserRepository.findAll.mockResolvedValue([]);

      await userService.findAll(true, role);

      expect(mockUserRepository.findAll).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findAll).toHaveBeenCalledWith(false);
    }
  );

  it('deve retornar uma lista vazia quando não houver usuários', async () => {
    mockUserRepository.findAll.mockResolvedValue([]);

    const resultado = await userService.findAll(false, 'ADMIN');

    expect(resultado).toEqual([]);
    expect(resultado).toHaveLength(0);
    expect(mockUserRepository.findAll).toHaveBeenCalledWith(false);
  });

  it('deve remover password_hash de todos os usuários retornados', async () => {
    mockUserRepository.findAll.mockResolvedValue([
      buildUser(),
      buildUser({ ...otherSafeUser, password_hash: PASSWORD_HASH }),
    ]);

    const resultado = await userService.findAll(false, 'ADMIN');

    expect(resultado).toHaveLength(2);
    resultado.forEach((user) => {
      expect(user).not.toHaveProperty('password_hash');
      expect(Object.keys(user)).not.toContain('password_hash');
    });
    expect(resultado).toEqual([safeUser, otherSafeUser]);
  });
});
