import type { Pool } from 'pg';
import pool from '#src/config/database.js';
import BaseRepository from '#repositories/base.repository.js';
import { BadRequestError } from '#src/errors/app.error.js';

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

  constructor(customPool: Pool = pool) {
    super('users', {}, customPool);
  }

  async findByEmail(email: string, tenantId?: string): Promise<User | null> {
    if (tenantId !== undefined && (typeof tenantId !== 'string' || tenantId.trim() === '')) {
      throw new BadRequestError('Identificador de tenant inválido');
    }

    let query: string;
    let values: unknown[];

    if (tenantId) {
      query = 'SELECT * FROM users WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) AND deleted_at IS NULL LIMIT 1;';
      values = [tenantId, email];
    } else {
      query = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1;';
      values = [email];
    }

    const result = await this.pool.query<User>(query, values);
    return result.rows[0] || null;
  }

  async findAllActiveByEmail(email: string): Promise<User[]> {
    const query = `
      SELECT u.*
      FROM users u
      INNER JOIN tenants t ON t.id = u.tenant_id
      LEFT JOIN stores s ON s.id = u.store_id AND s.tenant_id = u.tenant_id
      WHERE LOWER(u.email) = LOWER($1)
        AND u.deleted_at IS NULL
        AND u.is_active = true
        AND t.deleted_at IS NULL
        AND t.is_active = true
        AND (u.store_id IS NULL OR (s.id IS NOT NULL AND s.deleted_at IS NULL AND s.is_active = true))
      ORDER BY u.created_at ASC;
    `;
    const result = await this.pool.query<User>(query, [email]);
    return result.rows;
  }

  async findAuthUserById(id: string): Promise<User | null> {
    const query = `
      SELECT u.*
      FROM users u
      INNER JOIN tenants t ON t.id = u.tenant_id
      LEFT JOIN stores s ON s.id = u.store_id AND s.tenant_id = u.tenant_id
      WHERE u.id = $1
        AND u.deleted_at IS NULL
        AND u.is_active = true
        AND t.deleted_at IS NULL
        AND t.is_active = true
        AND (u.store_id IS NULL OR (s.id IS NOT NULL AND s.deleted_at IS NULL AND s.is_active = true))
      LIMIT 1;
    `;
    const result = await this.pool.query<User>(query, [id]);
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

    const result = await this.pool.query<User>(query, values);
    return result.rows[0];
  }
}

export const userRepository = new UserRepository();
