/**
 * 注册表单 schema（前端专用，规范 §5：边界数据用 zod 校验）
 *
 * 在 `@saas/shared` 的 `registerSchema` 基础上扩展 `confirmPassword`。
 * `confirmPassword` 属纯前端关注点——后端只接收 password，故不进共享契约，
 * 避免把表单交互字段污染成接口契约。
 */
import { z } from 'zod';
import { registerSchema } from '@saas/shared';

export const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  });

export type RegisterFormValues = z.infer<typeof registerFormSchema>;
