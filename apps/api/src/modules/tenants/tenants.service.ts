import { Inject, Injectable } from '@nestjs/common';
import { PRISMA } from '../../prisma/prisma.module.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import type { TenantListItem } from '@saas/shared';

/**
 * 租户模块的业务逻辑。
 *
 * 本期（01 注册与登录）只实现一个方法：listByUser —— 查「当前用户所属的租户列表」。
 * 租户的创建 / 切换 / 成员管理在后续功能点（04-租户创建与切换）落地，这里先不写。
 *
 * 职责边界：Service 只碰数据与业务规则，不碰 HTTP。
 *   - Controller：解析请求、校验、包响应
 *   - Service：查库、过滤、排序、映射成契约类型
 */
@Injectable()
export class TenantsService {
  // 注入带租户隔离扩展的 client（PRISMA token），而不是 PrismaService。
  // PRISMA 由 PrismaModule 以 useValue 提供（extendedClient 实例），是全局 provider，
  // 本模块无需 import PrismaModule。用 @Inject(PRISMA) 显式指定 token：
  // 因为 token 是 Symbol，TS/Nest 无法从「类型」反推要注入哪个，必须显式 @Inject。
  // `private readonly` + 参数属性：TS 自动声明实例字段并赋值，等价于
  // `private readonly prisma: ExtendedPrismaClient; constructor(p){ this.prisma = p; }`
  constructor(@Inject(PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  /**
   * 返回某用户所属的租户列表，按最近活跃时间降序（从未活跃的排最后）。
   *
   * 三条过滤规则（对应 01 方案 §5.2 E-19 / §308）：
   *  1. 只查该用户的 membership：userId 匹配
   *  2. 只查有效成员关系：status = 'active'（disabled / removed 归成员管理页）
   *  3. 排除已软删租户：tenant.deletedAt 必须为 null
   *     —— 软删租户进回收站，不属于「我所属的正常租户」
   */
  async listByUser(userId: string): Promise<TenantListItem[]> {
    // findMany：查多行。Prisma 会把下面的 where / include / orderBy 翻译成一条 SQL，
    // 返回的类型由 schema 自动推导（membership 的字段 + 关联的 tenant），无需手写接口
    const memberships = await this.prisma.membership.findMany({
      // where：过滤条件，等于 SQL 的 WHERE。这里的条件是「AND」关系，每一项都要满足
      where: {
        userId, // 简写：等价于 userId: userId
        status: 'active',
        // 关系过滤：tenant 是 membership 的关联模型，写 { tenant: {...} } 会生成 JOIN，
        // 再在 JOIN 上套 deletedAt 条件。即「只 join 出未软删的租户」
        tenant: { deletedAt: null },
      },
      // include：把关联模型一起查出来（等于 JOIN + SELECT 关联列）。
      // 里面再套 select，只挑 tenant 的 id/name 两列，不整表拖回 logo_url 等本期用不到的列
      include: {
        tenant: {
          select: { id: true, name: true },
        },
      },
      // orderBy：排序，等于 SQL 的 ORDER BY。desc = 降序。
      // Prisma 对可空字段的 desc 处理是「null 排最后」，正好符合契约「空值排最后」，
      // 无需额外写 nulls: 'last'
      orderBy: { lastActiveAt: 'desc' },
    });

    // map：把数据库行转换成契约类型 TenantListItem。
    // Prisma 返回的 lastActiveAt 是 JS 的 Date 对象，契约要求 ISO 字符串，
    // 所以要 toISOString()；库里为 null 时用 ?? null 兜底（Date 的 null 不能直接 toISOString）
    return memberships.map((m) => ({
      id: m.tenant.id, // 来自 include 出来的关联租户
      name: m.tenant.name,
      role: m.role, // 来自 membership 行本身
      status: m.status,
      lastActiveAt: m.lastActiveAt?.toISOString() ?? null,
    }));
  }
}
