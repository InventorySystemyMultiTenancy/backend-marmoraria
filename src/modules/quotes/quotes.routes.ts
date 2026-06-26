import { Router } from 'express';
import * as controller from './quotes.controller';
import { requireAuth } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/permissions';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// Rota pública para orçamento self-service do e-commerce
router.post('/public', asyncHandler(controller.create));

router.get('/', requireAuth, requirePermission('quotes_view'), asyncHandler(controller.list));
router.get('/:id', requireAuth, requirePermission('quotes_view'), asyncHandler(controller.getOne));
router.post('/', requireAuth, requirePermission('quotes_create'), asyncHandler(controller.create));
router.put('/:id', requireAuth, requirePermission('quotes_edit'), asyncHandler(controller.update));
router.patch(
  '/:id/status',
  requireAuth,
  requirePermission('quotes_approve'),
  asyncHandler(controller.updateStatus)
);
router.delete('/:id', requireAuth, requirePermission('quotes_delete'), asyncHandler(controller.remove));

export default router;
