import { Router } from 'express';
import * as controller from './financial.controller';
import { requireAuth } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/permissions';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, requirePermission('financial_view'), asyncHandler(controller.list));
router.get('/summary', requireAuth, requirePermission('financial_view'), asyncHandler(controller.summary));
router.get('/monthly', requireAuth, requirePermission('financial_reports'), asyncHandler(controller.monthly));
router.post('/', requireAuth, requirePermission('financial_create'), asyncHandler(controller.create));
router.put('/:id', requireAuth, requirePermission('financial_edit'), asyncHandler(controller.update));
router.delete('/:id', requireAuth, requirePermission('financial_edit'), asyncHandler(controller.remove));

export default router;
