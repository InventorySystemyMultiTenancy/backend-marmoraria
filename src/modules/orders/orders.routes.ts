import { Router } from 'express';
import * as controller from './orders.controller';
import { requireAuth } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/permissions';
import { trackOrderLimiter } from '../../middlewares/rateLimiter';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.post('/track', trackOrderLimiter, asyncHandler(controller.trackOrder));
router.get('/', requireAuth, requirePermission('orders_view'), asyncHandler(controller.list));
router.get('/stages', requireAuth, requirePermission('orders_view'), asyncHandler(controller.listStageOptions));
router.get('/:id', requireAuth, requirePermission('orders_view'), asyncHandler(controller.getOne));
router.put('/:id', requireAuth, requirePermission('orders_update_status'), asyncHandler(controller.update));
router.patch(
  '/:id/discount',
  requireAuth,
  requirePermission('orders_apply_discount'),
  asyncHandler(controller.applyDiscount)
);
// Exclusão definitiva (pedido + orçamento de origem) — mesma permissão de
// excluir orçamento, já que os dois são apagados juntos.
router.delete('/:id', requireAuth, requirePermission('quotes_delete'), asyncHandler(controller.remove));

export default router;
