import { Router } from 'express';
import * as authController from './auth.controller';
import { requireAuth } from '../../middlewares/auth';
import { authLimiter } from '../../middlewares/rateLimiter';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.post('/login', authLimiter, asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', requireAuth, asyncHandler(authController.me));

export default router;
