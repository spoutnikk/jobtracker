import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../api/auth";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from "../auth/useAuth";
import { renderWithProviders } from "../test/renderWithProviders";
import AnonymousOnlyRoute from "./AnonymousOnlyRoute";
import ProtectedRoute from "./ProtectedRoute";

const authenticatedUser: AuthenticatedUser = {
  id: 7,
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
};

function TestLayout() {
  return (
    <div>
      <p>Application layout</p>
      <Outlet />
    </div>
  );
}

function renderAuthRoutes(
  status: AuthStatus,
  initialEntry: string,
  retryInitialization = vi.fn(),
) {
  const value: AuthContextValue = {
    status,
    user: status === "authenticated" ? authenticatedUser : null,
    retryInitialization,
  };
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <TestLayout />,
            children: [
              { path: "/private", element: <p>Private content</p> },
              { path: "/dashboard", element: <p>Dashboard content</p> },
              {
                path: "/applications/:id",
                element: <p>Application detail content</p>,
              },
              { path: "*", element: <p>Not found content</p> },
            ],
          },
        ],
      },
      {
        element: <AnonymousOnlyRoute />,
        children: [
          { path: "/login", element: <p>Login content</p> },
          { path: "/register", element: <p>Register content</p> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );

  renderWithProviders(
    <AuthContext.Provider value={value}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );

  return { retryInitialization, router };
}

describe("Auth routes", () => {
  it("redirects an anonymous private request to login and preserves it", async () => {
    const { router } = renderAuthRoutes("anonymous", "/private");

    expect(await screen.findByText("Login content")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toMatchObject({
      from: {
        pathname: "/private",
      },
    });
  });

  it("renders private content for an authenticated user", async () => {
    renderAuthRoutes("authenticated", "/private");

    expect(await screen.findByText("Private content")).toBeInTheDocument();
  });

  it("protects the application detail route", async () => {
    const { router } = renderAuthRoutes("anonymous", "/applications/42");

    expect(await screen.findByText("Login content")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toMatchObject({
      from: { pathname: "/applications/42" },
    });
  });

  it("renders an application detail route for an authenticated user", async () => {
    renderAuthRoutes("authenticated", "/applications/42");

    expect(
      await screen.findByText("Application detail content"),
    ).toBeInTheDocument();
  });

  it("redirects an authenticated login request to the dashboard", async () => {
    renderAuthRoutes("authenticated", "/login");

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
  });

  it("renders registration for an anonymous user", async () => {
    renderAuthRoutes("anonymous", "/register");

    expect(await screen.findByText("Register content")).toBeInTheDocument();
  });

  it("redirects an authenticated registration request to the dashboard", async () => {
    renderAuthRoutes("authenticated", "/register");

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
  });

  it("renders an unknown route inside the authenticated application layout", async () => {
    renderAuthRoutes("authenticated", "/does-not-exist");

    expect(await screen.findByText("Application layout")).toBeInTheDocument();
    expect(screen.getByText("Not found content")).toBeInTheDocument();
  });

  it("redirects an anonymous unknown route to login", async () => {
    const { router } = renderAuthRoutes("anonymous", "/does-not-exist");

    expect(await screen.findByText("Login content")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toMatchObject({
      from: { pathname: "/does-not-exist" },
    });
  });

  it("announces session verification while authentication initializes", () => {
    renderAuthRoutes("initializing", "/private");

    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
      "Vérification de la session...",
    );
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
  });

  it("shows a retryable session error", async () => {
    const user = userEvent.setup();
    const retryInitialization = vi.fn();
    renderAuthRoutes("error", "/private", retryInitialization);

    expect(
      screen.getByText("Impossible de vérifier la session."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(retryInitialization).toHaveBeenCalledTimes(1);
  });
});
