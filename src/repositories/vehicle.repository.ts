import BaseRepository from '#repositories/base.repository.js';
import pool from '#src/config/database.js';
import { buildInsertQuery, buildUpdateQuery } from '#utils/query.util.js';

export interface Vehicle {
  id: string;
  store_id: string;
  registered_by_user_id: string;
  sold_by_user_id: string | null;
  model_id: string;
  promotion_id: string | null;
  sale_type: 'PROPRIO' | 'CONSIGNADO';
  title: string;
  description: string;
  sale_price: number;
  purchase_price: number | null;
  owner_price: number | null;
  store_commission_rate: number | null;
  owner_name: string | null;
  owner_contact: string | null;
  fipe_price: number | null;
  min_down_payment: number | null;
  max_installments: number | null;
  manufacture_year: number;
  model_year: number;
  mileage: number;
  transmission: 'AUTOMATICO' | 'MANUAL' | 'AUTOMATIZADO';
  color: string;
  category: string;
  horsepower: number | null;
  fuel_type: string;
  steering: string;
  doors: number;
  full_license_plate: string;
  plate_last_digit: number;
  status: 'ATIVO' | 'RESERVADO' | 'EM_NEGOCIACAO' | 'VENDIDO' | 'INATIVO';
  reservation_expires_at: Date | null;
  video_url: string | null;
  inspection_report_url: string | null;
  total_views: number;
  sold_at: Date | null;
  buyer_name: string | null;
  buyer_contact: string | null;
  website_lead_origin: boolean | null;
  created_at: Date;
  updated_at: Date | null;
  deleted_at: Date | null;
}

export type CreateVehicleData = Omit<
  Vehicle,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'sold_at'
  | 'total_views'
  | 'sold_by_user_id'
  | 'promotion_id'
  | 'purchase_price'
  | 'owner_price'
  | 'store_commission_rate'
  | 'owner_name'
  | 'owner_contact'
  | 'fipe_price'
  | 'min_down_payment'
  | 'max_installments'
  | 'horsepower'
  | 'reservation_expires_at'
  | 'video_url'
  | 'inspection_report_url'
  | 'buyer_name'
  | 'buyer_contact'
  | 'website_lead_origin'
> & {
  total_views?: number;
  sold_by_user_id?: string | null;
  promotion_id?: string | null;
  purchase_price?: number | null;
  owner_price?: number | null;
  store_commission_rate?: number | null;
  owner_name?: string | null;
  owner_contact?: string | null;
  fipe_price?: number | null;
  min_down_payment?: number | null;
  max_installments?: number | null;
  horsepower?: number | null;
  reservation_expires_at?: Date | null;
  video_url?: string | null;
  inspection_report_url?: string | null;
  buyer_name?: string | null;
  buyer_contact?: string | null;
  website_lead_origin?: boolean | null;
};

export interface DetailedVehicle extends Vehicle {
  brand: { id: string; name: string };
  model: { id: string; name: string };
  features: Array<{ id: string; name: string }>;
  photos: Array<{
    id: string;
    thumb_path: string;
    full_path: string;
    display_order: number;
    is_primary: boolean;
  }>;
}

export interface FindCatalogFilters {
  page?: number;
  limit?: number;
  category?: string;
  brand_id?: string;
  model_id?: string;
  fuel_type?: string;
  transmission?: string;
  min_price?: number;
  max_price?: number;
  min_year?: number;
  max_year?: number;
  max_mileage?: number;
  plate_last_digit?: number;
  feature_ids?: string[];
  status?: string;
  search?: string;
  include_deleted?: boolean;
  publicOnly?: boolean;
}

export class VehicleRepository extends BaseRepository<Vehicle, CreateVehicleData> {
  constructor() {
    super('vehicles', { softDelete: true, hasActiveStatus: false });
  }

  override async delete(id: string): Promise<Vehicle | null> {
    const query = `
      UPDATE vehicles
      SET deleted_at = NOW(), status = 'INATIVO', updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *;
    `;
    const result = await pool.query<Vehicle>(query, [id]);
    return result.rows[0] || null;
  }

