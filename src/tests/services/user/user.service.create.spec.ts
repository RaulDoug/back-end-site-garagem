import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import UserService from '#services/user.service.js';
import {
  HASHED_PASSWORD,
  OTHER_USER_ID,
  USER_EMAIL,
  USER_PASSWORD,
  buildUser,
  createInput,
  safeUser,
} from './user.service.fixtures.js';
import {
  asUserRepository,
  createMockUserRepository,
} from './user.service.mocks.js';

vi.mock('bcrypt');
vi.mock('jsonwebtoken');

describe('UserService.create', () => {
  const mockUserRepository = createMockUserRepository();
  let userService: UserService;

  beforeEach(() => {
    vi.resetAllMocks();
    userService = new UserService(asUserRepository(mockUserRepository));
  });

  it('deve criar o usuário com os dados informados e retornar o registro persistido', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue(HASHED_PASSWORD as never);
    mockUserRepository.create.mockResolvedValue(buildUser());

    const resultado = await userService.create({
      ...createInput,
      role: 'VENDEDOR',
      commission_rates: 7.5,
    });

    expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(USER_EMAIL);
    expect(bcrypt.hash).toHaveBeenCalledTimes(1);
    expect(bcrypt.hash).toHaveBeenCalledWith(USER_PASSWORD, 10);
    expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual(safeUser);
  });

  it('deve retornar o usuário criado sem a propriedade password_hash', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue(HASHED_PASSWORD as never);
    mockUserRepository.create.mockResolvedValue(buildUser());

    const resultado = await userService.create({
      ...createInput,
      role: 'VENDEDOR',
      commission_rates: 7.5,
    });

    expect(resultado).not.toHaveProperty('password_hash');
    expect(Object.keys(resultado)).not.toContain('password_hash');
    expect(resultado).toEqual(safeUser);
  });

  it('deve enviar password_hash ao repositório e não enviar a senha em texto puro', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue(HASHED_PASSWORD as never);
    mockUserRepository.create.mockResolvedValue(buildUser());

    await userService.create({
      ...createInput,
      role: 'VENDEDOR',
      commission_rates: 7.5,
    });

    expect(mockUserRepository.create).toHaveBeenCalledWith({
      name: 'Raul Ferreira',
      email: USER_EMAIL,
      phone: '(37) 99999-9999',
      role: 'VENDEDOR',
      commission_rates: 7.5,
      password_hash: HASHED_PASSWORD,
    });

    const payload = mockUserRepository.create.mock.calls[0][0];
    expect(payload).not.toHaveProperty('password');
  });

  it('deve repassar role e commission_rates ao repositório', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue(HASHED_PASSWORD as never);
    mockUserRepository.create.mockResolvedValue(
      buildUser({ role: 'ADMIN', commission_rates: 12.5 })
    );

    const resultado = await userService.create({
      ...createInput,
      role: 'ADMIN',
      commission_rates: 12.5,
    });

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'ADMIN',
        commission_rates: 12.5,
      })
    );

    const payload = mockUserRepository.create.mock.calls[0][0];
    expect(payload.role).toBe('ADMIN');
    expect(payload.commission_rates).toBe(12.5);
    expect(resultado).toEqual({
      ...safeUser,
      role: 'ADMIN',
      commission_rates: 12.5,
    });
  });

  it('não deve criar o usuário quando o e-mail já estiver cadastrado', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(
      buildUser({ id: OTHER_USER_ID, email: USER_EMAIL })
    );

    await expect(userService.create(createInput)).rejects.toThrow(
      'E-mail já cadastrado'
    );

    expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(USER_EMAIL);
    expect(mockUserRepository.create).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it('deve propagar o erro do repositório ao criar o usuário', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue(HASHED_PASSWORD as never);
    mockUserRepository.create.mockRejectedValue(
      new Error('Falha ao inserir usuário no banco de dados')
    );

    await expect(userService.create(createInput)).rejects.toThrow(
      'Falha ao inserir usuário no banco de dados'
    );

    expect(bcrypt.hash).toHaveBeenCalledWith(USER_PASSWORD, 10);
    expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
  });

  it('deve propagar o erro ao gerar o hash da senha', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockRejectedValue(
      new Error('Falha ao gerar hash da senha')
    );

    await expect(userService.create(createInput)).rejects.toThrow(
      'Falha ao gerar hash da senha'
    );

    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(USER_EMAIL);
    expect(mockUserRepository.create).not.toHaveBeenCalled();
  });
});
