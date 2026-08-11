import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
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
          { path: "/private", element: <p>Private content</p> },
          { path: "/dashboard", element: <p>Dashboard content</p> },
        ],
      },
      {
        element: <AnonymousOnlyRoute />,
        children: [{ path: "/login", element: <p>Login content</p> }],
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

  it("redirects an authenticated login request to the dashboard", async () => {
    renderAuthRoutes("authenticated", "/login");

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
  });

  it("does not render private content while authentication initializes", () => {
    renderAuthRoutes("initializing", "/private");

    expect(
      screen.getByText("Vérification de la session..."),
    ).toBeInTheDocument();
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
