import { Router } from 'express';
import ModelController from '#controllers/model.controller.js';
import { authenticateJWT } from '#middlewares/auth.middleware.js';
import { authorizeRoles, includeDeletedValidateRole } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import {
  findModelSchema,
  findByIdModelSchema,
  createModelSchema,
  updateModelSchema,
  deleteModelSchema,
} from '#schemas/model.schema.js';

const router = Router();
const modelController = new ModelController();

router.use(authenticateJWT);
router.use(authorizeRoles('ADMIN', 'VENDEDOR'));

router.get('/', validate(findModelSchema), includeDeletedValidateRole, modelController.find);
router.get('/:id', validate(findByIdModelSchema), modelController.findById);
router.post('/', validate(createModelSchema), modelController.create);
router.put('/:id', validate(updateModelSchema), modelController.update);
router.delete('/:id', authorizeRoles('ADMIN'), validate(deleteModelSchema), modelController.delete);

export default router;
