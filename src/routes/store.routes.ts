import { Router } from 'express';
import StoreController from '#controllers/store.controller.js';
import { authenticateJWT } from '#middlewares/auth.middleware.js';
import { authorizeRoles, includeDeletedValidateRole } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import { createStoreSchema, updateStoreSchema, deleteStoreSchema, findByCnpjStoreSchema, findByIdStoreSchema, findStoreSchema } from '#schemas/store.schema.js';

const router = Router();
const storeController =  new StoreController();

router.use(authenticateJWT);

router.get('/', validate(findStoreSchema), authorizeRoles('ADMIN', 'VENDEDOR'), includeDeletedValidateRole, storeController.find);
router.get('/:id', validate(findByIdStoreSchema), authorizeRoles('ADMIN', 'VENDEDOR'), storeController.findById);
router.get('/cnpj/:cnpj', validate(findByCnpjStoreSchema), authorizeRoles('ADMIN', 'VENDEDOR'), storeController.findByCNPJ);
router.post('/', authorizeRoles('ADMIN'), validate(createStoreSchema), storeController.create);
router.put('/:id', authorizeRoles('ADMIN'), validate(updateStoreSchema), storeController.update);
router.delete('/:id', authorizeRoles('ADMIN'), validate(deleteStoreSchema), storeController.delete);

export default router;
