import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import UserService from '#services/user.service.js';
import {
  PASSWORD_HASH,
  USER_EMAIL,
  USER_ID,
  USER_PASSWORD,
  buildUser,
  safeUser,
} from './user.service.fixtures.js';
import {
  asUserRepository,
  createMockUserRepository,
} from './user.service.mocks.js';

vi.mock('bcrypt');
vi.mock('jsonwebtoken');

describe('UserService.login', () => {
  const mockUserRepository = createMockUserRepository();
  let userService: UserService;

  beforeEach(() => {
    vi.resetAllMocks();
    userService = new UserService(asUserRepository(mockUserRepository));
  });

  it('deve autenticar e retornar token JWT e usuário sem password_hash quando as credenciais forem válidas', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(buildUser());
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(jwt.sign).mockReturnValue('jwt_token_simulado' as never);

    const resultado = await userService.login({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });

    expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(USER_EMAIL);
    expect(resultado).toEqual({
      token: 'jwt_token_simulado',
      user: safeUser,
    });
    expect(resultado.user).not.toHaveProperty('password_hash');
  });

  it('deve comparar a senha informada com o password_hash armazenado', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(buildUser());
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(jwt.sign).mockReturnValue('jwt_token_simulado' as never);

    await userService.login({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });

    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    expect(bcrypt.compare).toHaveBeenCalledWith(USER_PASSWORD, PASSWORD_HASH);
  });

  it('deve gerar o token com id, email, role e expiração de 30 dias', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(buildUser());
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(jwt.sign).mockReturnValue('jwt_token_simulado' as never);

    await userService.login({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });

    expect(jwt.sign).toHaveBeenCalledTimes(1);
    expect(jwt.sign).toHaveBeenCalledWith(
      {
        id: USER_ID,
        email: USER_EMAIL,
        role: 'VENDEDOR',
      },
      expect.any(String),
      { expiresIn: '30d' }
    );
  });

  it('deve lançar erro quando o e-mail não for encontrado e não deve comparar senha nem gerar token', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);

    await expect(
      userService.login({
        email: 'inexistente@garagem.com',
        password: USER_PASSWORD,
      })
    ).rejects.toThrow('Credenciais inválidas');

    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
      'inexistente@garagem.com'
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('deve lançar erro quando a senha estiver incorreta e não deve gerar token', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(buildUser());
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      userService.login({
        email: USER_EMAIL,
        password: 'SenhaErrada123!',
      })
    ).rejects.toThrow('Credenciais inválidas');

    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    expect(bcrypt.compare).toHaveBeenCalledWith(
      'SenhaErrada123!',
      PASSWORD_HASH
    );
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('deve propagar o erro de comparação da senha', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(buildUser());
    vi.mocked(bcrypt.compare).mockRejectedValue(
      new Error('Falha ao comparar senhas')
    );

    await expect(
      userService.login({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      })
    ).rejects.toThrow('Falha ao comparar senhas');

    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('deve propagar o erro ao gerar o token JWT', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(buildUser());
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(jwt.sign).mockImplementation(() => {
      throw new Error('Falha ao assinar o token');
    });

    await expect(
      userService.login({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      })
    ).rejects.toThrow('Falha ao assinar o token');

    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('deve lançar erro 401 quando o usuário estiver inativo (is_active = false)', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(buildUser({ is_active: false }));
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await expect(
      userService.login({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      })
    ).rejects.toThrow('Credenciais inválidas');

    expect(jwt.sign).not.toHaveBeenCalled();
  });
});
