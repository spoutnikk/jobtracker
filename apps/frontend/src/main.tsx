import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./auth/AuthProvider";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { router } from "./routes/router";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppErrorBoundary>
          <RouterProvider router={router} />
        </AppErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
