import { Router } from 'express';
import * as formulaController from './formula.controller';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/', requireAuth, asyncHandler(formulaController.getActive));
router.get('/history', requireAuth, asyncHandler(formulaController.getHistory));
router.post('/test', requireAuth, asyncHandler(formulaController.test));
router.put('/', requireAuth, requireRole('MASTER'), asyncHandler(formulaController.update));

export default router;
