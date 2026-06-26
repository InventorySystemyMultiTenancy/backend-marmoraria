import { Router } from 'express';
import * as controller from './dashboard.controller';
import { requireAuth } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/summary', requireAuth, asyncHandler(controller.summary));
router.get('/top-products', requireAuth, asyncHandler(controller.topProducts));
router.get('/quotes-by-status', requireAuth, asyncHandler(controller.quotesByStatus));

export default router;
