import pool from '../config/database';
import BaseRepository from './base.repository';

export interface User {
  id: string;
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
  name: string;
  email: string;
  password_hash: string;
  phone: string;
  role?: string;
  commission_rates?: number;
}

export class UserRepository extends BaseRepository<User, CreateUserData> {
  constructor() {
    super('users');
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1;';
    const result = await pool.query<User>(query, [email]);

    return result.rows[0] || null;
  }

  async create(data: CreateUserData): Promise<User> {
    const query = `
      INSERT INTO users (name, email, password_hash, phone, role, commission_rates)
      VALUES ($1, $2, $3, $4, COALESCE($5, 'VENDEDOR')::users_roles_types, $6)
      RETURNING *;
    `;

    const values = [
      data.name,
      data.email,
      data.password_hash,
      data.phone,
      data.role || null,
      data.commission_rates || 0,
    ];

    const result = await pool.query<User>(query, values);
    return result.rows[0];
  }
}


export const userRepository = new UserRepository();
