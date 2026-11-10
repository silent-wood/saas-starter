/**
 * 新建 / 编辑资源弹窗（07 方案 §3.2，v1.2：pro-components ModalForm）
 *
 * 新建与编辑复用同一弹窗：编辑模式由 `record` 区分，提交分别走
 * resourceCreateSchema / resourceUpdateSchema 对应的接口。
 * 校验规则与 shared 契约同源（trim 后必填、长度上限逐条对齐），
 * 服务端 422 的 details.path 回填为字段级红字。
 */
import { App, Form, Input } from 'antd';
import { ModalForm, ProFormText, ProFormTextArea } from '@ant-design/pro-components';
import { ERROR_CODES } from '@saas/shared';
import type { ResourceItem } from '@saas/shared';
import { errorText } from '@/shared/api/errorText';
import type { ApiError } from '@/shared/api/client';
import { resourceApi } from '@/shared/api/resource';

export interface CreateModalProps {
  open: boolean;
  /** 编辑模式传入待编辑记录；null 表示新建 */
  record: ResourceItem | null;
  onClose: () => void;
  /** 保存成功后的回调（父组件负责刷新列表 / 详情） */
  onSaved: () => void;
}

/** whitespace 规则：纯空串在契约里 trim 后即「必填缺失」，提前拦在前端 */
const trimRequired = (message: string) => ({
  required: true,
  whitespace: true,
  message,
});

export function CreateModal({ open, record, onClose, onSaved }: CreateModalProps) {
  const [form] = Form.useForm<{ name: string; category: string; description?: string }>();
  const { message } = App.useApp();

  const isEdit = record !== null;

  return (
    <ModalForm<{
      name: string;
      category: string;
      description?: string;
    }>
      title={isEdit ? '编辑资源' : '新建资源'}
      width={520}
      form={form}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      // 编辑模式的初值：nullable 字段映射为 undefined，避免受控组件拿到 null
      initialValues={
        isEdit
          ? {
              name: record.name,
              category: record.category ?? undefined,
              description: record.description ?? undefined,
            }
          : undefined
      }
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        onCancel: () => onClose(),
      }}
      submitter={{ searchConfig: { submitText: '保存', resetText: '取消' } }}
      onFinish={async (values) => {
        try {
          const payload = {
            name: values.name.trim(),
            category: values.category.trim(),
            description: values.description?.trim() || undefined,
          };
          if (isEdit) {
            await resourceApi.update(record.id, payload);
            message.success('已保存');
          } else {
            await resourceApi.create(payload);
            message.success('创建成功');
          }
          onSaved();
          return true;
        } catch (err) {
          const apiErr = err as ApiError;
          if (apiErr?.code === ERROR_CODES.VALIDATION_FAILED && apiErr.details?.length) {
            // 422 字段级错误按 details.path 回填红字
            form.setFields(
              apiErr.details.map((d) => ({
                name: d.path as 'name' | 'category' | 'description',
                errors: [d.message],
              })),
            );
          } else {
            message.error(errorText(err));
          }
          return false;
        }
      }}
    >
      <ProFormText
        name="name"
        label="资源名称"
        placeholder="请输入资源名称"
        rules={[trimRequired('请输入资源名称'), { max: 100, message: '资源名称不超过 100 个字符' }]}
      />
      <ProFormText
        name="category"
        label="分类"
        placeholder="请输入分类"
        rules={[trimRequired('请选择分类'), { max: 50, message: '分类不超过 50 个字符' }]}
      />
      <ProFormTextArea
        name="description"
        label="描述"
        placeholder="请输入描述（可选）"
        fieldProps={{ rows: 4, maxLength: 2000, showCount: true }}
        rules={[{ max: 2000, message: '描述不超过 2000 个字符' }]}
      >
        <Input.TextArea />
      </ProFormTextArea>
    </ModalForm>
  );
}
