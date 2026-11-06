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
let sequence = 0;

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

describe('FeatureRepository - integração com PostgreSQL (Hard Delete)', () => {
  beforeAll(() => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes de integração do repository exigem DB_NAME terminando em _test. Execute com DB_PORT=5434 e DB_NAME=api_garage_test.'
      );
    }
  });

  afterEach(async () => {
    if (createdIds.size === 0) return;

    await pool.query('DELETE FROM features WHERE id = ANY($1::uuid[])', [
      Array.from(createdIds),
    ]);
    createdIds.clear();
  });

  it('deve criar um opcional com sucesso', async () => {
    const feature = await createRepositoryFeature('criacao');

    expect(feature.id).toBeDefined();
    expect(feature.name).toContain('criacao');
  });

  it('deve buscar opcional por ID (findById)', async () => {
    const feature = await createRepositoryFeature('busca_id');

    const found = await repository.findById(feature.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(feature.id);
    expect(found?.name).toBe(feature.name);
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

    // Consulta física direta no banco confirmando remoção completa
    const rawCheck = await pool.query('SELECT * FROM features WHERE id = $1', [feature.id]);
    expect(rawCheck.rows.length).toBe(0);
  });

  it('deve lançar erro de unicidade (23505) ao criar opcional com nome duplicado', async () => {
    const feature = await createRepositoryFeature('unicidade');

    await expect(
      repository.create({ name: feature.name })
    ).rejects.toMatchObject({
      code: '23505',
    });
  });
});
