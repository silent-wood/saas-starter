import type {
  ForgotPasswordInput,
  ForgotPasswordResult,
  LoginInput,
  LoginResult,
  LogoutResult,
  MeResult,
  RegisterInput,
  RegisterResult,
  ResetPasswordInput,
  ResetPasswordResult,
  VerifyEmailInput,
  VerifyEmailResult,
} from '@saas/shared';
import { api } from './client';

export const authApi = {
  register: (body: RegisterInput) => api.post<RegisterResult>('/auth/register', body),
  verifyEmail: (body: VerifyEmailInput) => api.post<VerifyEmailResult>('/auth/verify-email', body),
  login: (body: LoginInput) => api.post<LoginResult>('/auth/login', body),
  logout: () => api.post<LogoutResult>('/auth/logout'),
  me: () => api.get<MeResult>('/auth/me'),
  forgotPassword: (body: ForgotPasswordInput) =>
    api.post<ForgotPasswordResult>('/auth/forgot-password', body),
  resetPassword: (body: ResetPasswordInput) =>
    api.post<ResetPasswordResult>('/auth/reset-password', body),
};
