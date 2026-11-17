import { Router } from 'express';
import TenantController from '#controllers/tenant.controller.js';
import {
  authenticateJWT,
  authenticateOnboardingSecret,
  registerLimit,
} from '#middlewares/auth.middleware.js';
import { authorizeRoles } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import { onboardTenantRouteSchema, updateTenantRouteSchema } from '#schemas/tenant.schema.js';

const router = Router();
const tenantController = new TenantController();

router.post(
  '/onboard',
  registerLimit,
  authenticateOnboardingSecret,
  validate(onboardTenantRouteSchema),
  tenantController.onboard
);
router.get('/me', authenticateJWT, tenantController.getMe);
router.put('/me', authenticateJWT, authorizeRoles('ADMIN'), validate(updateTenantRouteSchema), tenantController.updateMe);

export default router;
