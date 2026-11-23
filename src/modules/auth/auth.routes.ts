import { Router } from 'express';
import * as authController from './auth.controller';
import { requireAuth, requireSiteAuth } from '../../middlewares/auth';
import { authLimiter } from '../../middlewares/rateLimiter';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.post('/login', authLimiter, asyncHandler(authController.login));
router.post('/site-login', authLimiter, asyncHandler(authController.siteLogin));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', requireAuth, asyncHandler(authController.me));
router.get('/session', requireSiteAuth, asyncHandler(authController.session));

export default router;
