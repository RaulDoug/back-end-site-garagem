import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserService from '#services/user.service.js';
import type { UpdateUserBody } from '#schemas/user.schema.js';
import {
  USER_EMAIL,
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

describe('UserService.update', () => {
  const mockUserRepository = createMockUserRepository();
  let userService: UserService;

  beforeEach(() => {
    vi.resetAllMocks();
    userService = new UserService(asUserRepository(mockUserRepository));
  });

  it('deve atualizar o usuário e retornar o registro atualizado sem password_hash', async () => {
    const updateData: UpdateUserBody = {
      name: 'Raul Ferreira Junior',
      phone: '(37) 98888-7777',
      role: 'ADMIN',
      commission_rates: 10,
    };

    mockUserRepository.findById.mockResolvedValue(buildUser());
    mockUserRepository.update.mockResolvedValue(buildUser({ ...updateData }));

    const resultado = await userService.update(USER_ID, updateData);

    expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.findById).toHaveBeenCalledWith(USER_ID);
    expect(mockUserRepository.update).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.update).toHaveBeenCalledWith(USER_ID, updateData);
    expect(resultado).toEqual({ ...safeUser, ...updateData });
    expect(resultado).not.toHaveProperty('password_hash');
  });

  it('deve lançar erro e não chamar update quando o usuário não existir', async () => {
    const updateData: UpdateUserBody = { name: 'Raul Ferreira Junior' };
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(userService.update(USER_ID, updateData)).rejects.toThrow(
      'Usuário inexistente.'
    );

    expect(mockUserRepository.findById).toHaveBeenCalledWith(USER_ID);
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it('deve lançar erro quando o repositório não retornar nenhum campo para atualização', async () => {
    const emptyUpdate: UpdateUserBody = {};
    mockUserRepository.findById.mockResolvedValue(buildUser());
    mockUserRepository.update.mockResolvedValue(null);

    await expect(userService.update(USER_ID, emptyUpdate)).rejects.toThrow(
      'Nenhum campo informado para atualização.'
    );

    expect(mockUserRepository.findById).toHaveBeenCalledWith(USER_ID);
    expect(mockUserRepository.update).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.update).toHaveBeenCalledWith(USER_ID, {});
  });

  it('deve remover password_hash do usuário atualizado', async () => {
    const updateData: UpdateUserBody = { name: 'Raul Ferreira Junior' };
    mockUserRepository.findById.mockResolvedValue(buildUser());
    mockUserRepository.update.mockResolvedValue(
      buildUser({ name: 'Raul Ferreira Junior' })
    );

    const resultado = await userService.update(USER_ID, updateData);

    expect(resultado).not.toHaveProperty('password_hash');
    expect(Object.keys(resultado)).not.toContain('password_hash');
    expect(resultado.name).toBe('Raul Ferreira Junior');
    expect(resultado.email).toBe(USER_EMAIL);
  });
});
