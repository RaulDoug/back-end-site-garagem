import { Router } from 'express';
import FeatureController from '#controllers/feature.controller.js';
import { authenticateJWT } from '#middlewares/auth.middleware.js';
import { authorizeRoles } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import {
  findFeatureSchema,
  findByIdFeatureSchema,
  createFeatureSchema,
  updateFeatureSchema,
  deleteFeatureSchema,
} from '#schemas/feature.schema.js';

const router = Router();
const featureController = new FeatureController();

router.use(authenticateJWT);
router.use(authorizeRoles('ADMIN', 'VENDEDOR'));

router.get('/', validate(findFeatureSchema), featureController.find);
router.get('/:id', validate(findByIdFeatureSchema), featureController.findById);
router.post('/', validate(createFeatureSchema), featureController.create);
router.put('/:id', validate(updateFeatureSchema), featureController.update);
router.delete('/:id', authorizeRoles('ADMIN'), validate(deleteFeatureSchema), featureController.delete);

export default router;
