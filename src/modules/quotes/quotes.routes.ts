import { Router } from 'express';
import * as controller from './quotes.controller';
import { requireAuth, requireRole, requireSiteAuth } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/permissions';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// Orçamento self-service do site: exige login (cliente com acesso criado pelo
// admin, ou o próprio funcionário/admin).
router.post('/public', requireSiteAuth, asyncHandler(controller.create));

router.get('/', requireAuth, requirePermission('quotes_view'), asyncHandler(controller.list));
router.get('/:id', requireAuth, requirePermission('quotes_view'), asyncHandler(controller.getOne));
router.post('/', requireAuth, requirePermission('quotes_create'), asyncHandler(controller.create));
router.put('/:id', requireAuth, requirePermission('quotes_edit'), asyncHandler(controller.update));
// Ajuste manual do valor de material/acabamento/instalação de um item — só o
// MASTER pode, inclusive em orçamentos já aprovados.
router.patch(
  '/:id/items/:itemId/values',
  requireAuth,
  requireRole('MASTER'),
  asyncHandler(controller.updateItemValues)
);
router.patch(
  '/:id/discount',
  requireAuth,
  requirePermission('quotes_edit'),
  asyncHandler(controller.updateDiscount)
);
// Nome e dados do cliente (atualiza o cadastro se for cliente cadastrado).
router.patch(
  '/:id/client',
  requireAuth,
  requirePermission('quotes_edit'),
  asyncHandler(controller.updateClientInfo)
);
// Endereço de entrega, distância e frete (recalcula o total).
router.patch(
  '/:id/freight',
  requireAuth,
  requirePermission('quotes_edit'),
  asyncHandler(controller.updateFreight)
);
// Mostrar ou não o custo adicional (extras) no PDF e no acompanhamento do cliente.
router.patch(
  '/:id/show-extras',
  requireAuth,
  requirePermission('quotes_edit'),
  asyncHandler(controller.updateShowExtras)
);
// Mostrar ou não o valor total (soma dos itens) no PDF e no acompanhamento.
router.patch(
  '/:id/hide-total',
  requireAuth,
  requirePermission('quotes_edit'),
  asyncHandler(controller.updateHideTotal)
);
router.patch(
  '/:id/status',
  requireAuth,
  requirePermission('quotes_approve'),
  asyncHandler(controller.updateStatus)
);
router.delete('/:id', requireAuth, requirePermission('quotes_delete'), asyncHandler(controller.remove));

export default router;
