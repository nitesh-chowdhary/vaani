import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Local development only. Production always requires explicit environment config.
export function localDevelopmentEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (env.NODE_ENV && env.NODE_ENV !== 'development') return env;
  const result = { ...env };
  if (!result.MONGODB_URI) {
    const files = ['creds.md', 'cred.md'].map((name) =>
      fileURLToPath(new URL(`../../../../../${name}`, import.meta.url)),
    );
    const file = files.find(existsSync);
    if (file) {
      const text = readFileSync(file, 'utf8');
      result.MONGODB_URI = mongoUriFromCredentials(text);
    } else result.MONGODB_URI = 'mongodb://127.0.0.1:27017/vaani';
  }
  result.ACCESS_TOKEN_SECRET ??= randomBytes(48).toString('base64url');
  result.REFRESH_TOKEN_PEPPER ??= randomBytes(48).toString('base64url');
  result.WEB_ORIGINS ??= 'http://localhost:5173';
  return result;
}

export function mongoUriFromCredentials(text: string): string {
  const uri = text.match(/mongodb(?:\+srv)?:\/\/[^\s`]+/)?.[0];
  if (!uri)
    throw new Error('Local credential file must contain a MongoDB URI.');
  const url = new URL(uri);
  const field = (name: string) => {
    const line = text
      .split(/\r?\n/)
      .find((value) => new RegExp(`^\\s*${name}\\s`, 'i').test(value));
    if (!line) return undefined;
    return line
      .replace(new RegExp(`^\\s*${name}\\s*(?:[:=-]\\s*)?`, 'i'), '')
      .trim()
      .replace(/^(["'`])(.*)\1$/, '$2');
  };
  const username = field('username');
  const password = field('password');
  if (username) url.username = encodeURIComponent(username);
  if (password) url.password = encodeURIComponent(password);
  if (url.username.includes('%3C') || url.password.includes('%3C')) {
    throw new Error(
      'Replace MongoDB credential placeholders in the local credential file.',
    );
  }
  url.pathname = '/vaani';
  return url.toString();
}
