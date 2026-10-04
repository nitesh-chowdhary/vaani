import { z } from 'zod';
import { ApiError } from '../../infrastructure/errors/api-error.js';
export const credentialsSchema = z
  .object({
    email: z.string().trim().min(3).max(254).email(),
    password: z.string().min(8).max(128),
  })
  .strict();
export const refreshSchema = z
  .object({ refreshToken: z.string().max(256) })
  .strict();
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(
      400,
      'invalid_input',
      'Provide a valid email and a password of 8–128 characters, or a valid refresh credential.',
    );
  return result.data;
}
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const logoutSchema = z
  .object({ refreshToken: z.string().max(256).optional() })
  .strict();
