import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import express from 'express';
import 'dotenv/config';

import { readEnvironment } from './config/environment.js';
import './config/zod.js';
import { AppError } from './errors/app-error.js';
import { authenticate } from './middlewares/auth.js';
import { errorHandler } from './middlewares/error-handler.js';
import { loadContext, requireRole } from './middlewares/load-context.js';
import { requestLogger } from './middlewares/request-logger.js';
import { testContextMiddleware } from './middlewares/test-context.js';

import authRouter from './routers/authRouter.js';
import categoryRouter from './routers/categoryRouter.js';
import organizationRouter from './routers/organizationRouter.js';
import receiptRouter from './routers/receiptRouter.js';
import reportRouter from './routers/reportRouter.js';
import statementRouter from './routers/statementRouter.js';
import userRouter from './routers/userRouter.js';
import transactionListRouter from './routers/transactionListRouter.js';
import transactionReversalRouter from './routers/transactionReversalRouter.js';
import transactionRouter from './routers/transactionRouter.js';
import transparencyRouter from './routers/transparencyRouter.js';
import membershipRouter from './routers/membershipRouter.js';

function authenticateTestRequest(request: Request, response: Response, next: NextFunction) {
  if (request.contexto) {
    next();
    return;
  }

  authenticate(request, response, next);
}

function respondWithContext(request: Request, response: Response, next: NextFunction) {
  if (!request.contexto) {
    next(new AppError(401, 'Contexto autenticado ausente'));
    return;
  }

  response.json({
    usuarioId: request.contexto.usuarioId.toString(),
    organizacaoId: request.contexto.organizacaoId.toString(),
    papel: request.contexto.papel,
  });
}

export function createApp() {
  const environment = readEnvironment();
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: environment.CORS_ORIGIN,
      credentials: false,
    }),
  );
  app.use(express.json());
  app.use(requestLogger);
  app.use(testContextMiddleware);

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  if (environment.NODE_ENV === 'test') {
    app.get('/test/contexto', authenticateTestRequest, loadContext, respondWithContext);
    app.get(
      '/test/contexto/tesoureiro',
      authenticateTestRequest,
      loadContext,
      requireRole('TESOUREIRO'),
      respondWithContext,
    );
  }

  app.use('/auth', authRouter);
  app.use('/organizacoes', organizationRouter);
  app.use('/users', userRouter);
  app.use('/categorias', categoryRouter);
  app.use('/lancamentos', transactionListRouter);
  app.use('/lancamentos', receiptRouter);
  app.use('/lancamentos', transactionReversalRouter);
  app.use('/extrato', statementRouter);
  app.use('/relatorios', reportRouter);
  app.use('/transactions', transactionRouter);
  app.use('/transparency', transparencyRouter);
  app.use('/membros', membershipRouter);

  app.use((_request, _response, next) => {
    next(new AppError(404, 'Rota não encontrada'));
  });

  app.use(errorHandler);

  return app;
}
