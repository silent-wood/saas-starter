/**
 * 注册表单 schema（前端专用，规范 §5：边界数据用 zod 校验）
 *
 * 在 `@saas/shared` 的 **`registerBaseSchema`** 上扩展 `confirmPassword`。
 * 为什么是 base 而不是 `registerSchema`：后者的跨字段规则已经过 `superRefine()`，
 * 返回值不再带 `.extend()`（zod 的类型链限制），前端加不了表单字段。
 *
 * 跨字段规则因此在前端再跑一遍，但**判定逻辑复用 shared 的 `needsTenantName()`**，
 * 消息复用 `TENANT_NAME_REQUIRED_MESSAGE`——两份 schema 的措辞与口径不会漂移。
 * 这里多出来的只有 `confirmPassword`，它属纯前端关注点，不进接口契约。
 */
import { z } from 'zod';
import { TENANT_NAME_REQUIRED_MESSAGE, needsTenantName, registerBaseSchema } from '@saas/shared';

export const registerFormSchema = registerBaseSchema
  .extend({
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .superRefine((values, ctx) => {
    // 团队名条件必填：受邀注册（inviteToken 在场）不建默认团队，这一格不显示也不校验
    if (needsTenantName(values)) {
      ctx.addIssue({ code: 'custom', path: ['tenantName'], message: TENANT_NAME_REQUIRED_MESSAGE });
    } else if (!values.inviteToken && (values.tenantName ?? '').trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['tenantName'], message: '团队名称至少 2 个字符' });
    }

    if (values.password !== values.confirmPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: '两次输入的密码不一致' });
    }
  });

export type RegisterFormValues = z.infer<typeof registerFormSchema>;
