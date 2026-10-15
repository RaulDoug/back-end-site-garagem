import { Router } from 'express';
import StoreController from '#controllers/store.controller.js';
import { authenticateJWT } from '#middlewares/auth.middleware.js';
import { authorizeRoles } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import * as storeSchema from '#schemas/store.schema.js';

const router = Router();
const storeController = new StoreController();

router.post('/', validate(storeSchema.createStoreSchema), authenticateJWT, authorizeRoles('ADMIN'), storeController.create);
router.get('/', validate(storeSchema.findStoreSchema), storeController.find);
router.get('/:id', validate(storeSchema.findByIdStoreSchema), storeController.findById);
router.put('/:id', validate(storeSchema.updateStoreSchema), authenticateJWT, authorizeRoles('ADMIN'), storeController.update);
router.delete('/:id', validate(storeSchema.deleteStoreSchema), authenticateJWT, authorizeRoles('ADMIN'), storeController.delete);

export default router;
