import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_PEPPER: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(900)
    .default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(7776000)
    .default(2592000),
  WEB_ORIGINS: z.string().min(1),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(19456).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(2).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
  AUTH_RATE_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  AUTH_RATE_MAX: z.coerce.number().int().positive().default(50),
  REFRESH_RATE_MAX: z.coerce.number().int().positive().default(120),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = schema.parse(env);
  if (
    c.NODE_ENV === 'production' &&
    [c.ACCESS_TOKEN_SECRET, c.REFRESH_TOKEN_PEPPER].some((secret) =>
      secret.startsWith('replace-with'),
    )
  )
    throw new Error('Production requires real randomly generated secrets');
  const origins = c.WEB_ORIGINS.split(',').map((s) => s.trim());
  for (const origin of origins) {
    const u = new URL(origin);
    if (
      u.origin !== origin ||
      !['http:', 'https:'].includes(u.protocol) ||
      (c.NODE_ENV === 'production' && u.protocol !== 'https:')
    )
      throw new Error(
        'WEB_ORIGINS must contain explicit origins; production requires HTTPS',
      );
  }
  if (c.ACCESS_TOKEN_SECRET === c.REFRESH_TOKEN_PEPPER)
    throw new Error('Signing and refresh secrets must differ');
  return { ...c, origins };
}
export type Config = ReturnType<typeof loadConfig>;
