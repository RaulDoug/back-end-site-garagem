import 'dotenv/config';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import {
  FeatureRepository,
  type CreateFeatureData,
} from '#repositories/feature.repository.js';
import pool from '#src/config/database.js';

const repository = new FeatureRepository();
const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const createdIds = new Set<string>();
const createdTenantIds = new Set<string>();
let sequence = 0;

const createRepositoryTenant = async (name: string) => {
  const cnpj = `${String(Math.floor(1000000000 + Math.random() * 9000000000)).slice(0, 10)}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 14);
  const res = await pool.query(
    `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
     VALUES ($1, $2, $3, true) RETURNING id`,
    [`${name} Corp`, name, cnpj]
  );
  const id = res.rows[0].id;
  createdTenantIds.add(id);
  return id;
};

const createRepositoryFeature = async (
  label: string,
  overrides: Partial<CreateFeatureData> = {}
) => {
  const feature = await repository.create({
    name: `Opcional_${RUN_ID}_${++sequence}_${label}`,
    ...overrides,
  });

  createdIds.add(feature.id);
  return feature;
};

describe('FeatureRepository - integração com PostgreSQL (Hard Delete & Catálogo Híbrido)', () => {
  beforeAll(() => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes de integração do repository exigem DB_NAME terminando em _test. Execute com DB_PORT=5434 e DB_NAME=api_garage_test.'
      );
    }
  });

  afterEach(async () => {
    if (createdIds.size > 0) {
      await pool.query('DELETE FROM features WHERE id = ANY($1::uuid[])', [
        Array.from(createdIds),
      ]);
      createdIds.clear();
    }
    if (createdTenantIds.size > 0) {
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [
        Array.from(createdTenantIds),
      ]);
      createdTenantIds.clear();
    }
  });

  it('deve criar um opcional global (sem tenant_id) com sucesso', async () => {
    const feature = await createRepositoryFeature('global', { tenant_id: null });

    expect(feature.id).toBeDefined();
    expect(feature.name).toContain('global');
    expect(feature.tenant_id).toBeNull();
  });

  it('deve criar um opcional vinculado a um tenant', async () => {
    const tenantId = await createRepositoryTenant('Tenant Feature 1');
    const feature = await createRepositoryFeature('tenant', { tenant_id: tenantId });

    expect(feature.id).toBeDefined();
    expect(feature.tenant_id).toBe(tenantId);
  });

  it('deve buscar opcional por ID (findById)', async () => {
    const feature = await createRepositoryFeature('busca_id');

    const found = await repository.findById(feature.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(feature.id);
    expect(found?.name).toBe(feature.name);
  });

  it('deve buscar opcionais para um tenant retornando globais e específicos (findForTenant)', async () => {
    const tenantA = await createRepositoryTenant('Tenant Feature A');
    const tenantB = await createRepositoryTenant('Tenant Feature B');

    const globalFeature = await createRepositoryFeature('global_vis', { tenant_id: null });
    const featureA = await createRepositoryFeature('tenant_A', { tenant_id: tenantA });
    const featureB = await createRepositoryFeature('tenant_B', { tenant_id: tenantB });

    const tenantAFeatures = await repository.findForTenant(tenantA);
    const tenantAIds = tenantAFeatures.map(f => f.id);

    expect(tenantAIds).toContain(globalFeature.id);
    expect(tenantAIds).toContain(featureA.id);
    expect(tenantAIds).not.toContain(featureB.id);
  });

  it('deve buscar opcional por ID respeitando tenant_id e global (findByIdForTenant)', async () => {
    const tenantA = await createRepositoryTenant('Tenant Feature A2');
    const tenantB = await createRepositoryTenant('Tenant Feature B2');

    const globalFeature = await createRepositoryFeature('global_find', { tenant_id: null });
    const featureA = await createRepositoryFeature('feat_A', { tenant_id: tenantA });

    // Tenant A vê global e a sua própria
    expect(await repository.findByIdForTenant(globalFeature.id, tenantA)).not.toBeNull();
    expect(await repository.findByIdForTenant(featureA.id, tenantA)).not.toBeNull();

    // Tenant B vê global, mas NÃO vê feature do Tenant A
    expect(await repository.findByIdForTenant(globalFeature.id, tenantB)).not.toBeNull();
    expect(await repository.findByIdForTenant(featureA.id, tenantB)).toBeNull();
  });

  it('deve buscar múltiplos IDs respeitando tenant_id e global (findByIdsForTenant)', async () => {
    const tenantA = await createRepositoryTenant('Tenant Feature Multi A');
    const tenantB = await createRepositoryTenant('Tenant Feature Multi B');

    const globalFeature = await createRepositoryFeature('global_multi', { tenant_id: null });
    const featureA = await createRepositoryFeature('feat_multi_A', { tenant_id: tenantA });
    const featureB = await createRepositoryFeature('feat_multi_B', { tenant_id: tenantB });

    const results = await repository.findByIdsForTenant(
      [globalFeature.id, featureA.id, featureB.id],
      tenantA
    );
    const resultIds = results.map(r => r.id);

    expect(resultIds).toContain(globalFeature.id);
    expect(resultIds).toContain(featureA.id);
    expect(resultIds).not.toContain(featureB.id);
  });

  it('deve buscar opcional por nome case-insensitive para o tenant (findByNameForTenant)', async () => {
    const tenantA = await createRepositoryTenant('Tenant Feature Name A');
    const featureA = await createRepositoryFeature('feat_name_A', { tenant_id: tenantA });

    const found = await repository.findByNameForTenant(featureA.name.toUpperCase(), tenantA);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(featureA.id);
  });

  it('deve atualizar o nome de um opcional (update)', async () => {
    const feature = await createRepositoryFeature('update');
    const novoNome = `Atualizado_${RUN_ID}`;

    const updated = await repository.update(feature.id, { name: novoNome });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe(novoNome);
  });

  it('deve realizar HARD DELETE removendo o registro fisicamente da tabela', async () => {
    const feature = await createRepositoryFeature('hard_delete');

    const deleted = await repository.delete(feature.id);
    expect(deleted).not.toBeNull();
    expect(deleted?.id).toBe(feature.id);

    const rawCheck = await pool.query('SELECT * FROM features WHERE id = $1', [feature.id]);
    expect(rawCheck.rows.length).toBe(0);
  });

  it('deve permitir mesmo nome em tenants diferentes, mas bloquear no mesmo tenant', async () => {
    const tenantA = await createRepositoryTenant('Tenant Unique A');
    const tenantB = await createRepositoryTenant('Tenant Unique B');
    const featureName = `Custom_Feature_${RUN_ID}`;

    const featureA = await createRepositoryFeature('unique_A', { name: featureName, tenant_id: tenantA });
    const featureB = await createRepositoryFeature('unique_B', { name: featureName, tenant_id: tenantB });

    expect(featureA.id).toBeDefined();
    expect(featureB.id).toBeDefined();

    // Duplicado no mesmo tenant deve lançar 23505
    await expect(
      repository.create({ name: featureName, tenant_id: tenantA })
    ).rejects.toMatchObject({
      code: '23505',
    });
  });
});
