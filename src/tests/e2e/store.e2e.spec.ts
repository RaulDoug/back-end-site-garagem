import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '#src/app.js';
import pool from '#src/config/database.js';

describe('E2E - Fluxo de Lojas', () => {
  let createdStoreId: string;

  const testStore = {
    name: 'Garagem Veículos E2E',
    phone: '(37) 99999-9999',
    cnpj: '00.000.000/0001-91',
    address: {
      street: 'Avenida Getúlio Vargas',
      number: 500,
      neighborhood: 'Centro',
      city: 'Divinópolis',
      state: 'MG',
      zip_code: '35500-000',
    },
  };

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM stores WHERE cnpj = $1', [testStore.cnpj]);
    } catch {
      // Ignora erro caso o banco não esteja em execução
    } finally {
      await pool.end();
    }
  });

  it('deve cadastrar uma nova loja com sucesso (POST /api/store)', async () => {
    const res = await request(app)
      .post('/api/store')
      .send(testStore);

    expect(res.status).toBe(201);
    expect(res.body.store).toHaveProperty('id');
    expect(res.body.store.cnpj).toBe(testStore.cnpj);
    expect(res.body.store.name).toBe(testStore.name);

    createdStoreId = res.body.store.id;
  });

  it('deve rejeitar cadastro com CNPJ duplicado (POST /api/store)', async () => {
    const res = await request(app)
      .post('/api/store')
      .send(testStore);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('message', 'CNPJ já cadastrado');
  });

  it('deve consultar a loja por ID (GET /api/store/:id)', async () => {
    const res = await request(app).get(`/api/store/${createdStoreId}`);

    expect(res.status).toBe(200);
    expect(res.body.result).toHaveProperty('id', createdStoreId);
    expect(res.body.result.cnpj).toBe(testStore.cnpj);
  });

  it('deve listar as lojas cadastradas (GET /api/store)', async () => {
    const res = await request(app)
      .get('/api/store')
      .query({ is_active: true });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.result)).toBe(true);
  });

  it('deve remover a loja por ID (DELETE /api/store/:id)', async () => {
    const res = await request(app).delete(`/api/store/${createdStoreId}`);

    expect(res.status).toBe(200);
    expect(res.body.result).toHaveProperty('id', createdStoreId);
  });
});
