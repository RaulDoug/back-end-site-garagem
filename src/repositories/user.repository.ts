import pool from '../config/database';

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

export interface CreateUserData {
  name: string;
  email: string;
  password_hash: string;
  phone: string;
  role?: string;
  commission_rates?: number;
}

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1 LIMIT 1;';
    const result = await pool.query<User>(query, [email]);

    return result.rows[0] || null;
  }

  async findById(id: string): Promise<User | null> {
    const query = 'SELECT * from users WHERE id = $1 LIMIT 1;';
    const result = await pool.query<User>(query, [id]);

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
      data.commission_rates || null,
    ];

    const result = await pool.query<User>(query, values);
    return result.rows[0];
  }

  async update(id: string, data: Partial<CreateUserData>): Promise<User | null> {
    const fields = Object.keys(data);
    const values = Object.values(data);

    if (fields.length === 0) return null;

    // Gerar dinâmicamente a clausula do set
    const setClause = fields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');

    // Definir o id sempre como ultimo parâmetro da query
    const idIndex = fields.length + 1;

    const query = `
      UPDATE users
      SET ${setClause}
      WHERE id = $${idIndex}
      RETURNING *;
    `;

    const result = await pool.query<User>(query, [...values, id]);

    return result.rows[0] || null;
  }

  async delete(id: string): Promise<User | null> {
    const query = 'DELETE FROM users WHERE id = $1 RETURNIG *;';

    const result = await pool.query<User>(query, [id]);

    return result.rows[0] || null;
  }
}


export const userRepository = new UserRepository();
