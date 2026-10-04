import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import argon2 from 'argon2';
import { SignJWT } from 'jose';
import { createApp } from '../../app/app.js';
import { loadConfig } from '../../infrastructure/config/config.js';
import { User } from './auth.model.js';
import { AuthSession } from './auth-session.model.js';
import { createAuthService } from './auth.service.js';
const password = 'a long simple passphrase';
const config = loadConfig({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://test',
  ACCESS_TOKEN_SECRET: 'a'.repeat(48),
  REFRESH_TOKEN_PEPPER: 'b'.repeat(48),
  WEB_ORIGINS: 'http://localhost:5173',
  AUTH_RATE_MAX: '1000',
  REFRESH_RATE_MAX: '1000',
});
const service = createAuthService(config);
const app = createApp(config, service);
let mongo: MongoMemoryServer;
const post = (path: string, body: object = {}) =>
  request(app)
    .post(`/api/v1/auth/${path}`)
    .set('Origin', config.origins[0])
    .set('X-Vaani-Client', '1')
    .send(body);
const cookie = (res: { headers: Record<string, unknown> }) =>
  (res.headers['set-cookie'] as string[])[0].split(';')[0];
const refresh = (credential: string) =>
  post('refresh').set('Cookie', credential);
const signup = () => post('signup', { email: 'user@example.com', password });
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), AuthSession.init()]);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AuthSession.deleteMany({})]);
});

