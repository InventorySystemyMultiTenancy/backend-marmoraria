import { Router } from 'express';
import * as controller from './pdf.controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// O ID do orçamento é um cuid não-adivinhável, então o link do PDF pode ser
// compartilhado diretamente com o cliente sem exigir login.
router.get('/quote/:quoteId', asyncHandler(controller.generateQuotePdf));

export default router;
