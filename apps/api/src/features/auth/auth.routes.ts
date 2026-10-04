import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Config } from '../../infrastructure/config/config.js';
import type { AuthService } from './auth.service.js';
import { authController } from './auth.controller.js';
import { authenticate } from './auth.middleware.js';
import { ApiError } from '../../infrastructure/errors/api-error.js';
export function authRoutes(service: AuthService, c: Config) {
  const router = Router();
  const controller = authController(service, c);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use((req, _res, next) => {
    if (req.method === 'GET') return next();
    const origin = req.get('origin');
    const transport = req.get('x-auth-transport');
    if (transport && !['web', 'native'].includes(transport))
      return next(
        new ApiError(
          400,
          'invalid_transport',
          'Invalid authentication transport.',
        ),
      );
    // Browsers cannot bypass Origin checks by selecting native transport.
    if (origin && !c.origins.includes(origin))
      return next(
        new ApiError(403, 'untrusted_origin', 'Request origin is not allowed.'),
      );
    if (transport === 'native' && (origin || req.cookies?.vaani_refresh))
      return next(
        new ApiError(
          403,
          'invalid_transport',
          'Native transport does not accept browser credentials.',
        ),
      );
    if (transport !== 'native' && (!origin || !c.origins.includes(origin)))
      return next(
        new ApiError(
          403,
          'untrusted_origin',
          'A trusted browser origin is required.',
        ),
      );
    if (req.get('x-vaani-client') !== '1' || !req.is('application/json'))
      return next(
        new ApiError(
          403,
          'csrf_rejected',
          'JSON and the client request header are required.',
        ),
      );
    next();
  });
  const limit = (max: number) =>
    rateLimit({
      windowMs: c.AUTH_RATE_WINDOW_MS,
      limit: max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: {
          code: 'rate_limited',
          message: 'Too many attempts. Try again later.',
        },
      },
    });
  const credentialsLimit = limit(c.AUTH_RATE_MAX);
  router.post('/signup', credentialsLimit, controller.signup);
  router.post('/login', credentialsLimit, controller.login);
  router.post('/refresh', limit(c.REFRESH_RATE_MAX), controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', authenticate(service), controller.me);
  return router;
}
