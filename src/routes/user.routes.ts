import { Router } from 'express';
import UserController from '#controllers/user.controller.js';
import { authenticateJWT, loginLimit, registerLimit } from '#middlewares/auth.middleware.js';
import { authorizeRoles, includeDeletedValidateRole } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import { createUserSchema, deleteUserSchema, findByIdUserSchema, loginUserSchema, updateUserSchema } from '#schemas/user.schema.js';

const router = Router();
const userController = new UserController();

router.get('/', authenticateJWT, authorizeRoles('ADMIN', 'VENDEDOR'), includeDeletedValidateRole, userController.find);
router.get('/:id', validate(findByIdUserSchema), authenticateJWT, authorizeRoles('ADMIN', 'VENDEDOR'), userController.findById);
router.post('/register', registerLimit, authenticateJWT, authorizeRoles('ADMIN'), validate(createUserSchema), userController.register);
router.post('/login', loginLimit, validate(loginUserSchema), userController.login);
router.put('/:id', validate(updateUserSchema), authenticateJWT, authorizeRoles('ADMIN'), userController.update);
router.delete('/:id', validate(deleteUserSchema), authenticateJWT, authorizeRoles('ADMIN'), userController.delete);

export default router;
