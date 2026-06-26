import { Router } from 'express';
import * as controller from './users.controller';
import { requireAuth } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/permissions';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, requirePermission('users_view'), asyncHandler(controller.list));
router.get('/:id', requireAuth, requirePermission('users_view'), asyncHandler(controller.getOne));
router.post('/', requireAuth, requirePermission('users_create'), asyncHandler(controller.create));
router.put('/:id', requireAuth, requirePermission('users_edit'), asyncHandler(controller.update));
router.put(
  '/:id/permissions',
  requireAuth,
  requirePermission('users_set_permissions'),
  asyncHandler(controller.updatePermissions)
);
router.delete('/:id', requireAuth, requirePermission('users_edit'), asyncHandler(controller.remove));

export default router;
