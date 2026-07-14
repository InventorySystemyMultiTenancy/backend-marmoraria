import { Router } from 'express';
import multer from 'multer';
import * as controller from './ai.controller';
import { aiRecommendLimiter } from '../../middlewares/rateLimiter';
import { asyncHandler } from '../../utils/asyncHandler';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Envie um arquivo de imagem'));
    cb(null, true);
  },
});

const router = Router();

router.post('/recommend-marble', aiRecommendLimiter, upload.single('photo'), asyncHandler(controller.recommendMarble));

export default router;
