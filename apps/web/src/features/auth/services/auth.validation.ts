import { z } from 'zod';
export const credentialsSchema = z.object({
  email: z.string().trim().max(254).email('Enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(128, 'Use no more than 128 characters.'),
});
