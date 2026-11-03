import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { getToken } from '@/utils/token';

export function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
