// 必须用命名空间导入（`import * as z`）而不是默认导入：
// 生成的 .d.ts 里 zod 内部类型会写成 `z.z.core.$strip` 这类限定名，
// 默认导入在消费方（尤其 `moduleResolution: bundler`）拿不到 `z` 成员，
// 会让 `z.infer` 整体退化成 any，且被 skipLibCheck 静默吞掉。
import * as z from 'zod';
import { RESOURCE_CATEGORIES } from '../resource-categories.js';

// ─────────────────────────────────────────────────────────────
// 入参契约
// ─────────────────────────────────────────────────────────────

/**
 * 新建资源入参，用于 `POST /resources`。
 *
 * **不含 tenantId / createdBy**：租户由 `X-Tenant-Id` 头确定、操作人由 access token
 * 确定，二者都由后端注入。把它们放进请求体等于让客户端自己声明"我属于哪个租户"，
 * 一旦被篡改就是越权写入——这是本契约最重要的一条边界。
 *
 * **写操作的角色边界不在契约里**：`POST` / `PATCH` / `DELETE` 限 `owner` / `admin`，
 * `member` 只读。该规则由后端 `@Roles('owner','admin')` 表达，前端按同源权限矩阵
 * 隐藏入口（`06-RBAC与审计` 的 `PERMISSIONS`），契约层不重复声明。
 *
 * 字段落库映射（详见 `_docs/数据库设计与数据字典.md` §3.2）：
 * - `name`        → `resources.name`（必填，列表主展示列）
 * - `description` → `resources.description`（可空，DB 为 TEXT）
 * - `category`    → `resources.category`（**必填枚举码**，见 `resource-categories.ts`；
 *   DB 列仍留 NULL，为历史数据留余地）
 */
export const resourceCreateSchema = z.object({
  /** 资源名称，列表主展示列；上限 50（D-02 决策）——列表列宽下超出的部分必然被省略 */
  name: z.string().trim().min(1, '请输入资源名称').max(50, '资源名称不超过 50 个字符'),
  /** 描述，上限 200（D-03 决策），与详情页卡片的高度相匹配 */
  description: z.string().max(200, '描述不超过 200 个字符').optional(),
  /**
   * 分类，**必填枚举**（原型图 S3「分类必选」）。分类是列表过滤维度，允许为空会让
   * 过滤结果里堆一批"未分类"，使该维度失去意义。
   *
   * **收紧为 `z.enum` 而不是自由文本**（D-01 决策）：自由文本下「文档」「文档 」
   * 「文档资料」是三个分类，过滤结果永远筛不全。取值来自 `RESOURCE_CATEGORIES`，
   * 前端下拉与这里同源。错误文案统一成「请选择分类」——枚举失败时 zod 默认会回
   * 一长串可选值，对表单红字来说是噪音。
   */
  category: z.enum(RESOURCE_CATEGORIES, { error: '请选择分类' }),
});

export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>;

/**
 * 更新资源入参，用于 `PATCH /resources/:id`。
 *
 * 由 create 契约 `.partial()` 推导，不另写一份——否则将来加字段必然漏改一处，
 * 出现"创建能传、更新传不了"的不一致。
 *
 * **允许空对象**（`{}`）：语义是"不修改任何字段"，service 原样返回当前记录即可。
 * 这里刻意不加 `.refine(obj => Object.keys(obj).length > 0)` 拦空 PATCH：
 * 空更新的结果是幂等的，用 400 拒绝它只会让前端"表单未改动时禁用提交"多一条判断，
 * 却不带来任何数据安全收益。
 */
export const resourceUpdateSchema = resourceCreateSchema.partial();

export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>;

/**
 * 列表查询参数，用于 `GET /resources`。
 *
 * query string 的值**全是字符串**，所以数值参数必须用 `z.coerce.number()`：
 * 直接写 `z.number()` 会让 `?page=2` 校验失败（`"2"` 不是 number）。
 *
 * `default()` 让参数缺省时也能拿到可用值，controller 里不需要再写 `?? 1`。
 * 上限 `pageSize ≤ 100` 是防拖库保护：一次拉全表会让分页失去意义。
 */
export const resourceQuerySchema = z.object({
  /** 页码，从 1 开始。越界（超过总页数）返回空数组而不是报错 */
  page: z.coerce.number().int().min(1).default(1),
  /** 每页条数，默认 20、上限 100 */
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** 关键字，按名称模糊匹配（大小写不敏感）；空串视同不传 */
  q: z.string().max(100).optional(),
  /** 分类等值过滤，取值同创建契约的枚举（不含历史自由文本值）；不做模糊 */
  category: z.enum(RESOURCE_CATEGORIES, { error: '分类取值不合法' }).optional(),
});

export type ResourceQuery = z.infer<typeof resourceQuerySchema>;

// ─────────────────────────────────────────────────────────────
// 出参契约
// ─────────────────────────────────────────────────────────────

