/**
 * CreateModal 回归测试（07 方案 §3.2）
 *
 * 锁住：弹窗关闭后再以「新建」模式打开，必须清空上一条编辑记录的内容。
 * 根因是编辑/新建复用同一个 form 实例，而 rc-field-form 挂载时
 * `merge(initialValues, store)` 会让 store 里的旧值盖掉初值。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { ResourceItem } from '@saas/shared';
import { CreateModal } from './CreateModal';

const item: ResourceItem = {
  id: 'r_1',
  name: '产品需求清单 v3',
  description: '季度规划与评审记录',
  category: 'doc',
  createdBy: 'u_1',
  createdByName: '李顺',
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

/** 还原列表页的模态控制方式：编辑传入 record，取消后父组件清空 record */
function Harness() {
  const [open, setOpen] = useState(true);
  const [record, setRecord] = useState<ResourceItem | null>(item);

  return (
    <>
      <button
        onClick={() => {
          setOpen(false);
          setRecord(null);
        }}
      >
        关闭并转新建
      </button>
      <button onClick={() => setOpen(true)}>打开</button>
      <CreateModal open={open} record={record} onClose={() => setOpen(false)} onSaved={() => {}} />
    </>
  );
}

function renderHarness() {
  return render(
    <AntdApp>
      <Harness />
    </AntdApp>,
  );
}

describe('CreateModal', () => {
  it('取消编辑后再新建，表单里不残留上一次编辑的内容', async () => {
    renderHarness();

    // 编辑模式回填记录值
    const nameInput = await screen.findByLabelText<HTMLInputElement>('资源名称');
    await waitFor(() => expect(nameInput.value).toBe(item.name));
    expect(screen.getByText('编辑资源')).toBeInTheDocument();

    // 取消 → 此时父组件把 record 置空，弹窗关闭
    fireEvent.click(screen.getByText('关闭并转新建'));
    await waitFor(() => expect(screen.queryByText('编辑资源')).not.toBeInTheDocument());

    // 再以新建模式打开，三个字段都应回到空
    fireEvent.click(screen.getByText('打开'));
    expect(await screen.findByText('新建资源')).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>('资源名称').value).toBe('');
    expect(screen.getByLabelText<HTMLTextAreaElement>('描述').value).toBe('');
    expect(screen.getByLabelText('分类')).toHaveProperty('value', '');
  });
});
