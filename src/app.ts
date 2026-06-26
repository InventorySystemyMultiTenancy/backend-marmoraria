import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { apiLimiter } from './middlewares/rateLimiter';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import clientsRoutes from './modules/clients/clients.routes';
import marblesRoutes from './modules/marbles/marbles.routes';
import stockRoutes from './modules/stock/stock.routes';
import quotesRoutes from './modules/quotes/quotes.routes';
import ordersRoutes from './modules/orders/orders.routes';
import financialRoutes from './modules/financial/financial.routes';
import formulaRoutes from './modules/formula/formula.routes';
import pdfRoutes from './modules/pdf/pdf.routes';
import companyRoutes from './modules/company/company.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));
app.use('/api', apiLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/marbles', marblesRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/formula', formulaRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
