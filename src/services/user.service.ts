import { User, userRepository } from '#repositories/user.repository.js';
import { CreateUserInput, LoginUserInput } from '#schemas/user.schema.js';
import { generateToken } from '#utils/jwt.util.js';
import { comparePassword, hashPassword } from '../utils/hash.util';
import { BaseService } from './base.service';

export default class UserService extends BaseService<User> {
  constructor(private userRepo = userRepository) {
    super(userRepo);
  };

  async create(data: CreateUserInput): Promise<Omit<User, 'password_hash'>> {
    const { password, ...dataWithoutPass } = data;

    const existingUser = await this.userRepo.findByEmail(dataWithoutPass.email);

    if (existingUser !== null) {
      throw new Error('E-mail já cadastrado');
    }

    const hashedPassword = await hashPassword(password);

    const payload = {
      ...dataWithoutPass,
      password_hash: hashedPassword,
    };

    const result = await this.userRepo.create(payload);

    const { password_hash, ...userWithoutPassword } = result; // eslint-disable-line

    return userWithoutPassword;
  }

  async login(data: LoginUserInput): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
    const { email, password } = data;

    const user = await this.userRepo.findByEmail(email);

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
};