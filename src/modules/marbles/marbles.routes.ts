import { Router } from 'express';
import * as controller from './marbles.controller';
import { requireAuth } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/permissions';
import { uploadMarbleImages } from '../../config/cloudinary';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// Rotas públicas (e-commerce)
router.get('/public', asyncHandler(controller.listPublic));
router.get('/public/:id', asyncHandler(controller.getOne));

// Rotas administrativas
router.get('/', requireAuth, requirePermission('marbles_view'), asyncHandler(controller.listAdmin));
router.get('/:id', requireAuth, requirePermission('marbles_view'), asyncHandler(controller.getOne));
router.post('/', requireAuth, requirePermission('marbles_create'), asyncHandler(controller.create));
router.put('/:id', requireAuth, requirePermission('marbles_edit'), asyncHandler(controller.update));
router.delete('/:id', requireAuth, requirePermission('marbles_delete'), asyncHandler(controller.remove));
router.post(
  '/:id/images',
  requireAuth,
  requirePermission('marbles_edit'),
  uploadMarbleImages.array('images', 10),
  asyncHandler(controller.uploadImages)
);

export default router;
