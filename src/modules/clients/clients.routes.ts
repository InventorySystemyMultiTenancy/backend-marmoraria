import { Router } from 'express';
import * as controller from './clients.controller';
import { requireAuth } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/permissions';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, requirePermission('clients_view'), asyncHandler(controller.list));
router.get('/:id', requireAuth, requirePermission('clients_view'), asyncHandler(controller.getOne));
router.post('/', requireAuth, requirePermission('clients_create'), asyncHandler(controller.create));
router.put('/:id', requireAuth, requirePermission('clients_edit'), asyncHandler(controller.update));
router.delete('/:id', requireAuth, requirePermission('clients_delete'), asyncHandler(controller.remove));

export default router;
