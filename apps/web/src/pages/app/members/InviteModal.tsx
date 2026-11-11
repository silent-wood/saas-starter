/**
 * 邀请成员弹窗（05 方案 §3.2）
 *
 * 两段式：填邮箱 + 选角色 → 成功后**留在弹窗内**展示可复制的邀请链接。
 * 所以没用 `ModalForm`：它的提交成功即关窗，「展示链接」这一步就没地方放了。
 * 表单本身仍是 antd Form，校验规则与 shared 契约（`createInviteInputSchema`）同源。
 *
 * 为什么一定要把链接摆出来：邮件通道可能没送达（devMode 只打终端、Resend 沙箱会拒），
 * 链接是管理员唯一能确认「对方到底拿到了什么」的东西（AC-17）。
 */
import { App, Button, Form, Input, Modal, Select, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreateInviteInput, CreateInviteResult } from '@saas/shared';
import type { ApiError } from '@/shared/api/client';
import { errorText } from '@/shared/api/errorText';
import { memberApi } from '@/shared/api/member';
import { ROLE_LABEL } from '@/constants/role';

export interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  /** 邀请创建/重发成功后刷新列表（待接受区要出现新行） */
  onCreated: () => void;
}

interface InviteFormValues {
  email: string;
  role: 'admin' | 'member';
}

export function InviteModal({ open, onClose, onCreated }: InviteModalProps) {
  const [form] = Form.useForm<InviteFormValues>();
  const { message } = App.useApp();

  // 用 state 而不是 mutation.data：再次打开弹窗要能从「链接态」退回表单，
  // 而 mutation 的 data 会一直留着上一次的结果
  const [result, setResult] = useState<CreateInviteResult | null>(null);

  const invite = useMutation<CreateInviteResult, ApiError, CreateInviteInput>({
    mutationFn: memberApi.invite,
    onSuccess: (created) => {
      onCreated();
      message.success('邀请已创建');
      // 不关弹窗：链接只在这里出现一次，关掉就得重发（会轮换 token，旧链接失效）
      setResult(created);
    },
    onError: (error) => message.error(errorText(error)),
  });

  const close = () => {
    setResult(null);
    form.resetFields();
    onClose();
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      message.success('链接已复制');
    } catch {
      // 非 https / 无剪贴板权限：链接就在输入框里，手动选中也能复制
      message.warning('复制失败，请手动选中链接复制');
    }
  };

  return (
    <Modal
      title={result ? '邀请链接已生成' : '邀请成员'}
      open={open}
      onCancel={close}
      destroyOnHidden
      footer={
        result
          ? [
              <Button key="done" type="primary" onClick={close}>
                完成
              </Button>,
            ]
          : undefined
      }
      confirmLoading={invite.isPending}
      okText="发送邀请"
      onOk={() => form.submit()}
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <Typography.Text type="secondary">
            已向 {result.email} 发送邀请（{ROLE_LABEL[result.role]}），7 天内有效。
            邮件可能未送达，可直接复制下面的链接发给对方：
          </Typography.Text>
          <Input.TextArea value={result.joinUrl} readOnly autoSize={{ minRows: 2, maxRows: 3 }} />
          <Button icon={<CopyOutlined />} onClick={() => void copy(result.joinUrl)}>
            复制链接
          </Button>
        </div>
      ) : (
        <Form<InviteFormValues>
          form={form}
          layout="vertical"
          initialValues={{ role: 'member' }}
          onFinish={(values) => invite.mutate({ email: values.email.trim(), role: values.role })}
        >
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, whitespace: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="对方的邮箱地址" autoComplete="off" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              options={[
                { value: 'member', label: ROLE_LABEL.member },
                { value: 'admin', label: ROLE_LABEL.admin },
              ]}
            />
          </Form.Item>
          <Typography.Text type="secondary" className="text-xs">
            被邀请人需用该邮箱登录后接受，才会加入当前团队。
          </Typography.Text>
        </Form>
      )}
    </Modal>
  );
}
