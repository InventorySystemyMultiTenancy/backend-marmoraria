import { Router } from 'express';
import * as controller from './drafts.controller';
import { requireSiteAuth } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';

// Rascunhos de orçamento do usuário logado (cliente no site ou funcionário no
// site/painel). Cada um só enxerga os próprios rascunhos.
const router = Router();

router.use(requireSiteAuth);

router.get('/', asyncHandler(controller.list));
router.get('/current', asyncHandler(controller.getCurrent));
// POST (além de PUT) para funcionar com fetch keepalive ao fechar a página.
router.put('/current', asyncHandler(controller.saveCurrent));
router.post('/current', asyncHandler(controller.saveCurrent));
router.delete('/current', asyncHandler(controller.clearCurrent));
router.post('/', asyncHandler(controller.save));
router.delete('/:id', asyncHandler(controller.remove));

export default router;
