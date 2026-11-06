import { Router } from 'express';
import BrandController from '#controllers/brand.controller.js';
import { authenticateJWT } from '#middlewares/auth.middleware.js';
import { authorizeRoles, includeDeletedValidateRole } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import { findBrandSchema, findByIdBrandSchema, createBrandSchema, updateBrandSchema, deleteBrandSchema } from '#schemas/brand.schema.js';

const router = Router();
const brandController = new BrandController();

router.use(authenticateJWT);
router.use(authorizeRoles('ADMIN', 'VENDEDOR'));

router.get('/',  validate(findBrandSchema), includeDeletedValidateRole, brandController.find);
router.get('/:id', validate(findByIdBrandSchema), brandController.findById);
router.post('/', validate(createBrandSchema), brandController.create);
router.put('/:id', validate(updateBrandSchema), brandController.update);
router.delete('/:id', authorizeRoles('ADMIN'), validate(deleteBrandSchema), brandController.delete);

export default router;