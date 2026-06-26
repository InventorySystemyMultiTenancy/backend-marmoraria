import 'dotenv/config';
import app from './app';
import { logger } from './utils/logger';

const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  logger.info(`Servidor rodando na porta ${port}`);
});