  async findByPlate(plate: string): Promise<Vehicle | null> {
    const query = `
      SELECT * FROM vehicles
      WHERE full_license_plate = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const result = await pool.query<Vehicle>(query, [plate]);
    return result.rows[0] || null;
  }

  async createWithFeatures(
    data: CreateVehicleData,
    featureIds: string[] = []
  ): Promise<Vehicle> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { query, values } = buildInsertQuery('vehicles', data as Record<string, unknown>);
      const resVehicle = await client.query<Vehicle>(query, values);
      const vehicle = resVehicle.rows[0];

      if (featureIds.length > 0) {
        for (const featureId of featureIds) {
          await client.query(
            'INSERT INTO vehicle_features (vehicle_id, feature_id) VALUES ($1, $2)',
            [vehicle.id, featureId]
          );
        }
      }

      await client.query('COMMIT');
      return vehicle;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateWithFeatures(
    id: string,
    data: Partial<CreateVehicleData>,
    featureIds?: string[]
  ): Promise<Vehicle | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let updatedVehicle: Vehicle | null = null;
      const dataKeys = Object.keys(data);
      if (dataKeys.length > 0) {
        const updatePayload = { ...data, updated_at: new Date() };
        const { query, values } = buildUpdateQuery(
          'vehicles',
          updatePayload as Record<string, unknown>,
          id
        );
        const res = await client.query<Vehicle>(query, values);
        updatedVehicle = res.rows[0] || null;
      } else {
        const res = await client.query<Vehicle>(
          'SELECT * FROM vehicles WHERE id = $1 AND deleted_at IS NULL',
          [id]
        );
        updatedVehicle = res.rows[0] || null;
      }

      if (updatedVehicle && featureIds !== undefined) {
        await client.query('DELETE FROM vehicle_features WHERE vehicle_id = $1', [id]);
        for (const featureId of featureIds) {
          await client.query(
            'INSERT INTO vehicle_features (vehicle_id, feature_id) VALUES ($1, $2)',
            [id, featureId]
          );
        }
      }

      await client.query('COMMIT');
      return updatedVehicle;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findCatalog(filters: FindCatalogFilters): Promise<{
    items: (Vehicle & { brand_name: string; model_name: string; cover_photo_url: string | null })[];
    total: number;
    page: number;
    limit: number;
  }> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    let paramIndex = 1;

    if (!filters.include_deleted) {
      conditions.push('v.deleted_at IS NULL');
    }

    if (filters.publicOnly) {
      conditions.push('v.status IN (\'ATIVO\', \'RESERVADO\')');
    } else if (filters.status) {
      conditions.push(`v.status = $${paramIndex++}`);
      values.push(filters.status);
    }

    // RN001: Regra do Flex
    if (filters.fuel_type === 'GASOLINA') {
      conditions.push('v.fuel_type IN (\'GASOLINA\', \'FLEX\')');
    } else if (filters.fuel_type === 'ALCOOL') {
      conditions.push('v.fuel_type IN (\'ALCOOL\', \'FLEX\')');
    } else if (filters.fuel_type) {
      conditions.push(`v.fuel_type = $${paramIndex++}`);
      values.push(filters.fuel_type);
    }

    if (filters.category) {
      conditions.push(`v.category = $${paramIndex++}`);
      values.push(filters.category);
    }

    if (filters.brand_id) {
      conditions.push(`b.id = $${paramIndex++}`);
      values.push(filters.brand_id);
    }

    if (filters.model_id) {
      conditions.push(`v.model_id = $${paramIndex++}`);
      values.push(filters.model_id);
    }

    if (filters.transmission) {
      conditions.push(`v.transmission = $${paramIndex++}`);
      values.push(filters.transmission);
    }

    if (filters.min_price !== undefined) {
      conditions.push(`v.sale_price >= $${paramIndex++}`);
      values.push(filters.min_price);
    }

    if (filters.max_price !== undefined) {
      conditions.push(`v.sale_price <= $${paramIndex++}`);
      values.push(filters.max_price);
    }

    if (filters.min_year !== undefined) {
      conditions.push(`v.model_year >= $${paramIndex++}`);
      values.push(filters.min_year);
    }

    if (filters.max_year !== undefined) {
      conditions.push(`v.model_year <= $${paramIndex++}`);
      values.push(filters.max_year);
    }

    if (filters.max_mileage !== undefined) {
      conditions.push(`v.mileage <= $${paramIndex++}`);
      values.push(filters.max_mileage);
    }

    if (filters.plate_last_digit !== undefined) {
      conditions.push(`v.plate_last_digit = $${paramIndex++}`);
      values.push(filters.plate_last_digit);
    }

    if (filters.search) {
      conditions.push(`v.title ILIKE $${paramIndex++}`);
      values.push(`%${filters.search}%`);
    }

    if (filters.feature_ids && filters.feature_ids.length > 0) {
      conditions.push(`v.id IN (
        SELECT vf.vehicle_id 
        FROM vehicle_features vf 
        WHERE vf.feature_id = ANY($${paramIndex++}::uuid[]) 
        GROUP BY vf.vehicle_id 
        HAVING COUNT(DISTINCT vf.feature_id) = $${paramIndex++}
      )`);
      values.push(filters.feature_ids);
      values.push(filters.feature_ids.length);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 12;
    const offset = (page - 1) * limit;

    const countQuery = `
      SELECT COUNT(*)::int as total
      FROM vehicles v
      JOIN models m ON v.model_id = m.id
      JOIN brands b ON m.brand_id = b.id
      ${whereClause};
    `;
    const countRes = await pool.query<{ total: number }>(countQuery, values);
    const total = countRes.rows[0]?.total || 0;

    const selectQuery = `
      SELECT 
        v.*,
        m.name as model_name,
        b.id as brand_id,
        b.name as brand_name,
        (
          SELECT vp.thumb_path 
          FROM vehicle_photos vp 
          WHERE vp.vehicle_id = v.id AND vp.is_primary = true 
          LIMIT 1
        ) as cover_photo_url
      FROM vehicles v
      JOIN models m ON v.model_id = m.id
      JOIN brands b ON m.brand_id = b.id
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;
    const selectValues = [...values, limit, offset];
    const selectRes = await pool.query<
      Vehicle & { brand_name: string; model_name: string; cover_photo_url: string | null }
    >(selectQuery, selectValues);

    return {
      items: selectRes.rows,
      total,
      page,
      limit,
    };
  }

