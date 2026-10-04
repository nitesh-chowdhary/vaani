import type { RequestHandler } from 'express';
import type { AuthService } from './auth.service.js';
import { ApiError } from '../../infrastructure/errors/api-error.js';
export const authenticate =
  (service: AuthService): RequestHandler =>
  async (req, _res, next) => {
    try {
      const match = /^Bearer ([^ ]+)$/.exec(req.get('authorization') ?? '');
      if (!match)
        throw new ApiError(401, 'unauthorized', 'Authentication required.');
      const user = await service.identify(match[1]);
      req.auth = { userId: user.id, user };
      next();
    } catch (error) {
      next(error);
    }
  };
