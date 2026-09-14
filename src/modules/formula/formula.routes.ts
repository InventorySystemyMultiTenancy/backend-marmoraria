import { Router } from 'express';
import * as formulaController from './formula.controller';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, asyncHandler(formulaController.getActive));
router.get('/history', requireAuth, asyncHandler(formulaController.getHistory));
router.post('/test', requireAuth, asyncHandler(formulaController.test));
// Sem auth: usada pela prévia de preço tanto no admin quanto no orçamento
// público do site (self-service), e não expõe a fórmula em si, só o resultado.
router.post('/preview/public', asyncHandler(formulaController.previewPrice));
router.put('/', requireAuth, requireRole('MASTER'), asyncHandler(formulaController.update));

export default router;
