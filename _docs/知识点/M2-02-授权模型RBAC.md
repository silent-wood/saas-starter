# M2-02 授权模型（RBAC 接口级 + 按钮级）

> 知识分类：M2 认证与多租户 ｜ 关联里程碑：M2 ｜ 责任视角：后端 / 前端
> 状态：⚙️ 机制已定稿（`06-RBAC与审计` 方案 §4.3），代码待落地；成员管理接口随 05 实现

## 1. 这是什么
**RBAC（基于角色的访问控制）**：给用户分配角色（owner / admin / member），角色决定能做什么。本项目分两层——**接口级**（后端 Guard 拦截越权请求）和**按钮级**（前端按权限隐藏/禁用 UI）。

## 2. 为什么值得学
- 权限是 B 端系统的骨架，几乎每个中后台都有。面试高频。
- 关键认知：**权限必须后端 enforcement，前端只是体验优化**。前端隐藏按钮防君子不防小人，真正的防线在接口。

## 3. 核心概念
- **角色**：owner（租户所有者，可转让）、admin（管理成员/设置）、member（普通使用）。
- **接口级**：Guard 里查当前用户角色，不满足直接 403。如「删除成员」仅 owner/admin 可。
- **按钮级**：前端拿到当前角色，渲染时决定按钮显隐/可用（提升体验，不替代后端）。
- **数据级**：结合 M2-03 的租户隔离，连「看哪个租户的数据」都强制过滤。

## 4. 在本项目如何落地

- **后端**：`@Roles('admin','owner')` + 全局 `RolesGuard`。角色**不在 JWT 里**——`TenantGuard` 先查 `memberships` 拿到 `role` 写入 `req.userRole`，`RolesGuard` 只读这个字段比对，自身不查库（否则每个请求要查两次 membership）。
- **`@Roles` 的语义是「默认放行、标注收紧」**：没标 `@Roles` 的接口，任何通过 `JwtAuthGuard` 的请求都放行；标了才校验。这与 `@Public()` 的「默认拦、白名单放」方向相反，是最容易写反的一处。
- **前端**：`usePermission()` Hook 读 shared 的权限矩阵（`canDo(role, permission)`），控制按钮显隐。
- **shared**：`ROLE` 枚举、`PERMISSIONS` 矩阵、`AUDIT_ACTIONS` 都放 `@saas/shared`，前后端同源（详见 `06-RBAC与审计` 方案）。

## 5. 关键代码示例

```ts
// 后端：守卫在 app.module.ts 全局注册，controller 上只写 @Roles
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },  // 先确定 req.user.sub
  { provide: APP_GUARD, useClass: TenantGuard },   // 再查 membership，写 req.userRole
  { provide: APP_GUARD, useClass: RolesGuard },    // 最后比对角色（顺序不可换）
]
```
```ts
// controller 侧：只声明允许的角色，不写 @UseGuards
@Roles('owner', 'admin')
@Delete('members/:id')
async removeMember() { /* ... */ }
```
```tsx
// 前端按钮级：与后端矩阵同源
{canDo(role, 'member.remove') && <Button>移除成员</Button>}
```

## 6. 常见坑

- 只在「前端隐藏按钮」就以为安全 → 攻击者可直连 API 越权操作。务必后端再拦。
- **从 JWT 里取角色** → JWT 载荷根本没有 `role`（只含 `sub` + `type`），读到的是 `undefined`，所有标了 `@Roles` 的接口全 403。角色属于「某个用户在某租户内」的关系，必须从 `memberships` 查。
- 角色硬编码在多处 → 改角色体系要全局搜；用枚举集中管理。
- 忘记「owner 转让」后的旧 owner 角色回收 → 造成两个 owner。
- 权限点过细导致前端泛滥 → 适度粗粒度（按资源+操作）。
- **把对象级规则塞进 `@Roles`** → 「admin 不能改 owner」这类规则依赖**被操作对象**的角色，而 `@Roles` 只知道调用者角色。写成 `@Roles('owner')` 会把 admin 一起挡在门外，正确做法是在 service 里做对象级校验。
- **`@Roles` 接口又标了 `@SkipTenant`** → 没有租户上下文，`req.userRole` 为空，恒定 403。两者语义矛盾，不要叠加。

## 7. 验收 / 自测清单

- [ ] member 角色直接调 admin 接口返回 403 `ROLE_DENIED`
- [ ] 未标 `@Roles` 的接口，member 也能正常访问（默认放行语义）
- [ ] 标了 `@Roles` 但 `req.userRole` 为空的请求 → 403（配置错误的兜底）
- [ ] 前端 member 账号看不到管理按钮
- [ ] 角色定义与权限矩阵集中在 shared，前后端同源
- [ ] owner 转让后原 owner 权限正确降级

## 8. 延伸学习
- RBAC vs ABAC（属性基访问控制）
- Casbin 权限库
- 最小权限原则（Principle of Least Privilege）
