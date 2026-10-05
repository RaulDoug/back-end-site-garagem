import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import UserService from '#services/user.service.js';

vi.mock('bcrypt');
vi.mock('jsonwebtoken');

describe('UserService', () => {
  const mockUserRepository = {
    findByEmail: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  };

  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService(mockUserRepository as any); // eslint-disable-line
  });

  describe('create', () => {
    it('deve gerar o hash da senha e criar o usuário quando os dados forem válidos', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      vi.mocked(bcrypt.hash).mockResolvedValue('senha_hasheada' as never);

      mockUserRepository.create.mockResolvedValue({
        id: 'uuid-123',
        name: 'Raul',
        email: 'raul@teste.com',
        phone: '37999999999',
        role: 'VENDEDOR',
      });


      const resultado = await userService.create({
        name: 'Raul',
        email: 'raul@teste.com',
        password: 'senha123',
        phone: '11999999999',
      });

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('raul@teste.com');
      expect(bcrypt.hash).toHaveBeenCalledWith('senha123', 10);
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ password_hash: 'senha_hasheada' })
      );
      expect(resultado).toHaveProperty('id', 'uuid-123');
    });

    it('deve lançar erro se o e-mail já estiver cadastrado', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({ id: 'uuid-existente' });

      await expect(
        userService.create({
          name: 'Raul',
          email: 'raul@teste.com',
          password: 'senha123',
          phone: '11999999999',
        })
      ).rejects.toThrow('E-mail já cadastrado');
    });
  });

  describe('authenticate', () => {
    it('deve autenticar e retornar token JWT quando as credenciais forem válidas', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({
        id: 'uuid-123',
        name: 'Raul',
        email: 'raul@teste.com',
        password_hash: 'hash_no_banco',
        role: 'VENDEDOR',
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(jwt.sign).mockReturnValue('jwt_token_simulado' as never);

      const resultado = await userService.login({ email: 'raul@teste.com', password: 'senha123' });

      expect(resultado).toHaveProperty('token', 'jwt_token_simulado');
      expect(resultado.user).not.toHaveProperty('password_hash');
    });

    it('deve lançar erro quando o e-mail não for encontrado', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(
        userService.login({ email: 'inexistente@teste.com', password: 'senha123' })
      ).rejects.toThrow('Credenciais inválidas');
    });

    it('deve lançar erro quando a senha estiver incorreta', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({
        id: 'uuid-123',
        email: 'raul@teste.com',
        password_hash: 'hash_no_banco',
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        userService.login({ email: 'raul@teste.com', password: 'senha_errada' })
      ).rejects.toThrow('Credenciais inválidas');
    });
  });
});