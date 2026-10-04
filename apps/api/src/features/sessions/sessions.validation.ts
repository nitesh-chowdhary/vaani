import { z } from 'zod';
import { ApiError } from '../../infrastructure/errors/api-error.js';
export const startSchema=z.object({minutes:z.number().int().min(5).max(120).default(60)}).strict();
export const actionSchema=z.object({eventId:z.string().uuid(),activityId:z.string().min(1).max(200),action:z.enum(['expose','answer','hint','audio']),response:z.string().max(4000).default(''),inputMode:z.enum(['text','speech','self']).default('text'),selfRating:z.enum(['again','good']).optional(),latencyMs:z.number().min(0).max(3600000).default(0)}).strict();
export const finishSchema=z.object({eventId:z.string().uuid()}).strict();
export function payload<T>(schema:z.ZodType<T>,body:unknown):T {const r=schema.safeParse(body);if(!r.success)throw new ApiError(400,'invalid_input','Invalid course request.');return r.data;}
export type Action=z.infer<typeof actionSchema>;
