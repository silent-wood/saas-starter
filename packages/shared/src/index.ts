import { z } from 'zod';

export { ERROR_CODES } from './errors.js';
export const ROLE = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const loginSchema = z.object({
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码').min(8, '密码至少 8 位'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * 注册接口契约（不含 confirmPassword —— 二次确认属前端表单关注点，
 * 由 web 侧 `registerSchema.extend({ confirmPassword })` 组合而来）
 */
export const registerSchema = z.object({
  companyName: z.string().min(2, '公司名称至少 2 个字符').max(50, '公司名称不超过 50 个字符'),
  name: z.string().min(2, '姓名至少 2 个字符').max(20, '姓名不超过 20 个字符'),
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(64, '密码不超过 64 位')
    // 前后端同一条强度规则，避免前端放行、后端拒绝
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, '密码需同时包含字母和数字'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

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
