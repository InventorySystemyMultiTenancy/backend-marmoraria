import { Router } from 'express';
import * as controller from './stock.controller';
import { requireAuth } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/permissions';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, requirePermission('stock_view'), asyncHandler(controller.list));
router.get('/summary', requireAuth, requirePermission('stock_view'), asyncHandler(controller.summary));
router.post('/', requireAuth, requirePermission('stock_add'), asyncHandler(controller.create));
router.put('/:id', requireAuth, requirePermission('stock_edit'), asyncHandler(controller.update));
router.delete('/:id', requireAuth, requirePermission('stock_edit'), asyncHandler(controller.remove));

export default router;
