import { Router } from 'express';
import * as controller from './company.controller';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/public', asyncHandler(controller.getPublic));
router.get('/', requireAuth, asyncHandler(controller.getOne));
router.put('/', requireAuth, requireRole('MASTER', 'ADMIN'), asyncHandler(controller.upsert));

export default router;
