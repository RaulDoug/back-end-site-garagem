import { FindData } from '#repositories/base.repository.js';
import { User, UserRepository } from '#repositories/user.repository.js';
import { CreateUserInput, LoginUserInput, UpdateUserBody } from '#schemas/user.schema.js';
import { AppError, BadRequestError, NotFoundError } from '#src/errors/app.error.js';
import { generateToken } from '#utils/jwt.util.js';
import { comparePassword, hashPassword } from '#utils/hash.util.js';

export default class UserService {
  constructor(private userRepository = new UserRepository()) {};

  async create(data: CreateUserInput): Promise<Omit<User, 'password_hash'>> {
    const { password, ...dataWithoutPass } = data;

    const normalizedEmail = dataWithoutPass.email.toLowerCase();

    const existingUser = await this.userRepository.findByEmail(normalizedEmail);

    if (existingUser !== null) {
      throw new AppError('E-mail já cadastrado', 409);
    }

    const hashedPassword = await hashPassword(password);

    const payload = {
      ...dataWithoutPass,
      email: normalizedEmail,
      password_hash: hashedPassword,
    };

    const result = await this.userRepository.create(payload);

    const { password_hash, ...userWithoutPassword } = result; // eslint-disable-line

    return userWithoutPassword;
  }

  async login(data: LoginUserInput): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
    const { email, password } = data;

    const user = await this.userRepository.findByEmail(email);

    if (user === null || !user.is_active) {
      throw new AppError('Credenciais inválidas', 401);
    }

    const isMatch = await comparePassword(password, user.password_hash);

    if (isMatch === false) {
      throw new AppError('Credenciais inválidas', 401);
    }

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
      throw new NotFoundError('Usuário inexistente.');
    }

    const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line

    return userWithoutPassword;
  }

  async find(filters: FindData): Promise<Omit<User, 'password_hash'>[]> {
    const users = await this.userRepository.find(filters);

    return users.map((user) => {
      const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line
      return userWithoutPassword;
    });
  }

  async update(id: string, data: UpdateUserBody): Promise<Omit<User, 'password_hash'>> {
    const existingUser = await this.userRepository.findById(id);

    if (existingUser === null) {
      throw new NotFoundError('Usuário inexistente.');
    }

    const updatedUser = await this.userRepository.update(id, data);

    if (updatedUser === null) {
      throw new BadRequestError('Nenhum campo informado para atualização.');
    }

    const { password_hash, ...userWithoutPassword } = updatedUser; // eslint-disable-line

    return userWithoutPassword;
  }

  async delete(id: string): Promise<Omit<User, 'password_hash'>> {
    const user = await this.userRepository.delete(id);

    if (user === null) {
      throw new NotFoundError('Usuário inexistente.');
    }

    const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line

    return userWithoutPassword;
  }
}