  async findDetailedById(
    id: string,
    options: { publicOnly?: boolean } = {}
  ): Promise<DetailedVehicle | null> {
    let query = `
      SELECT 
        v.*,
        m.name as model_name,
        b.id as brand_id,
        b.name as brand_name
      FROM vehicles v
      JOIN models m ON v.model_id = m.id
      JOIN brands b ON m.brand_id = b.id
      WHERE v.id = $1 AND v.deleted_at IS NULL
    `;

    if (options.publicOnly) {
      query += ' AND v.status IN (\'ATIVO\', \'RESERVADO\')';
    }

    query += ' LIMIT 1;';

    const res = await pool.query<Vehicle & { brand_id: string; brand_name: string; model_name: string }>(
      query,
      [id]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];

    const vfQuery = `
      SELECT f.id, f.name 
      FROM vehicle_features vf 
      JOIN features f ON vf.feature_id = f.id 
      WHERE vf.vehicle_id = $1 
      ORDER BY f.name ASC;
    `;
    const vfRes = await pool.query<{ id: string; name: string }>(vfQuery, [id]);

    const photosQuery = `
      SELECT id, thumb_path, full_path, display_order, is_primary 
      FROM vehicle_photos 
      WHERE vehicle_id = $1 
      ORDER BY display_order ASC;
    `;
    const photosRes = await pool.query<{
      id: string;
      thumb_path: string;
      full_path: string;
      display_order: number;
      is_primary: boolean;
    }>(photosQuery, [id]);

    return {
      ...row,
      brand: { id: row.brand_id, name: row.brand_name },
      model: { id: row.model_id, name: row.model_name },
      features: vfRes.rows,
      photos: photosRes.rows,
    };
  }

  async findByIds(
    ids: string[],
    options: { publicOnly?: boolean } = {}
  ): Promise<DetailedVehicle[]> {
    if (ids.length === 0) return [];

    const detailedList: DetailedVehicle[] = [];
    for (const id of ids) {
      const item = await this.findDetailedById(id, options);
      if (item) {
        detailedList.push(item);
      }
    }
    return detailedList;
  }

  async incrementViewMetrics(id: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'UPDATE vehicles SET total_views = total_views + 1 WHERE id = $1',
        [id]
      );

      const metricsQuery = `
        INSERT INTO vehicle_metrics (vehicle_id, recorded_date, views_count)
        VALUES ($1, CURRENT_DATE, 1)
        ON CONFLICT (vehicle_id, recorded_date)
        DO UPDATE SET views_count = vehicle_metrics.views_count + 1;
      `;
      await client.query(metricsQuery, [id]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
