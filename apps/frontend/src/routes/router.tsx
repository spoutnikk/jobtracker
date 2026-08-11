import { createBrowserRouter } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import ApplicationsPage from "../pages/ApplicationsPage";
import ApplicationDetailPage from "../pages/ApplicationDetailPage";
import HomePage from "../pages/HomePage";
import CompaniesPage from "../pages/CompaniesPage";
import CalendarPage from "../pages/CalendarPage";
import DashboardPage from "../pages/DashboardPage";
import DocumentsPage from "../pages/DocumentsPage";
import JobOffersPage from "../pages/JobOffersPage";
import LoginPage from "../pages/LoginPage";
import AnonymousOnlyRoute from "./AnonymousOnlyRoute";
import ProtectedRoute from "./ProtectedRoute";

export const router = createBrowserRouter([
  {
    element: <AnonymousOnlyRoute />,
    children: [
      {
        path: "/login",
        element: <LoginPage />,
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
            element: <HomePage />,
          },
          {
            path: "/applications",
            element: <ApplicationsPage />,
          },
          {
            path: "/applications/:id",
            element: <ApplicationDetailPage />,
          },
          {
            path: "/companies",
            element: <CompaniesPage />,
          },
          {
            path: "/job-offers",
            element: <JobOffersPage />,
          },
          {
            path: "/calendar",
            element: <CalendarPage />,
          },
          {
            path: "/dashboard",
            element: <DashboardPage />,
          },
          {
            path: "/documents",
            element: <DocumentsPage />,
          },
        ],
      },
    ],
  },
]);
