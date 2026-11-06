import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '#src/app.js';

describe('E2E - Swagger UI (/api-docs)', () => {
  it('deve responder 200 e retornar HTML em GET /api-docs/', async () => {
    const res = await request(app).get('/api-docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('deve responder 200 e retornar o JSON da especificação OpenAPI em GET /api-docs.json', async () => {
    const res = await request(app).get('/api-docs.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.title).toBe('API Garagem de Veículos');
  });
});
