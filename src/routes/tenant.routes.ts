import { Router } from 'express';
import TenantController from '#controllers/tenant.controller.js';
import { authenticateJWT } from '#middlewares/auth.middleware.js';
import { authorizeRoles } from '#middlewares/role.middleware.js';

const router = Router();
const tenantController = new TenantController();

router.post('/onboard', tenantController.onboard);
router.get('/me', authenticateJWT, tenantController.getMe);
router.put('/me', authenticateJWT, authorizeRoles('ADMIN'), tenantController.updateMe);

export default router;
