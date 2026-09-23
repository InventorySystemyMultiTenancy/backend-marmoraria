import 'dotenv/config';
import app from './app';
import { logger } from './utils/logger';
import { upgradeLegacyDefaultFormula } from './modules/formula/formula.controller';

const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  logger.info(`Servidor rodando na porta ${port}`);
  upgradeLegacyDefaultFormula().catch((err) =>
    logger.error(`Falha ao atualizar a fórmula padrão: ${(err as Error).message}`)
  );
});
