import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { Spin } from "antd";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import { RequireAuth } from "@/app/guards/RequireAuth";
import { AuthLayout } from "@/app/AuthLayout";

const Resources = lazy(() => import("@/pages/Resource"));

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/app",
    element: (
      <RequireAuth>
        <AuthLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: "resources",
        element: (
          <Suspense fallback={<Spin />}>
            <Resources />
          </Suspense>
        ),
      },
    ],
  },
  { path: "/", element: <Navigate to="/app" replace /> },
]);

export { router };
