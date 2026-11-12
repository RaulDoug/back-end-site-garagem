import pool from '#src/config/database.js';
import BaseRepository from '#repositories/base.repository.js';

export interface User {
  id: string;
  tenant_id: string;
  store_id: string | null;
  name: string;
  email: string;
  password_hash: string;
  phone: string;
  role: 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';
  commission_rates: number | null;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
}

export interface CreateUserData {
  tenant_id?: string;
  store_id?: string | null;
  name: string;
  email: string;
  password_hash: string;
  phone: string;
  role?: string;
  commission_rates?: number | null;
}

export class UserRepository extends BaseRepository<User, CreateUserData> {
  protected override columns = [
    'id',
    'tenant_id',
    'store_id',
    'name',
    'email',
    'password_hash',
    'phone',
    'role',
    'commission_rates',
    'is_active',
    'deleted_at',
    'created_at',
  ];

  constructor() {
    super('users');
  }

  async findByEmail(email: string, tenantId?: string): Promise<User | null> {
    let query: string;
    let values: unknown[];

    if (tenantId) {
      query = 'SELECT * FROM users WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) AND deleted_at IS NULL LIMIT 1;';
      values = [tenantId, email];
    } else {
      query = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1;';
      values = [email];
    }

    const result = await pool.query<User>(query, values);
    return result.rows[0] || null;
  }

  override async create(data: CreateUserData): Promise<User> {
    const query = `
      INSERT INTO users (tenant_id, store_id, name, email, password_hash, phone, role, commission_rates)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'VENDEDOR')::users_roles_types, $8)
      RETURNING *;
    `;

    const values = [
      data.tenant_id,
      data.store_id ?? null,
      data.name,
      data.email,
      data.password_hash,
      data.phone,
      data.role || null,
      data.commission_rates ?? null,
    ];

    const result = await pool.query<User>(query, values);
    return result.rows[0];
  }
}

export const userRepository = new UserRepository();
