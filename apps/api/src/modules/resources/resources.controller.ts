import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ResourcesService } from './resources.service.ts';
import {
  AUDIT_ACTIONS,
  type ResourceCreateInput,
  resourceCreateSchema,
  type ResourceItem,
  type ResourceListResult,
  type ResourceQuery,
  resourceQuerySchema,
  type ResourceUpdateInput,
  resourceUpdateSchema,
} from '@saas/shared';
import { Roles } from '../../common/decorators/roles.decorator.ts';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.ts';
import { Audit } from '../../common/decorators/audit.decorator.ts';

@Controller('resources')
// 路由前缀。全局前缀 /api/v1 在 setup-app.ts 里设置，这里只写资源段，
// 最终路径是 /api/v1/resources。控制器内不要再写完整路径，否则前缀会重复。
export class ResourcesController {
  // 依赖注入 ResourcesService。Nest 通过构造函数参数类型（design:paramtypes 元数据）
  // 找到 ResourcesModule 里注册的 provider，不需要 @Inject 显式指定 token。
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  // GET /api/v1/resources —— 列表查询。
  // 不标 @Roles：读取权限是 member+，靠全局 JwtAuthGuard（必须登录）
  // 和 TenantGuard（必须带 X-Tenant-Id 且是成员）两道守卫即可，
  // 再标 @Roles 会把 member 挡在外面，与 07 方案 D-01 冲突。
  list(@Query({ schema: resourceQuerySchema }) query: ResourceQuery): Promise<ResourceListResult> {
    // @Query({ schema }) 是 Nest 12 的写法：不传 schema 就完全没有运行时校验，
    // query string 全是 string，page/pageSize 不会变成数字。
    // 这里的 schema 做两件事：z.coerce 把 '3' 转成 3，补默认值 page=1/pageSize=20。
    // 校验失败由 StandardSchemaValidationPipe 抛 422（不是 400），见 setup-app.ts。
    return this.resources.list(query);
    // Service 返回 { items, total, page, pageSize }。控制器不做任何数据加工：
    // 出参整形（Date → ISO 字符串、creator join）都在 service 的 toItem 里，
    // 保证 HTTP 层和内部调用拿到的是同一份形状。
  }

  @Post()
  // POST /api/v1/resources —— 新建。成功返回 201（Nest 对 POST 的默认状态码，此处无需标注）。
  @Roles('owner', 'admin')
  // 写权限收紧到 owner/admin。RolesGuard 读的是 TenantGuard 挂到 request 上的
  // userRole（来自 membership 表），不是 JWT 里的字段——JWT 只有 sub 和 type，
  // 因为一个用户可属多租户，角色是「在本租户内的角色」，必须请求级查询。
  @Audit(AUDIT_ACTIONS.RESOURCE_CREATE, { objectType: 'resource' })
  // 审计动作 resource.create。拦截器用 tap({ next, error }) 两条分支都留痕：
  // 成功记 result='success'，抛异常记 result='failed'（detail.statusCode 带真实状态码）。
  // 写入是「火忘」的：void 不 await，审计库抖动不影响主请求。
  create(
    @Body({ schema: resourceCreateSchema }) body: ResourceCreateInput,
    // 请求体校验：name 必填 1–100 且自动 trim，category 必填 ≤50，description 可选 ≤2000。
    // 类型 ResourceCreateInput 是 shared 里 z.infer 推导出来的，与 schema 同源，
    // 不会出现「类型说可选、校验说必填」的漂移。
    @Req() req: AuthenticatedRequest,
    // 取当前登录用户。AuthenticatedRequest 是 JwtAuthGuard 扩展过的 Request，
    // user 来自 access token 的 payload（sub = userId, type = 'access'）。
  ): Promise<ResourceItem> {
    return this.resources.create(body, req.user.sub);
    // 创建人只认 token 里的 sub，绝不从 body 取。
    // 若允许客户端传 createdBy，等于让人伪造操作人，审计日志也会跟着失真。
    // tenantId 同理，由 tenant.extension 在 Prisma 层自动注入，这里完全不出现。
  }

  @Patch(':id')
  // PATCH /api/v1/resources/:id —— 局部更新，只改传入的字段。
  // 用 PATCH 而不是 PUT：PUT 语义是整体替换，未传字段应被清空，
  // 而前端表单是「改哪项传哪项」，用 PUT 会误清 description。
  @Roles('owner', 'admin')
  @Audit(AUDIT_ACTIONS.RESOURCE_UPDATE, { objectType: 'resource', objectIdParam: 'id' })
  update(
    @Param('id') id: string,
    // 路径参数不做格式校验：id 是 cuid 字符串，格式错了也只会查不到 → 404，
    // 不会造成越权。加一层正则反而多一个 422 分支要前端处理。
    @Body({ schema: resourceUpdateSchema }) body: ResourceUpdateInput,
    // resourceUpdateSchema 由 create.partial() 推导，所有字段可选，
    // 因此允许传空对象 {}。空更新是幂等的，service 会直接回读当前记录而不写库，
    // 前端不必额外做「表单未改动则禁用提交」的判断。
  ): Promise<ResourceItem> {
    return this.resources.update(id, body);
    // Service 内部先 findFirst({ id, deletedAt: null })：
    // 已进回收站的资源不可再编辑，查不到统一抛 404 RESOURCE_NOT_FOUND。
    // 跨租户同理——tenant.extension 会把 tenantId 合并进 where，
    // 别人的 id 在这里查不到，返回 404 而不是 403，避免暴露「该 id 真实存在」。
  }

  @Get(':id')
  // GET /api/v1/resources/:id —— 详情。
  // 位置说明：现在 list 在前、':id' 在后，对空路径请求无影响（'resources' 不带尾段
  // 本来就不会命中 :id）。但以后若新增静态路由（如 GET /resources/export），
  // 必须写在 ':id' 之前，否则 'export' 会被当成一个 id 匹配进来。
  // 同样不标 @Roles：member 可读。
  detail(@Param('id') id: string): Promise<ResourceItem> {
    return this.resources.detail(id);
    // 详情与列表共用 toItem 映射，字段完全一致（含 createdBy / createdByName），
    // 前端可以把列表行直接当详情用，减少一次请求。
  }

  @Delete(':id')
  // DELETE /api/v1/resources/:id —— 软删除，即「移入回收站」。
  // 物理删除走 DELETE /api/v1/trash/:id（TrashController），两条路由分工明确：
  // 这里只打时间戳，数据仍可恢复 30 天。
  @Roles('owner', 'admin')
  @Audit(AUDIT_ACTIONS.RESOURCE_DELETE, { objectType: 'resource', objectIdParam: 'id' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ id: string }> {
    // 返回值只有 { id }，不回整个资源：删除后前端只需要知道「哪条没了」，
    // 回全量对象会让调用方误以为还能继续用这条数据。
    return this.resources.softDelete(id, req.user.sub);
    // 第二个参数是操作人，写进 deleted_by，回收站列表的「删除人」列取自它。
    // 到期由清理任务删除时该列为 null，前端显示「系统」。
    // 软删除同样先 findFirst 带 deletedAt: null：重复删除返回 404 而不是静默成功，
    // 便于前端提示「该资源已被删除」。
  }
}
