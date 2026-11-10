/**
 * 重置密码表单 schema（前端专用，规范 §5）
 *
 * 在 `@saas/shared` 的 `resetPasswordSchema` 基础上扩展 `confirmPassword`。
 * `confirmPassword` 是纯表单关注点（后端只收 password），不进共享契约；
 * 强度规则则完全复用共享 schema，保证「注册能过的密码，重置也能过」。
 */
import { z } from 'zod';
import { resetPasswordSchema } from '@saas/shared';

export const resetPasswordFormSchema = resetPasswordSchema
  /**
   * 必须先 omit 掉 token。
   * token 来自 URL（`?token=`），不在表单里，提交时才拼进请求体。
   * 若沿用共享 schema 的 token 字段，校验时它永远是 undefined → 整表校验失败 →
   * handleSubmit 不调 onSubmit，而页面上又没有 token 的 Form.Item 去显示这条错误，
   * 表现就是「点提交毫无反应，也没任何提示」。
   */
  .omit({ token: true })
  .extend({
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;
