# M2-05 Prisma Client 与依赖注入（运行时数据访问）

> 知识分类：M2 认证与多租户 ｜ 关联里程碑：M2 ｜ 责任视角：后端

## 1. 这是什么
把「数据表怎么定义」（M2-04 的 schema 建模）和「代码怎么读写数据」（本卡片的 Prisma Client）连起来，并讲清 NestJS 如何把 Prisma 实例注入到 Service 里。覆盖从「构造函数里写了 prisma」到「this.prisma.user.findUnique 能跑」的完整链路。

## 2. 为什么值得学
- 只会建模不会用 Client，等于画了表却写不出读写代码。
- NestJS 的依赖注入（DI）是它区别于 Express 的核心卖点，理解「注入」是写出规范 Nest 代码的前提。
- 「全局模块 vs 普通模块」「单例 vs 多实例」是上手 NestJS 最容易绕进去的两个概念。

## 3. 核心概念

### 3.1 NestJS 依赖注入三要素
- **`@Injectable()`**：标记一个类可以被注入、也可以依赖别人。
- **`constructor(private readonly x: XService)`**：TS「参数属性」语法糖，编译器自动完成「声明字段 + 接收参数 + `this.x = x` 赋值」三步，所以构造函数体里看不到赋值代码。
- **类型元数据**：靠 `emitDecoratorMetadata` 把参数类型（`PrismaService`）存进运行时，Nest 据此决定「该注入哪个类的实例」。**不写类型就注入不了**。

### 3.2 模块作用域与全局模块
- **`imports` 默认不是全局**：模块 A import 模块 B，只让 A 能用 B 导出的东西，不代表 C 也能用。
- **全局 = `@Global()` 或 `global: true`**：标了全局的模块，其 `exports` 对所有模块可见，不用再 import。
- **`@Global()` ≠ `exports`**：`providers`（注册）+ `exports`（允许注入）+ `@Global()`（全员可见）三者缺一不可。

### 3.3 单例作用域
- provider 默认 **singleton**：无论被注入多少次，都是同一个实例。
- `@Global()` 管「谁能注入」，单例管「有几个实例」，叠加结果 = **全局唯一实例**。
- PrismaService 全局唯一 → 全应用共享一个连接池（`max: 10`），避免每个模块各开一个池子打满数据库连接。

### 3.4 Prisma Client 的生成机制
- `schema.prisma` 里每个 `model` → `prisma generate` 后变成 `PrismaClient` 上的一个属性，命名 = **model 名首字母小写**（`model User` → `prisma.user`，不是表名）。
- 每个属性上挂一整套**类型安全**的 CRUD 方法，参数和返回值都由 model 字段推导，字段名写错直接编译报错。
- `PrismaService extends PrismaClient`，所以 Service 上也有 `user` / `emailToken` 这些属性。

## 4. 在本项目如何落地
- `prisma.module.ts`：`@Global()` + `providers` + `exports`，让 PrismaService 全局可注入。
- `prisma.service.ts`：`extends PrismaClient`，构造时用 `PrismaPg` adapter 连 `DATABASE_URL`，实现 `onModuleInit`（`$connect`）和 `onModuleDestroy`（`$disconnect`）。
- 各 Service 构造器直接 `constructor(private readonly prisma: PrismaService)`，**不用再 import PrismaModule**。
- 事务里必须用 `tx.xxx` 而不是 `this.prisma.xxx`，否则不进事务。

## 5. 关键代码示例
```ts
// 注入（参数属性 = 声明 + 接收 + 赋值，编译器自动展开）
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,   // 全局单例，直接注入
    private readonly tokenService: TokenService,
  ) {}
}

// 全局模块三要素
@Global()
@Module({
  providers: [PrismaService],   // 注册
  exports: [PrismaService],     // 允许注入
})
export class PrismaModule {}

// model → 属性 → 方法
this.prisma.user.findUnique({ where: { email } });       // SELECT
this.prisma.emailToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
```

## 6. 常见坑
- 构造器参数**不写类型** → Nest 不知道注入什么，运行时 `undefined`。
- 手动 `new XxxService()` 而不是让容器注入 → 依赖全是 undefined。
- 误以为「imports 里的模块都是全局的」→ 别的模块注入不到，报 `Nest can't resolve dependencies`。
- 只写 `@Global()` 忘了 `exports` → 依然注入不到。
- 用 `app.useGlobalGuards(new JwtAuthGuard())` 而不是 `APP_GUARD` → 实例不经 DI 容器，构造依赖是 undefined，一访问就 500。
- `model User` 却写 `prisma.users` → 属性名是 model 名单数小写，不是表名。
- 事务回调里混用 `this.prisma` 和 `tx` → 部分操作没进事务，原子性被破坏。

## 7. 验收 / 自测清单
- [ ] 能说清 `imports` 里的模块哪些是全局的、判断依据是什么
- [ ] 能解释「参数属性」的赋值发生在哪、值由谁传入
- [ ] 能说出 `this.prisma.user` 里的 `user` 从哪来（model 名首字母小写）
- [ ] 能区分 `@`（字段级）和 `@@`（模型级），并说明 `@@map` / `@@index` / `@@unique` 的用途
- [ ] 能写出一个「全局可注入的模块」的完整三要素

## 8. 延伸学习
- NestJS 官方「Providers」「Modules」「Injection scopes」（REQUEST / TRANSIENT）
- Prisma 官方「CRUD」「Transactions」（interactive vs batch）
- `@map` / `@@map` 的命名解耦最佳实践
