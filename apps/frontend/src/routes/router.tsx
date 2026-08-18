import { Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import PageLoadingState from "../components/PageLoadingState";
import AppLayout from "../layouts/AppLayout";
import AnonymousOnlyRoute from "./AnonymousOnlyRoute";
import {
  ApplicationDetailPage,
  ApplicationsPage,
  CalendarPage,
  CompaniesPage,
  DashboardPage,
  DocumentsPage,
  HomePage,
  JobOffersPage,
  LoginPage,
  NotFoundPage,
  ProfilePage,
  RegisterPage,
} from "./lazy-pages";
import ProtectedRoute from "./ProtectedRoute";

function lazyPage(page: ReactNode) {
  return (
    <Suspense fallback={<PageLoadingState>Chargement...</PageLoadingState>}>
      {page}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <AnonymousOnlyRoute />,
    children: [
      {
        path: "/login",
        element: lazyPage(<LoginPage />),
      },
      {
        path: "/register",
        element: lazyPage(<RegisterPage />),
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: "/",
            element: lazyPage(<HomePage />),
          },
          {
            path: "/applications",
            element: lazyPage(<ApplicationsPage />),
          },
          {
            path: "/applications/:id",
            element: lazyPage(<ApplicationDetailPage />),
          },
          {
            path: "/companies",
            element: lazyPage(<CompaniesPage />),
          },
          {
            path: "/job-offers",
            element: lazyPage(<JobOffersPage />),
          },
          {
            path: "/calendar",
            element: lazyPage(<CalendarPage />),
          },
          {
            path: "/dashboard",
            element: lazyPage(<DashboardPage />),
          },
          {
            path: "/documents",
            element: lazyPage(<DocumentsPage />),
          },
          {
            path: "/profile",
            element: lazyPage(<ProfilePage />),
          },
          {
            path: "*",
            element: lazyPage(<NotFoundPage />),
          },
        ],
      },
    ],
  },
]);
