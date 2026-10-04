import type { Request, Response } from 'express';
import type { Config } from '../../infrastructure/config/config.js';
import type { AuthService } from './auth.service.js';
import type { AuthResult } from './auth.types.js';
import {
  credentialsSchema,
  refreshSchema,
  logoutSchema,
  parse,
} from './auth.validation.js';
import { ApiError } from '../../infrastructure/errors/api-error.js';
const cookieName = 'vaani_refresh';
export function authController(service: AuthService, c: Config) {
  const options = {
    httpOnly: true,
    secure: c.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
  };
  const native = (req: Request) => req.get('x-auth-transport') === 'native';
  const credential = (req: Request, optional = false) =>
    native(req)
      ? (optional
          ? parse(logoutSchema, req.body)
          : parse(refreshSchema, req.body)
        ).refreshToken
      : req.cookies?.[cookieName];
  function respond(
    req: Request,
    res: Response,
    result: AuthResult,
    status = 200,
  ) {
    const { refreshToken, refreshExpiresAt, ...body } = result;
    res.set('Cache-Control', 'no-store');
    if (native(req))
      res.status(status).json({ ...body, refreshToken, refreshExpiresAt });
    else {
      const expiry = new Date(refreshExpiresAt);
      res.cookie(cookieName, refreshToken, { ...options, expires: expiry });
      res.status(status).json(body);
    }
  }
  return {
    signup: async (req: Request, res: Response) => {
      const input = parse(credentialsSchema, req.body);
      respond(req, res, await service.signup(input.email, input.password), 201);
    },
    login: async (req: Request, res: Response) => {
      const input = parse(credentialsSchema, req.body);
      respond(req, res, await service.login(input.email, input.password));
    },
    refresh: async (req: Request, res: Response) => {
      const token = credential(req);
      if (typeof token !== 'string')
        throw new ApiError(401, 'invalid_refresh', 'Authentication required.');
      try {
        respond(req, res, await service.refresh(token));
      } catch (error) {
        if (!native(req)) res.clearCookie(cookieName, options);
        throw error;
      }
    },
    logout: async (req: Request, res: Response) => {
      await service.logout(credential(req, true));
      if (!native(req)) res.clearCookie(cookieName, options);
      res.status(204).end();
    },
    me: async (req: Request, res: Response) => {
      res.set('Cache-Control', 'no-store').json({ user: req.auth!.user });
    },
  };
}
