import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

export const TOKEN_KEY = 'token';

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
