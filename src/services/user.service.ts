import { FindData } from '#repositories/base.repository.js';
import { User, UserRepository, userRepository as defaultUserRepository } from '#repositories/user.repository.js';
import { StoreRepository, storeRepository as defaultStoreRepository } from '#repositories/store.repository.js';
import { CreateUserInput, LoginUserInput, UpdateUserBody } from '#schemas/user.schema.js';
import { AppError, BadRequestError, NotFoundError } from '#src/errors/app.error.js';
import { generateToken } from '#utils/jwt.util.js';
import { comparePassword, hashPassword } from '#utils/hash.util.js';

export default class UserService {
  constructor(
    private userRepository: UserRepository = defaultUserRepository,
    private readonly storeRepo: StoreRepository = defaultStoreRepository
  ) {}

  async create(data: CreateUserInput, tenantId?: string): Promise<Omit<User, 'password_hash'>> {
    if (!tenantId || tenantId.trim() === '') {
      throw new AppError('Tenant não identificado', 401);
    }

    const { password, ...dataWithoutPass } = data;
    const normalizedEmail = dataWithoutPass.email.toLowerCase();

    const existingUser = await this.userRepository.findByEmail(normalizedEmail, tenantId);
    if (existingUser !== null) {
      throw new AppError('E-mail já cadastrado', 409);
    }

    if (data.store_id) {
      const store = await this.storeRepo.findByIdAndTenant(data.store_id, tenantId);
      if (!store) {
        throw new AppError('Filial informada não encontrada nesta empresa', 404);
      }
    }

    const hashedPassword = await hashPassword(password);

    const payload = {
      ...dataWithoutPass,
      email: normalizedEmail,
      password_hash: hashedPassword,
      tenant_id: tenantId,
      store_id: data.store_id ?? null,
    };

    const result = await this.userRepository.create(payload);
    const { password_hash, ...userWithoutPassword } = result; // eslint-disable-line

    return userWithoutPassword;
  }

  async login(data: LoginUserInput): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
    const { email, password, tenant_id } = data;

    const user = await this.userRepository.findByEmail(email, tenant_id);
    if (user === null || !user.is_active) {
      throw new AppError('Credenciais inválidas', 401);
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      throw new AppError('Credenciais inválidas', 401);
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id ?? '',
      storeId: user.store_id ?? null,
    };

    const token = generateToken(payload);
    const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line

    return {
      token,
      user: { ...userWithoutPassword },
    };
  }

  async findById(id: string, tenantId?: string): Promise<Omit<User, 'password_hash'>> {
    const user = await this.userRepository.findById(id, tenantId);
    if (user === null) {
      throw new NotFoundError('Usuário inexistente.');
    }

    const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line
    return userWithoutPassword;
  }

  async find(filters: FindData = { filters: [] }, tenantId?: string): Promise<Omit<User, 'password_hash'>[]> {
    const effectiveFilters: FindData = {
      ...filters,
      filters: [...(filters?.filters || [])],
    };

    if (tenantId && !effectiveFilters.filters.some((f) => f.field === 'tenant_id')) {
      effectiveFilters.filters.push({
        field: 'tenant_id',
        operator: '=',
        value: tenantId,
      });
    }

    const users = await this.userRepository.find(effectiveFilters);

    return users.map((user) => {
      const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line
      return userWithoutPassword;
    });
  }

  async update(id: string, data: UpdateUserBody, tenantId?: string): Promise<Omit<User, 'password_hash'>> {
    const existingUser = await this.userRepository.findById(id, tenantId);
    if (existingUser === null) {
      throw new NotFoundError('Usuário inexistente.');
    }

    const userEmail = (data as { email?: string }).email;
    if (userEmail && userEmail.toLowerCase() !== existingUser.email.toLowerCase()) {
      const duplicate = await this.userRepository.findByEmail(userEmail.toLowerCase(), tenantId);
      if (duplicate && duplicate.id !== id) {
        throw new AppError('E-mail já em uso por outro usuário', 409);
      }
    }

    if (data.store_id && tenantId) {
      const store = await this.storeRepo.findByIdAndTenant(data.store_id, tenantId);
      if (!store) {
        throw new AppError('Filial informada não encontrada nesta empresa', 404);
      }
    }

    const updatedUser = await this.userRepository.update(id, data, tenantId);
    if (updatedUser === null) {
      throw new BadRequestError('Nenhum campo informado para atualização.');
    }

    const { password_hash, ...userWithoutPassword } = updatedUser; // eslint-disable-line
    return userWithoutPassword;
  }

  async delete(id: string, tenantId?: string): Promise<Omit<User, 'password_hash'>> {
    const existing = await this.userRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Usuário inexistente.');
    }

    const user = await this.userRepository.delete(id, tenantId);
    if (user === null) {
      throw new NotFoundError('Usuário inexistente.');
    }

    const { password_hash, ...userWithoutPassword } = user; // eslint-disable-line
    return userWithoutPassword;
  }
}
