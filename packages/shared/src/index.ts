import { z } from 'zod';

export { ERROR_CODES } from './errors.js';
export const ROLE = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  timestamp: number;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
