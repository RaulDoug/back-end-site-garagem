import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { createVehicleE2EContext } from './vehicle.e2e.helpers.js';

const {
  app,
  request,
  signToken,
  validProprioPayload,
  createVehicle,
  cleanup,
} = createVehicleE2EContext();

describe('E2E - Vehicle Media & Inspection Report (/api/vehicles/:id)', () => {
  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');
  const viewerToken = signToken('VISUALIZADOR');

  let testVehicleId: string;
  let imgBuffer1: Buffer;
  let imgBuffer2: Buffer;
  const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

  let createdPhoto0Id: string;
  let createdPhoto1Id: string;
  let photo0ThumbPath: string;
  let photo0FullPath: string;
  let photo1ThumbPath: string;
  let photo1FullPath: string;
  let reportRelativeUrl: string;

  beforeAll(async () => {
    sharp.cache(false);

    // Cria veículo para os testes de mídia
    const res = await createVehicle(validProprioPayload(), adminToken);
    expect(res.status).toBe(201);
    testVehicleId = res.body.item.id;

    imgBuffer1 = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    imgBuffer2 = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .jpeg()
      .toBuffer();
  });

  afterAll(async () => {
    // Limpa arquivos gerados durante o teste E2E
    const filesToClean = [
      photo0ThumbPath,
      photo0FullPath,
      photo1ThumbPath,
      photo1FullPath,
      reportRelativeUrl,
    ];

    for (const rel of filesToClean) {
      if (rel) {
        const absPath = path.resolve(process.cwd(), rel.startsWith('/') ? rel.slice(1) : rel);
        if (fs.existsSync(absPath)) {
          try {
            fs.unlinkSync(absPath);
          } catch {
            // Ignora se já tiver sido removido
          }
        }
      }
    }

    await cleanup();
  });

  describe('POST /api/vehicles/:id/photos - Upload de Fotos', () => {
    it('deve retornar 401 ao tentar upload sem token', async () => {
      const res = await request(app)
        .post(`/api/vehicles/${testVehicleId}/photos`)
        .attach('photos', imgBuffer1, 'foto1.jpg');

      expect(res.status).toBe(401);
    });

    it('deve retornar 403 ao tentar upload com perfil VISUALIZADOR', async () => {
      const res = await request(app)
        .post(`/api/vehicles/${testVehicleId}/photos`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .attach('photos', imgBuffer1, 'foto1.jpg');

      expect(res.status).toBe(403);
    });

    it('deve retornar 400 ao tentar upload de arquivo com formato não permitido (.txt)', async () => {
      const res = await request(app)
        .post(`/api/vehicles/${testVehicleId}/photos`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('photos', Buffer.from('nao eh imagem'), 'arquivo.txt');

      expect(res.status).toBe(400);
    });

    it('deve fazer upload de 2 fotos reais, salvar WebP e definir primeira como capa (RN006, RN008)', async () => {
      const res = await request(app)
        .post(`/api/vehicles/${testVehicleId}/photos`)
        .set('Authorization', `Bearer ${vendedorToken}`)
        .attach('photos', imgBuffer1, 'foto1.jpg')
        .attach('photos', imgBuffer2, 'foto2.jpg');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('photos');
      expect(res.body.photos).toHaveLength(2);

      const [p0, p1] = res.body.photos;
      createdPhoto0Id = p0.id;
      createdPhoto1Id = p1.id;

      photo0ThumbPath = p0.thumb_path;
      photo0FullPath = p0.full_path;
      photo1ThumbPath = p1.thumb_path;
      photo1FullPath = p1.full_path;

      // Valida RN008: primeira foto do veículo tem display_order = 0 e is_primary = true
      expect(p0.display_order).toBe(0);
      expect(p0.is_primary).toBe(true);

      // Segunda foto
      expect(p1.display_order).toBe(1);
      expect(p1.is_primary).toBe(false);

      // Valida existência física no disco
      const p0ThumbAbs = path.resolve(process.cwd(), photo0ThumbPath.slice(1));
      const p0FullAbs = path.resolve(process.cwd(), photo0FullPath.slice(1));
      expect(fs.existsSync(p0ThumbAbs)).toBe(true);
      expect(fs.existsSync(p0FullAbs)).toBe(true);
    });
  });

  describe('PATCH /api/vehicles/:id/photos/reorder - Reordenação Drag & Drop', () => {
    it('deve retornar 400 ao enviar array com IDs duplicados', async () => {
      const res = await request(app)
        .patch(`/api/vehicles/${testVehicleId}/photos/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ photo_ids: [createdPhoto0Id, createdPhoto0Id] });

      expect(res.status).toBe(400);
    });

    it('deve inverter a ordem das fotos e promover a nova posição 0 a capa principal (RN008)', async () => {
      const res = await request(app)
        .patch(`/api/vehicles/${testVehicleId}/photos/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ photo_ids: [createdPhoto1Id, createdPhoto0Id] });

      expect(res.status).toBe(200);
      expect(res.body.photos).toHaveLength(2);

      const [newP0, newP1] = res.body.photos;
      expect(newP0.id).toBe(createdPhoto1Id);
      expect(newP0.display_order).toBe(0);
      expect(newP0.is_primary).toBe(true);

      expect(newP1.id).toBe(createdPhoto0Id);
      expect(newP1.display_order).toBe(1);
      expect(newP1.is_primary).toBe(false);
    });
  });

  describe('PATCH /api/vehicles/:id/inspection-report - Upload do Laudo Pericial PDF', () => {
    it('deve retornar 400 ao tentar upload de laudo não-PDF', async () => {
      const res = await request(app)
        .patch(`/api/vehicles/${testVehicleId}/inspection-report`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('report', imgBuffer1, 'imagem.jpg');

      expect(res.status).toBe(400);
    });

    it('deve realizar upload do PDF e disponibilizar acesso estático via GET', async () => {
      const res = await request(app)
        .patch(`/api/vehicles/${testVehicleId}/inspection-report`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('report', pdfBuffer, 'laudo.pdf');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('inspection_report_url');
      reportRelativeUrl = res.body.inspection_report_url;
      expect(reportRelativeUrl).toMatch(/\/uploads\/vehicles\/reports\/.*\.pdf$/);

      // Testa rota estática Express
      const staticRes = await request(app).get(reportRelativeUrl);
      expect(staticRes.status).toBe(200);
      expect(staticRes.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('DELETE /api/vehicles/:id/photos/:photoId - Exclusão de Foto', () => {
    it('deve excluir foto do banco e do disco físico com sucesso', async () => {
      const res = await request(app)
        .delete(`/api/vehicles/${testVehicleId}/photos/${createdPhoto0Id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      // Confirma remoção física
      const p0ThumbAbs = path.resolve(process.cwd(), photo0ThumbPath.slice(1));
      const p0FullAbs = path.resolve(process.cwd(), photo0FullPath.slice(1));
      expect(fs.existsSync(p0ThumbAbs)).toBe(false);
      expect(fs.existsSync(p0FullAbs)).toBe(false);
    });
  });

  describe('DELETE /api/vehicles/:id/inspection-report - Exclusão de Laudo', () => {
    it('deve remover laudo físico e limpar campo no banco', async () => {
      const res = await request(app)
        .delete(`/api/vehicles/${testVehicleId}/inspection-report`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const reportAbs = path.resolve(process.cwd(), reportRelativeUrl.slice(1));
      expect(fs.existsSync(reportAbs)).toBe(false);
    });
  });
});
