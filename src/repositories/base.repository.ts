import pool from '../config/database';
import { QueryResultRow } from 'pg';


export default class BaseRepository<T extends QueryResultRow> {
    constructor(protected tableName: string) {}

    async findById(id: string): Promise<T | null> {
        const query = `
            SELECT * FROM ${this.tableName} 
            WHERE id = $1 
            AND deleted_at IS NULL 
            LIMIT 1;
        `;

        const result = await pool.query<T>(query, [id]);

        return result.rows[0] || null;
    }

    async findAll(include_deleted: boolean): Promise<T[]> {
        let query = `SELECT * FROM ${this.tableName}`;

        if (!include_deleted) {
            query += ' WHERE deleted_at IS NULL';
        }

        const result = await pool.query<T>(query);

        return result.rows;
    }
}