/**
 * 资源列表项 / 详情，用于 `GET /resources`、`GET /resources/:id`。
 *
 * `description` / `category` 在出参里是 **nullable**，入参里 `description` 是
 * **optional**——两者不是笔误：客户端不传 = 字段缺席（optional），数据库没值 =
 * 显式 null（nullable）。后端统一把 `undefined` 落成 `null`，前端只需判一种情况。
 *
 * **不含附件相关字段**（`attachmentCount` 等）：`files` 表在 M3 才建，本期返回
 * 恒 0 的假字段只会让前端表格出现永远为空的列，M3 还要再改一次契约。原型 S3 的
 * 「附件」列本期隐藏，见 `07-资源CRUD与回收站` §1.3。
 *
 * 时间字段是 **ISO 8601 字符串**而不是 `Date`：HTTP JSON 里没有 Date 类型，
 * NestJS 序列化后本来就是字符串，契约写成 string 才能与运行时一致。
 */
export const resourceItemSchema = z.object({
  /** `resources.id`（cuid） */
  id: z.string(),
  /** `resources.name` */
  name: z.string(),
  /** `resources.description`，未填为 null */
  description: z.string().nullable(),
  /**
   * `resources.category`：分类**码**（如 `doc`），不是展示文案。
   *
   * 出参刻意保持 `string`（不收紧成枚举）而写入端是枚举：收紧上游、放宽下游，
   * 这样枚举收紧之前落库的历史自由文本仍能正常读出并展示（`resourceCategoryLabel`
   * 有兜底），不会让一台老数据的记录把整个列表的解析打挂。展示一律走
   * `resourceCategoryLabel()`，不要在组件里手写映射。
   */
  category: z.string().nullable(),
  /** 创建人 id（`resources.created_by`）。DB 为 NOT NULL，此处仍给 nullable 以容忍脏数据 */
  createdBy: z.string().nullable(),
  /**
   * 创建人显示名，由 `created_by` 关联 `users.nickname` 得到。
   *
   * 用 join 取而不是在 `resources` 表冗余一列姓名：改昵称后列表要立刻反映新名字，
   * 冗余列必然出现"资源列表里还是旧名字"的脏数据。创建人注销（`users.status=deleted`）
   * 时为 null，前端显示「已注销用户」。
   */
  createdByName: z.string().nullable(),
  /** 创建时间（`created_at`），ISO 8601 */
  createdAt: z.string(),
  /** 最后更新时间（`updated_at`），ISO 8601 */
  updatedAt: z.string(),
});

export type ResourceItem = z.infer<typeof resourceItemSchema>;

/**
 * 分页列表响应，用于 `GET /resources`。
 *
 * 分页元信息与 `items` 平铺在同一层（不做 `{ data: { items }, meta: {...} }` 嵌套）：
 * 外层已经有统一的 `ApiSuccess` 包裹，再套一层会让前端取值路径变成
 * `res.data.data.items`，联调期极易写错。
 */
export const resourceListResultSchema = z.object({
  /** 当前页数据；可能为空数组（页码越界或确实无数据） */
  items: z.array(resourceItemSchema),
  /** 满足过滤条件的总条数（不受分页影响），前端据此算总页数 */
  total: z.number().int(),
  /** 回显当前页码，便于前端确认请求与响应对齐 */
  page: z.number().int(),
  /** 回显每页条数 */
  pageSize: z.number().int(),
});

export type ResourceListResult = z.infer<typeof resourceListResultSchema>;

/**
 * 回收站列表项，用于 `GET /trash`。
 *
 * 在普通资源项基础上补三个字段：
 * - `deletedAt`：回收站里"什么时候删的"是首要信息（决定还剩几天可恢复），必须返回。
 *   `resourceItemSchema` 本身不含该字段，因为正常列表里它恒为 null，带上只会让前端
 *   多写一次无效判断。
 * - `deletedBy` / `deletedByName`：原型 S5 的「删除人」列。二者与创建人同理由 join 取，
 *   清理任务到期自动删除的记录 `deleted_by` 为 null，前端显示「系统」。
 *
 * **不含「剩余天数」**：由前端用 `deletedAt` + 30 天现算。后端返回剩余天数会在
 * 跨天时变成陈旧值（用户开着页面过夜，数字不会自己减），且需要服务端时区口径，
 * 属于纯展示计算，不该占接口字段。
 */
export const trashItemSchema = resourceItemSchema.extend({
  /** 软删除时间（`deleted_at`），ISO 8601；非空是进入回收站的判据 */
  deletedAt: z.string(),
  /** 删除人 id（`resources.deleted_by`）；清理任务自动删除时为 null */
  deletedBy: z.string().nullable(),
  /** 删除人显示名，由 `deleted_by` 关联 `users.nickname`；同上为 null 时前端显示「系统」 */
  deletedByName: z.string().nullable(),
});

export type TrashItem = z.infer<typeof trashItemSchema>;

/**
 * 回收站列表响应，用于 `GET /trash`。分页语义与 `GET /resources` 完全一致。
 *
 * 回收站**只返回 30 天窗口内**的记录：`deleted_at > now() - 30d`。
 * 超窗记录代码上仍留在表里（等清理任务物理删除），但不再对用户可见——
 * 所以 `total` 也只统计窗口内条数，不能拿它跟历史删除总数对比。
 */
export const trashListResultSchema = z.object({
  /** 当前页回收站数据 */
  items: z.array(trashItemSchema),
  /** 30 天窗口内的总条数 */
  total: z.number().int(),
  /** 回显当前页码 */
  page: z.number().int(),
  /** 回显每页条数 */
  pageSize: z.number().int(),
});

export type TrashListResult = z.infer<typeof trashListResultSchema>;
