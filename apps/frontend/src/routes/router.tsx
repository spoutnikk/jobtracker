import { createBrowserRouter } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import ApplicationsPage from "../pages/ApplicationsPage";
import HomePage from "../pages/HomePage";
import CompaniesPage from "../pages/CompaniesPage";
import CalendarPage from "../pages/CalendarPage";

export const router = createBrowserRouter([
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
        path: "/companies",
        element: <CompaniesPage />,
      },
      {
        path: "/calendar",
        element: <CalendarPage />,
      },
    ],
  },
]);
