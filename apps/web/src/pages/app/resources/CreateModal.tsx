/**
 * 新建 / 编辑资源弹窗（07 方案 §3.2，v1.4：分类改枚举下拉）
 *
 * 新建与编辑复用同一弹窗：编辑模式由 `record` 区分，提交分别走
 * resourceCreateSchema / resourceUpdateSchema 对应的接口。
 * 校验规则与 shared 契约同源（trim 后必填、长度上限逐条对齐），
 * 服务端 422 的 details.path 回填为字段级红字。
 *
 * 分类是下拉而非输入框：取值来自 `RESOURCE_CATEGORY_OPTIONS`，与契约的
 * `z.enum(RESOURCE_CATEGORIES)` 同源，不会有「界面能填、接口拒绝」的缝隙。
 *
 * 表单在弹窗每次打开时重置（见 `useLayoutEffect` 注释）：编辑与新建复用同一个
 * form 实例，不重置就会把上一条记录的内容带进「新建资源」。
 */
import { App, Form, Input } from 'antd';
import { ModalForm, ProFormSelect, ProFormText, ProFormTextArea } from '@ant-design/pro-components';
import { useLayoutEffect } from 'react';
import { ERROR_CODES, RESOURCE_CATEGORIES, RESOURCE_CATEGORY_OPTIONS } from '@saas/shared';
import type { ResourceCategory, ResourceItem } from '@saas/shared';
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

/** 表单值：category 是枚举码，与契约 `resourceCreateSchema` 的取值一致 */
interface ResourceFormValues {
  name: string;
  category: ResourceCategory;
  description?: string;
}

export function CreateModal({ open, record, onClose, onSaved }: CreateModalProps) {
  const [form] = Form.useForm<ResourceFormValues>();
  const { message } = App.useApp();

  const isEdit = record !== null;

  /**
   * 编辑时的分类初值必须校验是否仍在枚举内。
   *
   * 分类从自由文本收紧为枚举之前落库的记录（如「市场资料」）读出来仍是字符串，
   * 直接回填会让下拉显示成一个不存在的选项。这里判不中就不回填，用户必须重新选一个，
   * 保存即完成该行的规范化。
   */
  const initialCategory =
    record?.category && (RESOURCE_CATEGORIES as readonly string[]).includes(record.category)
      ? (record.category as ResourceCategory)
      : undefined;

  /**
   * 每次打开弹窗都把表单对齐到当前模式的值。
   *
   * 不能只靠 `initialValues`：rc-field-form 挂载时做的是 `merge(initialValues, store)`，
   * store 里已有的值会盖掉初值；而 `form` 实例由本组件持有，弹窗关闭再打开并不换新实例
   * （`destroyOnHidden` 只销毁字段 DOM，不销毁 store）。于是「编辑某条 → 取消 → 新建资源」时，
   * 上一条记录的名称/分类/描述会原样留在输入框里，`resetFields()` 放在关闭时也救不了——
   * 它重置的目标正是那份编辑态初值。
   *
   * 所以改成打开时统一处理：先 `resetFields()` 清空并清掉上一次的校验红字，
   * 编辑模式再灌入记录值。用 layout effect 是为了在首次绘制前完成，
   * 避免弹窗动画里闪一下上一条数据。
   *
   * 依赖只取原始字段而非 `record` 对象：父组件重渲染会给出新引用，
   * 依赖对象会导致用户正在输入的内容被重置。
   */
  const recordName = record?.name;
  const recordDescription = record?.description ?? undefined;

  useLayoutEffect(() => {
    if (!open) return;
    form.resetFields();
    if (recordName === undefined) return;
    form.setFieldsValue({
      name: recordName,
      category: initialCategory,
      description: recordDescription,
    });
  }, [open, form, recordName, initialCategory, recordDescription]);

  return (
    <ModalForm<ResourceFormValues>
      title={isEdit ? '编辑资源' : '新建资源'}
      width={520}
      form={form}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
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
            category: values.category,
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
        rules={[trimRequired('请输入资源名称'), { max: 50, message: '资源名称不超过 50 个字符' }]}
      />
      <ProFormSelect
        name="category"
        label="分类"
        placeholder="请选择分类"
        // 不做 showSearch：5 个选项一屏到齐，搜索框只是噪音
        options={[...RESOURCE_CATEGORY_OPTIONS]}
        // 选择器不适用 whitespace 规则（那是给文本输入用的），只判必填
        rules={[{ required: true, message: '请选择分类' }]}
      />
      <ProFormTextArea
        name="description"
        label="描述"
        placeholder="请输入描述（可选）"
        fieldProps={{ rows: 4, maxLength: 200, showCount: true }}
        rules={[{ max: 200, message: '描述不超过 200 个字符' }]}
      >
        <Input.TextArea />
      </ProFormTextArea>
    </ModalForm>
  );
}
