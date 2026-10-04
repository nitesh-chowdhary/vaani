import { createHmac, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { Types } from 'mongoose';
import type { Config } from '../../infrastructure/config/config.js';
import { ApiError } from '../../infrastructure/errors/api-error.js';
import { User } from './auth.model.js';
import { AuthSession } from './auth-session.model.js';
import { passwordService } from './auth.password.js';
import { normalizeEmail } from './auth.validation.js';
import type { AuthUser, AuthResult } from './auth.types.js';
const invalid = () =>
  new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
const refreshInvalid = () =>
  new ApiError(401, 'invalid_refresh', 'Authentication required.');
export function createAuthService(c: Config) {
  const passwords = passwordService(c);
  const key = new TextEncoder().encode(c.ACCESS_TOKEN_SECRET);
  const hashToken = (token: string) =>
    createHmac('sha256', c.REFRESH_TOKEN_PEPPER).update(token).digest('hex');
  function sanitize(user: {
    _id: Types.ObjectId;
    email: string;
    status: string;
    createdAt: Date;
  }): AuthUser {
    return {
      id: user._id.toString(),
      email: user.email,
      status: user.status as AuthUser['status'],
      createdAt: user.createdAt.toISOString(),
    };
  }
  async function state(
    user: Parameters<typeof sanitize>[0],
    refreshToken: string,
    expiresAt: Date,
  ): Promise<AuthResult> {
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user._id.toString())
      .setIssuer('vaani-api')
      .setAudience('vaani-clients')
      .setIssuedAt()
      .setExpirationTime(`${c.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(key);
    return {
      user: sanitize(user),
      accessToken,
      expiresIn: c.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshExpiresAt: expiresAt.toISOString(),
    };
  }
  async function session(user: Parameters<typeof sanitize>[0]) {
    const id = new Types.ObjectId();
    const token = `${id}.${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + c.REFRESH_TOKEN_TTL_SECONDS * 1000);
    await AuthSession.create({
      _id: id,
      userId: user._id,
      refreshTokenHash: hashToken(token),
      expiresAt,
      lastUsedAt: new Date(),
    });
    return state(user, token, expiresAt);
  }
  function tokenId(token: string) {
    if (!/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(token))
      throw refreshInvalid();
    return token.split('.')[0];
  }
  return {
    hashToken,
    async signup(email: string, password: string) {
      const normalized = normalizeEmail(email);
      if (await User.exists({ emailNormalized: normalized }))
        throw new ApiError(
          409,
          'account_unavailable',
          'Unable to create an account with these credentials.',
        );
      const passwordHash = await passwords.hash(password);
      let user;
      try {
        user = await User.create({
          email: normalized,
          emailNormalized: normalized,
          passwordHash,
        });
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          throw new ApiError(
            409,
            'account_unavailable',
            'Unable to create an account with these credentials.',
          );
        throw error;
      }
      return session(user);
    },
    async login(email: string, password: string) {
      const user = await User.findOne({
        emailNormalized: normalizeEmail(email),
      }).select('+passwordHash');
      const valid = user
        ? await passwords.verify(user.passwordHash, password)
        : await passwords.dummyVerify(password);
      if (!user || !valid || user.status !== 'active') throw invalid();
      return session(user);
    },
    async refresh(token: string) {
      const id = tokenId(token);
      const hash = hashToken(token);
      const old = await AuthSession.findById(id).select(
        '+refreshTokenHash +usedTokenHashes',
      );
      if (!old || old.revokedAt || old.expiresAt.getTime() <= Date.now())
        throw refreshInvalid();
      if (old.refreshTokenHash !== hash) {
        if (old.usedTokenHashes.includes(hash))
          await AuthSession.updateOne(
            { _id: id },
            { $set: { revokedAt: new Date() } },
          );
        throw refreshInvalid();
      }
      const user = await User.findById(old.userId);
      if (!user || user.status !== 'active') {
        await AuthSession.updateOne(
          { _id: id },
          { $set: { revokedAt: new Date() } },
        );
        throw refreshInvalid();
      }
      // Bound replay history. Absolute session lifetime is never extended by rotation.
      if (old.usedTokenHashes.length >= 4096) {
        await AuthSession.updateOne(
          { _id: id },
          { $set: { revokedAt: new Date() } },
        );
        throw refreshInvalid();
      }
      const next = `${id}.${randomBytes(32).toString('base64url')}`;
      const updated = await AuthSession.findOneAndUpdate(
        {
          _id: id,
          refreshTokenHash: hash,
          revokedAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        },
        {
          $set: { refreshTokenHash: hashToken(next), lastUsedAt: new Date() },
          $push: { usedTokenHashes: hash },
        },
      );
      if (!updated) {
        await AuthSession.updateOne(
          { _id: id, usedTokenHashes: hash },
          { $set: { revokedAt: new Date() } },
        );
        throw refreshInvalid();
      }
      return state(user, next, old.expiresAt);
    },
    async logout(token?: string) {
      if (!token) return;
      let id;
      try {
        id = tokenId(token);
      } catch {
        return;
      }
      const hash = hashToken(token);
      await AuthSession.updateOne(
        {
          _id: id,
          $or: [{ refreshTokenHash: hash }, { usedTokenHashes: hash }],
        },
        { $set: { revokedAt: new Date() } },
      );
    },
    async identify(token: string) {
      let subject: string;
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: 'vaani-api',
          audience: 'vaani-clients',
        });
        if (!payload.sub || !Types.ObjectId.isValid(payload.sub))
          throw new Error();
        subject = payload.sub;
      } catch {
        throw new ApiError(401, 'unauthorized', 'Authentication required.');
      }
      const user = await User.findById(subject);
      if (!user || user.status !== 'active')
        throw new ApiError(401, 'unauthorized', 'Authentication required.');
      return sanitize(user);
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
