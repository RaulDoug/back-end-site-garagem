import { Router } from 'express';
import UserController from '#controllers/user.controller.js';
import { authenticateJWT, loginLimit, registerLimit } from '#middlewares/auth.middleware.js';
import { authorizeRoles } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import { createUserSchema, findByIdUserSchema, loginUserSchema } from '#schemas/user.schema.js';

const router = Router();
const userController = new UserController();

router.post('/register', registerLimit, validate(createUserSchema), userController.register);
router.post('/login', loginLimit, validate(loginUserSchema), userController.login);
router.get('/:id', validate(findByIdUserSchema), authenticateJWT, authorizeRoles('ADMIN', 'VENDEDOR'), userController.findById);

export default router;
