import { lazy } from "react";

export const ApplicationsPage = lazy(() => import("../pages/ApplicationsPage"));
export const ApplicationDetailPage = lazy(
  () => import("../pages/ApplicationDetailPage"),
);
export const HomePage = lazy(() => import("../pages/HomePage"));
export const CompaniesPage = lazy(() => import("../pages/CompaniesPage"));
export const CalendarPage = lazy(() => import("../pages/CalendarPage"));
export const DashboardPage = lazy(() => import("../pages/DashboardPage"));
export const DocumentsPage = lazy(() => import("../pages/DocumentsPage"));
export const JobOffersPage = lazy(() => import("../pages/JobOffersPage"));
export const LoginPage = lazy(() => import("../pages/LoginPage"));
export const RegisterPage = lazy(() => import("../pages/RegisterPage"));
export const ProfilePage = lazy(() => import("../pages/ProfilePage"));
export const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));
