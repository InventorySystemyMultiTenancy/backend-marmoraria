import { Router } from 'express';
import * as controller from './dashboard.controller';
import { requireAuth } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/summary', requireAuth, asyncHandler(controller.summary));

export default router;
