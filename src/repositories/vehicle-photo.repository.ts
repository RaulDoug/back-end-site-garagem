import pool from '#src/config/database.js';
import { AppError } from '#src/errors/app.error.js';

export interface VehiclePhoto {
  id: string;
  vehicle_id: string;
  thumb_path: string;
  full_path: string;
  display_order: number;
  is_primary: boolean;
  created_at: Date;
}

export interface CreatePhotoData {
  thumb_path: string;
  full_path: string;
  display_order: number;
  is_primary: boolean;
}

export class VehiclePhotoRepository {
  /**
   * Insere múltiplas fotos em lote vinculadas a um veículo.
   */
  async createMany(vehicleId: string, photos: CreatePhotoData[]): Promise<VehiclePhoto[]> {
    if (photos.length === 0) {
      return [];
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const valueRows: string[] = [];
      const values: unknown[] = [vehicleId];
      let paramIndex = 2;

      for (const photo of photos) {
        valueRows.push(
          `($1, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );
        values.push(photo.thumb_path, photo.full_path, photo.display_order, photo.is_primary);
      }

      const query = `
        INSERT INTO vehicle_photos (vehicle_id, thumb_path, full_path, display_order, is_primary)
        VALUES ${valueRows.join(', ')}
        RETURNING id, vehicle_id, thumb_path, full_path, display_order, is_primary, created_at
      `;

      const result = await client.query<VehiclePhoto>(query, values);
      await client.query('COMMIT');
      return result.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retorna as fotos de um veículo ordenadas por display_order ASC.
   */
  async findByVehicleId(vehicleId: string): Promise<VehiclePhoto[]> {
    const query = `
      SELECT id, vehicle_id, thumb_path, full_path, display_order, is_primary, created_at
      FROM vehicle_photos
      WHERE vehicle_id = $1
      ORDER BY display_order ASC, created_at ASC
    `;
    const result = await pool.query(query, [vehicleId]);
    return result.rows;
  }

  /**
   * Busca uma foto específica pelo ID.
   */
  async findById(id: string): Promise<VehiclePhoto | null> {
    const query = `
      SELECT id, vehicle_id, thumb_path, full_path, display_order, is_primary, created_at
      FROM vehicle_photos
      WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Retorna a contagem total de fotos e o maior display_order atual do veículo.
   */
  async countByVehicleId(vehicleId: string): Promise<{ count: number; maxOrder: number }> {
    const query = `
      SELECT 
        COUNT(*)::int AS count,
        COALESCE(MAX(display_order), -1)::int AS max_order
      FROM vehicle_photos
      WHERE vehicle_id = $1
    `;
    const result = await pool.query(query, [vehicleId]);
    const row = result.rows[0];
    return {
      count: row ? Number(row.count) : 0,
      maxOrder: row ? Number(row.max_order) : -1,
    };
  }

  /**
   * Reordena atomicamente as fotos do veículo em uma transação (ACID).
   * Define is_primary = true apenas para o índice 0 (RN008).
   */
  async reorder(vehicleId: string, photoIds: string[]): Promise<VehiclePhoto[]> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Valida se todos os photoIds pertencem ao veículo
      const checkQuery = `
        SELECT id FROM vehicle_photos
        WHERE vehicle_id = $1 AND id = ANY($2::uuid[])
      `;
      const checkRes = await client.query(checkQuery, [vehicleId, photoIds]);

      if (checkRes.rows.length !== photoIds.length) {
        throw new AppError('Um ou mais IDs de foto informados não pertencem a este veículo', 400);
      }

      // Atualiza display_order e is_primary para cada foto
      for (let index = 0; index < photoIds.length; index++) {
        const photoId = photoIds[index];
        const isPrimary = index === 0;

        await client.query(
          `UPDATE vehicle_photos
           SET display_order = $1, is_primary = $2
           WHERE id = $3 AND vehicle_id = $4`,
          [index, isPrimary, photoId, vehicleId]
        );
      }

      await client.query('COMMIT');

      // Retorna as fotos na nova ordem
      const updatedRes = await client.query(
        `SELECT id, vehicle_id, thumb_path, full_path, display_order, is_primary, created_at
         FROM vehicle_photos
         WHERE vehicle_id = $1
         ORDER BY display_order ASC`,
        [vehicleId]
      );

      return updatedRes.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove uma foto do banco de dados pelo seu ID.
   */
  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM vehicle_photos WHERE id = $1';
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Atualiza a foto principal do veículo.
   */
  async setPrimary(vehicleId: string, photoId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE vehicle_photos SET is_primary = false WHERE vehicle_id = $1',
        [vehicleId]
      );
      await client.query(
        'UPDATE vehicle_photos SET is_primary = true WHERE id = $1 AND vehicle_id = $2',
        [photoId, vehicleId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
