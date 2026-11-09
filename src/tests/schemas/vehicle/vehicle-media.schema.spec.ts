import { describe, expect, it } from 'vitest';
import { reorderPhotosSchema, deletePhotoSchema } from '#schemas/vehicle.schema.js';

describe('Vehicle Media Schemas', () => {
  const validVehicleId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const validPhotoId1 = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  const validPhotoId2 = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

  describe('reorderPhotosSchema', () => {
    it('deve validar com sucesso quando params e body estiverem corretos', () => {
      const result = reorderPhotosSchema.safeParse({
        params: { id: validVehicleId },
        body: { photo_ids: [validPhotoId1, validPhotoId2] },
      });

      expect(result.success).toBe(true);
    });

    it('deve falhar se o id do veículo não for um UUID válido', () => {
      const result = reorderPhotosSchema.safeParse({
        params: { id: 'invalid-id' },
        body: { photo_ids: [validPhotoId1] },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('ID do veículo inválido');
      }
    });

    it('deve falhar quando body.photo_ids for um array vazio', () => {
      const result = reorderPhotosSchema.safeParse({
        params: { id: validVehicleId },
        body: { photo_ids: [] },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Informe ao menos um ID de foto');
      }
    });

    it('deve falhar quando body.photo_ids contiver IDs duplicados', () => {
      const result = reorderPhotosSchema.safeParse({
        params: { id: validVehicleId },
        body: { photo_ids: [validPhotoId1, validPhotoId1] },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('A lista de fotos não pode conter IDs duplicados');
      }
    });

    it('deve falhar quando algum photo_id não for um UUID válido', () => {
      const result = reorderPhotosSchema.safeParse({
        params: { id: validVehicleId },
        body: { photo_ids: [validPhotoId1, 'not-a-uuid'] },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('ID de foto inválido');
      }
    });
  });

  describe('deletePhotoSchema', () => {
    it('deve validar com sucesso quando id e photoId forem UUIDs válidos', () => {
      const result = deletePhotoSchema.safeParse({
        params: {
          id: validVehicleId,
          photoId: validPhotoId1,
        },
      });

      expect(result.success).toBe(true);
    });

    it('deve falhar quando id do veículo for inválido', () => {
      const result = deletePhotoSchema.safeParse({
        params: {
          id: '123',
          photoId: validPhotoId1,
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('ID do veículo inválido');
      }
    });

    it('deve falhar quando photoId for inválido', () => {
      const result = deletePhotoSchema.safeParse({
        params: {
          id: validVehicleId,
          photoId: 'invalid-photo-id',
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('ID da foto inválido');
      }
    });
  });
});
