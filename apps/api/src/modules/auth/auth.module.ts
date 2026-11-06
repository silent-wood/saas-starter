import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MailService } from './mail.service.js';
import { TokenService } from './token.service.js';

/**
 * 认证模块 —— 注册 / 登录 / 刷新 / 登出 / 邮箱验证 的装配入口。
 *
 * NestJS 每个功能一个 Module，作用是把「这个功能用到的东西」声明出来，
 * 由依赖注入容器（DI）负责创建实例并注入到各自构造函数。
 *
 * 三个 Service 的职责边界（避免一个类越写越肥）：
 *  - TokenService：只管令牌的生成 / 哈希 / 签发，不碰数据库和业务
 *  - MailService：  只管发邮件，dev 模式下打日志
 *  - AuthService：  编排业务逻辑（调 Prisma + 上面两个 service）
 *  - AuthController：HTTP 入口，解析请求、校验 body、回写 cookie，不写业务
 *
 * controllers：告诉 Nest「哪些是 HTTP 路由处理类」
 * providers： 告诉 Nest「哪些类需要被实例化并互相注入」
 * exports：   声明「哪些 provider 可以被别的模块 import 后使用」
 */
@Module({
  // 不需要 import PrismaModule：它是 @Global 的
  // 也不需要 import JwtModule：app.module 里注册成 global
  controllers: [AuthController],
  providers: [AuthService, TokenService, MailService],
  // 导出 TokenService 供后续 tenants / 其它模块复用签令牌能力，
  // 不导出 AuthService 是为了逼调用方走 controller 边界
  exports: [TokenService],
})
export class AuthModule {}
