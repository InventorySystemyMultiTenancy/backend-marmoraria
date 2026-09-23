import { Router } from 'express';
import * as formulaController from './formula.controller';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, asyncHandler(formulaController.getActive));
router.get('/history', requireAuth, asyncHandler(formulaController.getHistory));
router.post('/test', requireAuth, asyncHandler(formulaController.test));
// Sem auth: prévia de preço do orçamento público do site (self-service). Não
// expõe a fórmula nem o detalhamento de acabamento/instalação, só o total.
router.post('/preview/public', asyncHandler(formulaController.previewPricePublic));
// Com auth: prévia do admin, com detalhamento material/acabamento/instalação.
router.post('/preview', requireAuth, asyncHandler(formulaController.previewPrice));
router.put('/', requireAuth, requireRole('MASTER'), asyncHandler(formulaController.update));

export default router;
