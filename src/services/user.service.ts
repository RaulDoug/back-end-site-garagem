import { User, UserRepository } from '#repositories/user.repository.js';
import { CreateUserInput, LoginUserInput, UpdateUserBody } from '#schemas/user.schema.js';
import { generateToken } from '#utils/jwt.util.js';
import { comparePassword, hashPassword } from '../utils/hash.util';

export default class UserService {
  constructor(private userRepository = new UserRepository()) { };

  async create(data: CreateUserInput): Promise<Omit<User, 'password_hash'>> {
    const { password, ...dataWithoutPass } = data;

    const existingUser = await this.userRepository.findByEmail(dataWithoutPass.email);

    if (existingUser !== null) {
      throw new Error('E-mail já cadastrado');
    }

    const hashedPassword = await hashPassword(password);

    const payload = {
      ...dataWithoutPass,
      password_hash: hashedPassword,
    };

    const result = await this.userRepository.create(payload);

    const { password_hash, ...userWithoutPassword } = result; // eslint-disable-line

    return userWithoutPassword;
  }

  async login(data: LoginUserInput): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
    const { email, password } = data;

    const user = await this.userRepository.findByEmail(email);

    const isMatch = user ? await comparePassword(password, user.password_hash) : false;

    if (user === null || isMatch === false) {
      throw new Error('Credenciais inválidas');
    };

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const token = generateToken(payload);

    const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line

    const response = {
      token: token,
      user: { ...userWithoutPassword },
    };

    return response;
  }

  async findById(id: string): Promise<Omit<User, 'password_hash'>> {
    const user = await this.userRepository.findById(id);

    if (user === null) {
      throw new Error('Usuário inexistente.');
    }

    const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line

    return userWithoutPassword;
  }

  async findAll(include_deleted: boolean, role: string): Promise<Omit<User, 'password_hash'>[]> {

    const includeDeleted = role === 'ADMIN' ? include_deleted : false;

    const users = await this.userRepository.findAll(includeDeleted);

    return users.map((user) => {
      const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line
      return userWithoutPassword;
    });
  }

  async update(id: string, data: UpdateUserBody): Promise<Omit<User, 'password_hash'>> {
    const existingUser = await this.userRepository.findById(id);

    if (existingUser === null) {
      throw new Error('Usuário inexistente.');
    }

    const updatedUser = await this.userRepository.update(id, data);

    if (updatedUser === null) {
      throw new Error('Nenhum campo informado para atualização.');
    }

    const { password_hash, ...userWithoutPassword } = updatedUser; // eslint-disable-line

    return userWithoutPassword;
  }

  async delete(id: string): Promise<Omit<User, 'password_hash'>> {
    const user = await this.userRepository.delete(id);

    if (user === null) {
      throw new Error('Usuário inexistente.');
    }

    const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line

    return userWithoutPassword;
  }
}