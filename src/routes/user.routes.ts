import { Router } from 'express';
import UserController from '#controllers/user.controller.js';
import { authenticateJWT, loginLimit, registerLimit } from '#middlewares/auth.middleware.js';
import { authorizeRoles, includeDeletedValidateRole } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import { createUserSchema, deleteUserSchema, findByIdUserSchema, findUserSchema, loginUserSchema, updateUserSchema } from '#schemas/user.schema.js';

const router = Router();
const userController = new UserController();

router.post('/login', loginLimit, validate(loginUserSchema), userController.login);
router.get('/:id', validate(findByIdUserSchema), authenticateJWT, authorizeRoles('ADMIN', 'VENDEDOR'), userController.findById);

router.use(authenticateJWT);
router.get('/', validate(findUserSchema), authorizeRoles('ADMIN', 'VENDEDOR'), includeDeletedValidateRole, userController.find);
router.post('/register', registerLimit, authorizeRoles('ADMIN'), validate(createUserSchema), userController.register);
router.put('/:id', validate(updateUserSchema), authorizeRoles('ADMIN'), userController.update);
router.delete('/:id', validate(deleteUserSchema), authorizeRoles('ADMIN'), userController.delete);

export default router;
