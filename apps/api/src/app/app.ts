import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { Config } from '../infrastructure/config/config.js';
import { createAuthService } from '../features/auth/index.js';
import { ApiError, errorHandler } from '../infrastructure/errors/api-error.js';
import { routes } from './routes.js';
export function createApp(config: Config, service = createAuthService(config)) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use((_req, res, next) => {
    res.set('X-Request-Id', randomUUID());
    next();
  });
  app.use(
    cors({
      origin: (origin, done) =>
        done(null, !!origin && config.origins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Vaani-Client',
        'X-Auth-Transport',
      ],
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use('/api/v1', routes(service, config));
  app.use((_req, _res, next) =>
    next(new ApiError(404, 'not_found', 'Endpoint not found.')),
  );
  app.use(errorHandler);
  return app;
}
