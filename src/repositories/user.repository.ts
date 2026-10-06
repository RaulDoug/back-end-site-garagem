import { PoolClient } from 'pg';
import pool from '../config/database';
import { BaseRepository } from './base.repository';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  phone: string;
  role: 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';
  commission_rates: number | null;
  is_active: boolean;
  created_at: Date;
}

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  async findByEmail(email: string, client?: PoolClient): Promise<User | null> {
    const db = client ?? pool;

    const query = 'SELECT * FROM users WHERE email = $1 LIMIT 1;';
    const result = await db.query<User>(query, [email]);

    return result.rows[0] || null;
  }
}

export const userRepository = new UserRepository();
