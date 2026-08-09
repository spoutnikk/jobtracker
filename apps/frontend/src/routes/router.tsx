import { createBrowserRouter } from "react-router-dom";
import ApplicationsPage from "../pages/ApplicationsPage";
import HomePage from "../pages/HomePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/applications",
    element: <ApplicationsPage />,
  },
]);
