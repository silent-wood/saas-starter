/**
 * 资源分类字典（D-01：分类收敛为固定枚举，前端下拉选择）。
 *
 * **取值照搬市场口径，不自造业务词**：
 * - 阿里云盘「智能空间」默认分页签：我的照片 / 我的文档 / 我的视频 / 我的压缩包 / 其他文件
 * - 阿里云盘文件接口 `ListCdsFiles` 返回的 `Category`：`doc` / `image` / `audio` / `video`
 * - 百度网盘企业版：文档 / 图片 / 视频 / 音频 / 其他
 *
 * 三者收敛到同一套「按文件类型分类」的词表，故本表取
 * `doc / image / video / audio / other`：码与阿里云盘 `Category` 逐一对应，将来接
 * 网盘类文件接口可直接透传，不需要维护第二张映射表。压缩包未单列——本产品的资源是
 * 「可预览、可检索的资料」，压缩包归入「其他」更贴合实际使用（真要细分时加一项即可，
 * 见文末「如何扩一项」）。
 *
 * **不混另一个维度**：飞书的 `docx / sheet / bitable / mindnote / slides` 是「在线文档
 * 类型」，与「文件类型」是两条轴。混用会让同一条资源在「文档」「表格」之间无法定归属，
 * 所以本表只走文件类型这一条。
 *
 * **存码不存中文**：库里落 `doc` 这种稳定码，展示层才映射成「文档」。好处是可改文案
 * （「文档」→「文档资料」、加英文界面）不用写数据迁移；直接存中文则每个租户的历史数据
 * 都成了待清洗脏值。
 *
 * 码表放 shared 而不是各端各写一份：契约的 `z.enum`、列表筛选项、详情展示文案全部读
 * 这里。放前端后端校验不到，放后端前端下拉会落后。
 *
 * 排序即展示顺序（按使用频率降序），不要按字母重排。
 *
 * **如何扩一项**：在数组里加码 + 在 `RESOURCE_CATEGORY_LABEL` 加文案，两处都在本文件，
 * `Record` 的键是全量联集，漏一处编译期就报错；下拉与筛选会自动跟着变。
 */
export const RESOURCE_CATEGORIES = ['doc', 'image', 'video', 'audio', 'other'] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

/** 码 → 展示文案。`Record` 的键是全量联集，漏一个分类编译期就报错 */
export const RESOURCE_CATEGORY_LABEL: Record<ResourceCategory, string> = {
  doc: '文档',
  image: '图片',
  video: '视频',
  audio: '音频',
  other: '其他',
};

/**
 * 下拉 / 筛选用的 `{ value, label }[]`，顺序与 `RESOURCE_CATEGORIES` 一致。
 *
 * 由码表派生而不是手写第二份：手写必然出现「加了个分类但下拉里没有」，
 * 而枚举列的表单校验会放行该码——用户能通过接口写入、却在界面里选不到。
 */
export const RESOURCE_CATEGORY_OPTIONS = RESOURCE_CATEGORIES.map((value) => ({
  value,
  label: RESOURCE_CATEGORY_LABEL[value],
}));

/**
 * 码 → 展示文案，带兜底。
 *
 * 兜底不是防御性编程而是**兼容存量数据**：分类从自由文本收紧为枚举之前，
 * 库里可能存着「市场资料」这类任意文本。读出来原样展示，比显示「未知」或直接
 * 报错更合适——这些行会在用户下一次编辑时被下拉强制纠正为合法码。
 *
 * 传 null / undefined 返回 `'-'`，供表格与详情页直接渲染。
 */
export function resourceCategoryLabel(code: string | null | undefined): string {
  if (!code) return '-';
  return RESOURCE_CATEGORY_LABEL[code as ResourceCategory] ?? code;
}