describe('signup', () => {
  it('creates only sanitized identity, normalizes email, and hashes password', async () => {
    const result = await post('signup', {
      email: '  USER@Example.com  ',
      password,
    });
    expect(result.status).toBe(201);
    expect(result.body.user).toEqual({
      id: expect.any(String),
      email: 'user@example.com',
      status: 'active',
      createdAt: expect.any(String),
    });
    expect(result.body).not.toHaveProperty('refreshToken');
    expect(result.body).not.toHaveProperty('passwordHash');
    const user = await User.findOne().select('+passwordHash');
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(user!.passwordHash, password)).toBe(true);
    expect(user!.emailNormalized).toBe('user@example.com');
    const session = await AuthSession.findOne().select(
      '+refreshTokenHash +usedTokenHashes',
    );
    const raw = decodeURIComponent(cookie(result).split('=')[1]);
    expect(session!.refreshTokenHash).toBe(service.hashToken(raw));
    expect(JSON.stringify(session)).not.toContain(raw);
    expect(JSON.stringify(user)).not.toContain(password);
    expect(cookie(result)).toMatch(/^vaani_refresh=/);
    expect(result.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(result.headers['set-cookie'][0]).toContain('SameSite=Strict');
    expect(result.headers['set-cookie'][0]).toContain('Path=/api/v1/auth');
  });
  it('rejects duplicate normalized email', async () => {
    await signup();
    const response = await post('signup', {
      email: 'USER@EXAMPLE.COM',
      password,
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('account_unavailable');
    expect(await User.countDocuments()).toBe(1);
  });
  it('unique index handles simultaneous signup', async () => {
    const results = await Promise.all([signup(), signup()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it.each([
    { email: 'bad', password },
    { email: 'user@example.com', password: 'abcdefg' },
    { email: 'user@example.com', password: 'x'.repeat(129) },
    { email: 'x'.repeat(255) + '@example.com', password },
    { email: 23, password },
    { email: 'user@example.com', password: null },
    { email: 'user@example.com', password, name: 'unapproved' },
  ])('rejects invalid payload %j', async (body) => {
    expect((await post('signup', body)).status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });
  it('accepts exactly eight characters for signup and login', async () => {
    const credentials = { email: 'user@example.com', password: 'abcdefgh' };
    expect((await post('signup', credentials)).status).toBe(201);
    expect((await post('login', credentials)).status).toBe(200);
  });
  it('accepts a long passphrase without composition rules', async () => {
    expect(
      (
        await post('signup', {
          email: 'user@example.com',
          password: 'a'.repeat(128),
        })
      ).status,
    ).toBe(201);
  });
});
describe('login', () => {
  beforeEach(async () => {
    await signup();
  });
  it('accepts valid and case-normalized credentials, with independent sessions', async () => {
    const res = await post('login', { email: 'USER@Example.com', password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(await AuthSession.countDocuments()).toBe(2);
  });
  it('unknown email and wrong password have identical responses', async () => {
    const unknown = await post('login', {
      email: 'unknown@example.com',
      password,
    });
    const wrong = await post('login', {
      email: 'user@example.com',
      password: 'wrong long passphrase',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(wrong.body.error.code).toBe('invalid_credentials');
  });
  it('disabled users receive generic failure', async () => {
    await User.updateOne({}, { $set: { status: 'disabled' } });
    const res = await post('login', { email: 'user@example.com', password });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });
});
describe('refresh and mobile-independent service', () => {
  it('rotates, updates lastUsedAt, retains fixed expiry and rejects reuse by revoking the session', async () => {
    const signed = await signup();
    const old = await AuthSession.findOne();
    const result = await refresh(cookie(signed));
    expect(result.status).toBe(200);
    expect(cookie(result)).not.toBe(cookie(signed));
    const session = await AuthSession.findOne();
    expect(session!.lastUsedAt.getTime()).toBeGreaterThanOrEqual(
      old!.lastUsedAt.getTime(),
    );
    expect(session!.expiresAt).toEqual(old!.expiresAt);
    expect((await refresh(cookie(signed))).status).toBe(401);
    expect((await refresh(cookie(result))).status).toBe(401);
    expect((await AuthSession.findOne())!.revokedAt).toBeTruthy();
  });
  it('rejects expired credentials even before TTL cleanup', async () => {
    const res = await signup();
    await AuthSession.updateOne(
      {},
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect((await refresh(cookie(res))).status).toBe(401);
  });
  it('rejects revoked sessions', async () => {
    const res = await signup();
    await AuthSession.updateOne({}, { $set: { revokedAt: new Date() } });
    expect((await refresh(cookie(res))).status).toBe(401);
  });
  it('disabled user cannot refresh or use an existing access token', async () => {
    const res = await signup();
    await User.updateOne({}, { $set: { status: 'disabled' } });
    expect((await refresh(cookie(res))).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .auth(res.body.accessToken, { type: 'bearer' })
      ).status,
    ).toBe(401);
  });
  it.each(['garbage', '', 'f'.repeat(24) + '.' + 'a'.repeat(43)])(
    'rejects malformed or unknown credential %s',
    async (token) => {
      expect(
        (await post('refresh').set('Cookie', `vaani_refresh=${token}`)).status,
      ).toBe(401);
    },
  );
  it('does not revoke a session for an unrecognized token secret', async () => {
    const result = await service.signup('user@example.com', password);
    const id = result.refreshToken.split('.')[0];
    await expect(
      service.refresh(id + '.' + 'a'.repeat(43)),
    ).rejects.toMatchObject({ code: 'invalid_refresh' });
    expect((await service.refresh(result.refreshToken)).user.email).toBe(
      'user@example.com',
    );
  });
  it('atomically prevents two simultaneous rotations', async () => {
    const result = await service.signup('user@example.com', password);
    const outcomes = await Promise.allSettled([
      service.refresh(result.refreshToken),
      service.refresh(result.refreshToken),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect((await AuthSession.findOne())!.revokedAt).toBeTruthy();
  });
  it('service refresh accepts a credential without Express or cookies', async () => {
    const result = await service.signup('user@example.com', password);
    const next = await service.refresh(result.refreshToken);
    expect(next.refreshToken).not.toBe(result.refreshToken);
    expect(next.user.id).toBe(result.user.id);
    expect(await service.identify(next.accessToken)).toEqual(result.user);
  });
  it('native transport returns credentials and rotates without cookies', async () => {
    const nativePost = (path: string, body: object) =>
      request(app)
        .post('/api/v1/auth/' + path)
        .set('X-Auth-Transport', 'native')
        .set('X-Vaani-Client', '1')
        .send(body);
    const signed = await nativePost('signup', {
      email: 'user@example.com',
      password,
    });
    expect(signed.status).toBe(201);
    expect(signed.headers['set-cookie']).toBeUndefined();
    expect(signed.body.refreshToken).toBeTruthy();
    const result = await nativePost('refresh', {
      refreshToken: signed.body.refreshToken,
    });
    expect(result.status).toBe(200);
    expect(result.body.refreshToken).not.toBe(signed.body.refreshToken);
    expect(
      (await nativePost('logout', { refreshToken: result.body.refreshToken }))
        .status,
    ).toBe(204);
  });
});
describe('logout', () => {
  it('revokes, clears the cookie, and is safe to repeat', async () => {
    const signed = await signup();
    const credential = cookie(signed);
    const logout = await post('logout').set('Cookie', credential);
    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie'][0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    expect((await post('logout').set('Cookie', credential)).status).toBe(204);
    expect((await post('logout')).status).toBe(204);
    expect((await refresh(credential)).status).toBe(401);
  });
  it('malformed logout credential is idempotent', async () => {
    expect(
      (await post('logout').set('Cookie', 'vaani_refresh=invalid')).status,
    ).toBe(204);
  });
  it('logout accepts a previously rotated credential to revoke its session', async () => {
    const signed = await signup();
    const rotated = await refresh(cookie(signed));
    await post('logout').set('Cookie', cookie(signed));
    expect((await refresh(cookie(rotated))).status).toBe(401);
  });
});
describe('current user and access tokens', () => {
  it('valid token returns only sanitized user data', async () => {
    const signed = await signup();
    const res = await request(app)
      .get('/api/v1/auth/me')
      .auth(signed.body.accessToken, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: signed.body.user });
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('requires a token', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  });
  it.each(['malformed', 'eyJhbGciOiJub25lIn0.e30.'])(
    'rejects malformed token %s',
    async (token) => {
      expect(
        (
          await request(app)
            .get('/api/v1/auth/me')
            .auth(token, { type: 'bearer' })
        ).status,
      ).toBe(401);
    },
  );
  it('rejects expired, wrong-signature, and wrong-audience tokens', async () => {
    const signed = await signup();
    for (const variant of ['expired', 'signature', 'audience']) {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(signed.body.user.id)
        .setIssuer('vaani-api')
        .setAudience(variant === 'audience' ? 'other' : 'vaani-clients')
        .setExpirationTime(
          variant === 'expired' ? Math.floor(Date.now() / 1000) - 1 : '15m',
        )
        .sign(
          new TextEncoder().encode(
            variant === 'signature'
              ? 'wrong'.repeat(12)
              : config.ACCESS_TOKEN_SECRET,
          ),
        );
      expect(
        (
          await request(app)
            .get('/api/v1/auth/me')
            .auth(token, { type: 'bearer' })
        ).status,
      ).toBe(401);
    }
  });
});
describe('request safety', () => {
  it('does not log secrets during signup, login, refresh, or errors', async () => {
    const spies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];
    try {
      const signed = await signup();
      await post('login', { email: 'user@example.com', password });
      await refresh(cookie(signed));
      await post('login', {
        email: 'user@example.com',
        password: 'wrong long passphrase',
      });
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
  it('requires custom header and explicit allowed Origin', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/signup')
          .set('Origin', config.origins[0])
          .send({ email: 'user@example.com', password })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/signup')
          .set('X-Vaani-Client', '1')
          .send({ email: 'user@example.com', password })
      ).status,
    ).toBe(403);
    expect(
      (
        await post('signup', { email: 'user@example.com', password }).set(
          'Origin',
          'https://evil.example',
        )
      ).status,
    ).toBe(403);
  });
  it('native marker cannot bypass browser CSRF checks', async () => {
    expect(
      (
        await post('signup', { email: 'user@example.com', password }).set(
          'X-Auth-Transport',
          'native',
        )
      ).status,
    ).toBe(403);
  });
  it('rejects form data and malformed JSON with stable envelopes', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', config.origins[0])
          .set('X-Vaani-Client', '1')
          .type('form')
          .send({ email: 'user@example.com', password })
      ).status,
    ).toBe(403);
    const bad = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', config.origins[0])
      .set('X-Vaani-Client', '1')
      .type('json')
      .send('{');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_json');
    expect(JSON.stringify(bad.body)).not.toContain('stack');
  });
  it('rejects oversized bodies', async () => {
    const response = await post('login', {
      email: 'user@example.com',
      password: 'a'.repeat(20000),
    });
    expect(response.status).toBe(413);
  });
  it('CORS allows only configured origins and adds security headers', async () => {
    const ok = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', config.origins[0])
      .set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe(config.origins[0]);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
  });
  it('production refresh cookie is Secure and HttpOnly', async () => {
    const production = createApp({ ...config, NODE_ENV: 'production' });
    const res = await request(production)
      .post('/api/v1/auth/signup')
      .set('Origin', config.origins[0])
      .set('X-Vaani-Client', '1')
      .send({ email: 'user@example.com', password });
    expect(res.headers['set-cookie'][0]).toContain('Secure');
    expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
  });
  it('rate limits credential and refresh attempts with stable errors', async () => {
    const limited = createApp({
      ...config,
      AUTH_RATE_MAX: 1,
      REFRESH_RATE_MAX: 1,
    });
    const call = (path: string) =>
      request(limited)
        .post('/api/v1/auth/' + path)
        .set('Origin', config.origins[0])
        .set('X-Vaani-Client', '1')
        .send({});
    await call('signup');
    expect((await call('login')).status).toBe(429);
    await call('refresh');
    const res = await call('refresh');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate_limited');
  });
  it('production configuration rejects wildcard origins and insecure URLs', () => {
    for (const origin of ['*', 'http://example.com'])
      expect(() =>
        loadConfig({
          ...process.env,
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb://test',
          ACCESS_TOKEN_SECRET: 'a'.repeat(48),
          REFRESH_TOKEN_PEPPER: 'b'.repeat(48),
          WEB_ORIGINS: origin,
        }),
      ).toThrow();
  });
});

describe('local configuration', () => {
  it('replaces credential placeholders with dash-delimited values safely', async () => {
    const { mongoUriFromCredentials } =
      await import('../../infrastructure/config/local-env.js');
    const uri = mongoUriFromCredentials(
      'username - example-user\npassword - example@#$%pass\nurl - mongodb+srv://<db_username>:<db_password>@example.mongodb.net/?retryWrites=true',
    );
    const parsed = new URL(uri);
    expect(decodeURIComponent(parsed.username)).toBe('example-user');
    expect(decodeURIComponent(parsed.password)).toBe('example@#$%pass');
    expect(parsed.pathname).toBe('/vaani');
    expect(parsed.searchParams.get('retryWrites')).toBe('true');
  });
  it('preserves credentials from a complete URI', async () => {
    const { mongoUriFromCredentials } =
      await import('../../infrastructure/config/local-env.js');
    expect(
      mongoUriFromCredentials('mongodb://user:secret@localhost:27017/'),
    ).toBe('mongodb://user:secret@localhost:27017/vaani');
  });
  it('production/test never read local credential files or invent secrets', async () => {
    const { localDevelopmentEnv } =
      await import('../../infrastructure/config/local-env.js');
    for (const environment of ['production', 'test']) {
      const env = { NODE_ENV: environment };
      expect(localDevelopmentEnv(env)).toBe(env);
      expect(localDevelopmentEnv(env).MONGODB_URI).toBeUndefined();
    }
  });
  it('rejects unresolved local credential placeholders', async () => {
    const { mongoUriFromCredentials } =
      await import('../../infrastructure/config/local-env.js');
    expect(() =>
      mongoUriFromCredentials(
        'mongodb+srv://<username>:<password>@example.mongodb.net',
      ),
    ).toThrow('placeholders');
  });
});
