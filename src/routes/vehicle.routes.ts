import { Router } from 'express';
import VehicleController from '#controllers/vehicle.controller.js';
import { VehicleMediaController } from '#controllers/vehicle-media.controller.js';
import { authenticateJWT } from '#middlewares/auth.middleware.js';
import { authorizeRoles, includeDeletedValidateRole } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import { uploadVehiclePhotos, uploadInspectionReport } from '#middlewares/upload.middleware.js';
import {
  findVehicleSchema,
  findByIdVehicleSchema,
  createVehicleSchema,
  updateVehicleSchema,
  deleteVehicleSchema,
  compareVehiclesSchema,
  reorderPhotosSchema,
  deletePhotoSchema,
} from '#schemas/vehicle.schema.js';

const router = Router();
const vehicleController = new VehicleController();
const vehicleMediaController = new VehicleMediaController();

// 1. Vitrine Pública - Busca e Catálogo Geral (UC01)
router.get('/', validate(findVehicleSchema), vehicleController.findPublic);

// 2. Vitrine Pública - Comparador de Veículos (UC02 - antes de /:id)
router.get('/compare', validate(compareVehiclesSchema), vehicleController.comparePublic);

// 3. Backoffice - Listagem Administrativa (UC06)
router.get(
  '/admin',
  authenticateJWT,
  authorizeRoles('ADMIN', 'VENDEDOR', 'VISUALIZADOR'),
  validate(findVehicleSchema),
  includeDeletedValidateRole,
  vehicleController.findAdmin
);

// 4. Backoffice - Detalhe Administrativo Completo
router.get(
  '/admin/:id',
  authenticateJWT,
  authorizeRoles('ADMIN', 'VENDEDOR', 'VISUALIZADOR'),
  validate(findByIdVehicleSchema),
  vehicleController.findByIdAdmin
);

// 5. Vitrine Pública - Detalhes do Veículo + Métrica Anti-Fraude (RN007)
router.get('/:id', validate(findByIdVehicleSchema), vehicleController.findByIdPublic);

// 6. Backoffice - Cadastro de Veículo (UC06)
router.post(
  '/',
  authenticateJWT,
  authorizeRoles('ADMIN', 'VENDEDOR'),
  validate(createVehicleSchema),
  vehicleController.create
);

// 7. Backoffice - Atualização de Veículo
router.put(
  '/:id',
  authenticateJWT,
  authorizeRoles('ADMIN', 'VENDEDOR'),
  validate(updateVehicleSchema),
  vehicleController.update
);

// 8. Backoffice - Exclusão / Soft Delete (Restrito ao ADMIN)
router.delete(
  '/:id',
  authenticateJWT,
  authorizeRoles('ADMIN'),
  validate(deleteVehicleSchema),
  vehicleController.delete
);

// --- Fase 4: Mídias, Galeria Drag & Drop e Laudo Pericial (RN006, RN008, UC07) ---

// 9. Upload de Fotos do Veículo
router.post(
  '/:id/photos',
  authenticateJWT,
  authorizeRoles('ADMIN', 'VENDEDOR'),
  uploadVehiclePhotos,
  vehicleMediaController.uploadPhotos
);

// 10. Reordenação da Galeria de Fotos
router.patch(
  '/:id/photos/reorder',
  authenticateJWT,
  authorizeRoles('ADMIN', 'VENDEDOR'),
  validate(reorderPhotosSchema),
  vehicleMediaController.reorderPhotos
);

// 11. Exclusão de Foto Específica
router.delete(
  '/:id/photos/:photoId',
  authenticateJWT,
  authorizeRoles('ADMIN', 'VENDEDOR'),
  validate(deletePhotoSchema),
  vehicleMediaController.deletePhoto
);

// 12. Upload / Substituição de Laudo Pericial (PDF)
router.patch(
  '/:id/inspection-report',
  authenticateJWT,
  authorizeRoles('ADMIN', 'VENDEDOR'),
  uploadInspectionReport,
  vehicleMediaController.uploadInspectionReport
);

// 13. Exclusão do Laudo Pericial
router.delete(
  '/:id/inspection-report',
  authenticateJWT,
  authorizeRoles('ADMIN', 'VENDEDOR'),
  vehicleMediaController.deleteInspectionReport
);

export default router;
