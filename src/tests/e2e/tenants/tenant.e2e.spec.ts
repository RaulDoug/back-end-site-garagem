import 'dotenv/config';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { generateToken } from '#utils/jwt.util.js';

describe('E2E - /api/tenants', () => {
  const createdTenantIds = new Set<string>();
  const ipBlock = Math.floor(Math.random() * 240) + 10;
  let sequence = 0;
  let ipSequence = 0;

  const nextIp = () => {
    ipSequence += 1;
    const thirdOctet = Math.floor((ipSequence - 1) / 250);
    const fourthOctet = ((ipSequence - 1) % 250) + 1;
    return `10.${ipBlock}.${thirdOctet}.${fourthOctet}`;
  };

  beforeAll(() => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes E2E exigem DB_NAME terminando em _test.'
      );
    }
  });

  afterAll(async () => {
    if (createdTenantIds.size > 0) {
      const ids = Array.from(createdTenantIds);
      await pool.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM stores WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
      createdTenantIds.clear();
    }
    await pool.end();
  });

  const nextValidCnpjs = () => {
    sequence++;
    const baseNum = 10000000 + sequence;
    const calcCnpj = (base: number) => {
      const s = String(base).padStart(8, '0') + '0001';
      const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum1 = 0;
      for (let i = 0; i < 12; i++) sum1 += parseInt(s[i], 10) * w1[i];
      const r1 = sum1 % 11;
      const d1 = r1 < 2 ? 0 : 11 - r1;
      const s2 = s + d1;
      const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum2 = 0;
      for (let i = 0; i < 13; i++) sum2 += parseInt(s2[i], 10) * w2[i];
      const r2 = sum2 % 11;
      const d2 = r2 < 2 ? 0 : 11 - r2;
      return `${s}${d1}${d2}`;
    };

    return {
      tenantCnpj: calcCnpj(baseNum * 2),
      storeCnpj: calcCnpj(baseNum * 2 + 1),
    };
  };

  describe('POST /api/tenants/onboard', () => {
    it('deve realizar onboarding com sucesso criando empresa, loja e admin (201)', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();

      const response = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send({
          tenant: {
            corporate_name: 'Auto Shopping Brasil Ltda',
            trade_name: 'Auto Shopping Brasil',
            cnpj: tenantCnpj,
          },
          store: {
            name: 'Loja Principal',
            phone: '(37) 98888-7777',
            cnpj: storeCnpj,
            zip_code: '35500-000',
            street: 'Av. Brasil',
            number: '1000',
            neighborhood: 'Centro',
            city: 'Divinópolis',
            state: 'MG',
          },
          admin: {
            name: 'Gestor Master',
            email: `gestor_${Date.now()}@autoshopping.com`,
            password: 'StrongPassword123!',
            phone: '(37) 99999-8888',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('tenant');
      expect(response.body).toHaveProperty('store');
      expect(response.body).toHaveProperty('admin');
      expect(response.body).toHaveProperty('token');
      expect(response.body.tenant.corporate_name).toBe('Auto Shopping Brasil Ltda');
      expect(response.body.store.tenant_id).toBe(response.body.tenant.id);
      expect(response.body.admin.tenant_id).toBe(response.body.tenant.id);
      expect(response.body.admin.role).toBe('ADMIN');

      createdTenantIds.add(response.body.tenant.id);
    });

    it('deve realizar onboarding com is_multi_store: true e vincular admin.store_id como null (201)', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();

      const response = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send({
          is_multi_store: true,
          tenant: {
            corporate_name: 'Auto Shopping Multi Ltda',
            trade_name: 'Auto Shopping Multi',
            cnpj: tenantCnpj,
          },
          store: {
            name: 'Loja Matriz Multi',
            phone: '(37) 98888-7777',
            cnpj: storeCnpj,
            zip_code: '35500-000',
            street: 'Av. Brasil',
            number: '1000',
            neighborhood: 'Centro',
            city: 'Divinópolis',
            state: 'MG',
          },
          admin: {
            name: 'Gestor Multi Store',
            email: `gestor_multi_${Date.now()}@autoshopping.com`,
            password: 'StrongPassword123!',
            phone: '(37) 99999-8888',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.admin.store_id).toBeNull();
      createdTenantIds.add(response.body.tenant.id);
    });

    it('deve retornar 400 se o CNPJ do tenant for inválido', async () => {
      const response = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send({
          tenant: {
            corporate_name: 'Invalida Ltda',
            trade_name: 'Invalida',
            cnpj: '11.111.111/1111-11',
          },
          store: {
            name: 'Loja',
            phone: '(37) 98888-7777',
            cnpj: '45.723.174/0001-10',
            zip_code: '35500-000',
            street: 'Rua',
            number: '1',
            neighborhood: 'Bairro',
            city: 'Cidade',
            state: 'MG',
          },
          admin: {
            name: 'Admin',
            email: 'admin@invalida.com',
            password: 'Password123!',
            phone: '(37) 99999-8888',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(Array.isArray(response.body.errors)).toBe(true);
    });

    it('deve retornar 409 se o CNPJ da empresa já estiver cadastrado', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();

      const payload = {
        tenant: {
          corporate_name: 'Empresa Duplicada Ltda',
          trade_name: 'Empresa Duplicada',
          cnpj: tenantCnpj,
        },
        store: {
          name: 'Loja 1',
          phone: '(37) 98888-7777',
          cnpj: storeCnpj,
          zip_code: '35500-000',
          street: 'Rua',
          number: '1',
          neighborhood: 'Bairro',
          city: 'Cidade',
          state: 'MG',
        },
        admin: {
          name: 'Admin',
          email: `admin_${Date.now()}@duplicada.com`,
          password: 'Password123!',
          phone: '(37) 99999-8888',
        },
      };

      const res1 = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send(payload);
      expect(res1.status).toBe(201);
      createdTenantIds.add(res1.body.tenant.id);

      const { storeCnpj: anotherStoreCnpj } = nextValidCnpjs();
      const res2 = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send({
          ...payload,
          store: { ...payload.store, cnpj: anotherStoreCnpj },
          admin: { ...payload.admin, email: `outro_${Date.now()}@duplicada.com` },
        });

      expect(res2.status).toBe(409);
      expect(res2.body.message).toMatch(/cnpj.*(empresa|uso)/i);
    });

    it('deve retornar 401 quando o header x-onboarding-secret não for enviado', async () => {
      const response = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.message).toBe(
        'Acesso negado. Chave de provisionamento inválida ou ausente.'
      );
    });

    it('deve retornar 401 quando o header x-onboarding-secret for inválido', async () => {
      const response = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', 'chave-secreta-invalida')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.message).toBe(
        'Acesso negado. Chave de provisionamento inválida ou ausente.'
      );
    });

    it('não deve retornar 429 na sexta tentativa de onboarding do mesmo IP (registerLimit desativado)', async () => {
      const rateLimitIp = nextIp();

      for (let i = 0; i < 6; i += 1) {
        const res = await request(app)
          .post('/api/tenants/onboard')
          .set('X-Forwarded-For', rateLimitIp)
          .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
          .send({});
        expect(res.status).toBe(400);
        expect(res.status).not.toBe(429);
      }
    });
  });

  describe('GET /api/tenants/me', () => {
    it('deve retornar 401 quando não autenticado', async () => {
      const response = await request(app).get('/api/tenants/me');
      expect(response.status).toBe(401);
    });

    it('deve retornar dados do tenant do usuário autenticado (200)', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();
      const onboardRes = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send({
          tenant: {
            corporate_name: 'Empresa Me Ltda',
            trade_name: 'Empresa Me',
            cnpj: tenantCnpj,
          },
          store: {
            name: 'Loja Me',
            phone: '(37) 98888-7777',
            cnpj: storeCnpj,
            zip_code: '35500-000',
            street: 'Rua',
            number: '1',
            neighborhood: 'Bairro',
            city: 'Cidade',
            state: 'MG',
          },
          admin: {
            name: 'Admin Me',
            email: `admin_me_${Date.now()}@me.com`,
            password: 'Password123!',
            phone: '(37) 99999-8888',
          },
        });

      createdTenantIds.add(onboardRes.body.tenant.id);
      const token = onboardRes.body.token;

      const response = await request(app)
        .get('/api/tenants/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tenant');
      expect(response.body.tenant.id).toBe(onboardRes.body.tenant.id);
      expect(response.body.tenant.corporate_name).toBe('Empresa Me Ltda');
    });
  });

  describe('PUT /api/tenants/me', () => {
    it('deve retornar 403 se o usuário não tiver role ADMIN', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();
      const onboardRes = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send({
          tenant: {
            corporate_name: 'Empresa Role Test Ltda',
            trade_name: 'Empresa Role',
            cnpj: tenantCnpj,
          },
          store: {
            name: 'Loja Role',
            phone: '(37) 98888-7777',
            cnpj: storeCnpj,
            zip_code: '35500-000',
            street: 'Rua',
            number: '1',
            neighborhood: 'Bairro',
            city: 'Cidade',
            state: 'MG',
          },
          admin: {
            name: 'Admin Role',
            email: `admin_role_${Date.now()}@role.com`,
            password: 'Password123!',
            phone: '(37) 99999-8888',
          },
        });

      createdTenantIds.add(onboardRes.body.tenant.id);

      // Cria um usuário com role VENDEDOR no banco para testar autorização
      const vendedorRes = await pool.query(
        `INSERT INTO users (tenant_id, store_id, name, email, password_hash, phone, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, 'VENDEDOR', true)
         RETURNING id, email, role, tenant_id, store_id`,
        [
          onboardRes.body.tenant.id,
          onboardRes.body.store.id,
          'Vendedor Teste',
          `vendedor_${Date.now()}@role.com`,
          'hash_pwd_123',
          '(37) 99999-8888',
        ]
      );
      const vendedorUser = vendedorRes.rows[0];

      const vendedorToken = generateToken({
        id: vendedorUser.id,
        email: vendedorUser.email,
        role: 'VENDEDOR',
        tenantId: vendedorUser.tenant_id,
        storeId: vendedorUser.store_id,
      });

      const response = await request(app)
        .put('/api/tenants/me')
        .set('Authorization', `Bearer ${vendedorToken}`)
        .send({ trade_name: 'Tentativa Vendedor' });

      expect(response.status).toBe(403);
    });

    it('deve atualizar o tenant quando autenticado como ADMIN (200)', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();
      const onboardRes = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send({
          tenant: {
            corporate_name: 'Empresa Atualizar Ltda',
            trade_name: 'Empresa Atualizar',
            cnpj: tenantCnpj,
          },
          store: {
            name: 'Loja Atualizar',
            phone: '(37) 98888-7777',
            cnpj: storeCnpj,
            zip_code: '35500-000',
            street: 'Rua',
            number: '1',
            neighborhood: 'Bairro',
            city: 'Cidade',
            state: 'MG',
          },
          admin: {
            name: 'Admin Atualizar',
            email: `admin_update_${Date.now()}@update.com`,
            password: 'Password123!',
            phone: '(37) 99999-8888',
          },
        });

      createdTenantIds.add(onboardRes.body.tenant.id);
      const token = onboardRes.body.token;

      const response = await request(app)
        .put('/api/tenants/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ trade_name: 'Nome Fantasia Editado Com Sucesso' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tenant');
      expect(response.body.tenant.trade_name).toBe('Nome Fantasia Editado Com Sucesso');
    });

    it('deve retornar 400 com mensagem "Nenhum dado informado" ao enviar objeto vazio no update', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();
      const onboardRes = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send({
          tenant: {
            corporate_name: 'Empresa Vazia Ltda',
            trade_name: 'Empresa Vazia',
            cnpj: tenantCnpj,
          },
          store: {
            name: 'Loja Vazia',
            phone: '(37) 98888-7777',
            cnpj: storeCnpj,
            zip_code: '35500-000',
            street: 'Rua',
            number: '1',
            neighborhood: 'Bairro',
            city: 'Cidade',
            state: 'MG',
          },
          admin: {
            name: 'Admin Vazio',
            email: `admin_vazio_${Date.now()}@vazio.com`,
            password: 'Password123!',
            phone: '(37) 99999-8888',
          },
        });

      createdTenantIds.add(onboardRes.body.tenant.id);
      const token = onboardRes.body.token;

      const response = await request(app)
        .put('/api/tenants/me')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Nenhum dado informado');
    });

    it('deve retornar 400 com formato fail se enviar CNPJ inválido no update', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();
      const onboardRes = await request(app)
        .post('/api/tenants/onboard')
        .set('X-Forwarded-For', nextIp())
        .set('x-onboarding-secret', process.env.ONBOARDING_SECRET!)
        .send({
          tenant: {
            corporate_name: 'Empresa Zod Update Ltda',
            trade_name: 'Empresa Zod Update',
            cnpj: tenantCnpj,
          },
          store: {
            name: 'Loja Zod',
            phone: '(37) 98888-7777',
            cnpj: storeCnpj,
            zip_code: '35500-000',
            street: 'Rua',
            number: '1',
            neighborhood: 'Bairro',
            city: 'Cidade',
            state: 'MG',
          },
          admin: {
            name: 'Admin Zod',
            email: `admin_zod_${Date.now()}@zod.com`,
            password: 'Password123!',
            phone: '(37) 99999-8888',
          },
        });

      createdTenantIds.add(onboardRes.body.tenant.id);
      const token = onboardRes.body.token;

      const response = await request(app)
        .put('/api/tenants/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ cnpj: '11.111.111/1111-11' });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(Array.isArray(response.body.errors)).toBe(true);
    });
  });
});
