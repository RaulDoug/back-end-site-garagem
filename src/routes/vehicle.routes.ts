import { Router } from 'express';
import VehicleController from '#controllers/vehicle.controller.js';
import { authenticateJWT } from '#middlewares/auth.middleware.js';
import { authorizeRoles, includeDeletedValidateRole } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import {
  findVehicleSchema,
  findByIdVehicleSchema,
  createVehicleSchema,
  updateVehicleSchema,
  deleteVehicleSchema,
  compareVehiclesSchema,
} from '#schemas/vehicle.schema.js';

const router = Router();
const vehicleController = new VehicleController();

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

export default router;
