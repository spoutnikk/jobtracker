import { AxiosError, AxiosHeaders } from "axios";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logout, me, type AuthenticatedUser } from "../api/auth";
import { AuthProvider } from "../auth/AuthProvider";
import AnonymousOnlyRoute from "../routes/AnonymousOnlyRoute";
import ProtectedRoute from "../routes/ProtectedRoute";
import { renderWithProviders } from "../test/renderWithProviders";
import AppLayout from "./AppLayout";

vi.mock("../api/auth", () => ({
  logout: vi.fn(),
  me: vi.fn(),
}));

const authenticatedUser: AuthenticatedUser = {
  id: 7,
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
};

function createAxiosError(status: number): AxiosError {
  return new AxiosError(
    "Backend message must not drive the UI",
    "ERR_BAD_RESPONSE",
    { headers: new AxiosHeaders() },
    undefined,
    {
      data: { message: "Ignored backend message" },
      status,
      statusText: "Error",
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    },
  );
}

function renderAuthenticatedLayout() {
  const router = createMemoryRouter(
    [
      {
        element: <AnonymousOnlyRoute />,
        children: [{ path: "/login", element: <p>Login page</p> }],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: "/", element: <p>Private home</p> },
              { path: "/dashboard", element: <p>Private dashboard</p> },
              { path: "/applications", element: <p>Private applications</p> },
              { path: "/profile", element: <p>Private profile</p> },
            ],
          },
        ],
      },
    ],
    { initialEntries: ["/dashboard"] },
  );
  const result = renderWithProviders(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );

  return { router, ...result };
}

describe("AppLayout navigation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(me).mockReset();
    vi.mocked(logout).mockReset();
    vi.mocked(me).mockResolvedValue(authenticatedUser);
  });

  it("exposes a responsive navigation menu with coherent accessibility attributes", async () => {
    const user = userEvent.setup();

    renderAuthenticatedLayout();

    await screen.findByText("Private dashboard");

    const menuButton = screen.getByRole("button", { name: "Ouvrir le menu" });
    const navigation = screen.getByRole("navigation", {
      name: "Navigation principale",
    });

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).toHaveAttribute("aria-controls", navigation.id);
    expect(navigation).toHaveClass("hidden");

    await user.click(menuButton);

    expect(
      screen.getByRole("button", { name: "Fermer le menu" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(navigation).toHaveClass("flex");
    expect(navigation).not.toHaveClass("hidden");
  });

  it("closes the mobile menu after navigating", async () => {
    const user = userEvent.setup();

    renderAuthenticatedLayout();

    await screen.findByText("Private dashboard");
    await user.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
    await user.click(screen.getByRole("link", { name: "Candidatures" }));

    expect(await screen.findByText("Private applications")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ouvrir le menu" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("navigation", { name: "Navigation principale" }),
    ).toHaveClass("hidden");
  });

  it("navigates to the protected profile page", async () => {
    const user = userEvent.setup();
    const { router } = renderAuthenticatedLayout();

    await screen.findByText("Private dashboard");
    await user.click(screen.getByRole("link", { name: "Profil" }));

    expect(await screen.findByText("Private profile")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/profile");
  });
});

describe("AppLayout logout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(me).mockReset();
    vi.mocked(logout).mockReset();
    vi.mocked(me).mockResolvedValue(authenticatedUser);
  });

  it("logs out once, clears sensitive caches, and redirects to login", async () => {
    let resolveLogout: (() => void) | undefined;
    vi.mocked(logout).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const { queryClient, router } = renderAuthenticatedLayout();
    const user = userEvent.setup();

    await screen.findByText("Private dashboard");
    queryClient.setQueryData(["applications"], [{ id: 1 }]);
    await user.click(screen.getByRole("button", { name: "Déconnexion" }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Déconnexion..." }),
    ).toBeDisabled();

    if (!resolveLogout) {
      throw new Error("Logout resolver was not initialized");
    }

    const resolvePendingLogout = resolveLogout;
    await act(async () => {
      resolvePendingLogout();
    });

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(queryClient.getQueryData(["applications"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth", "me"])).toBeNull();
  });

  it("treats a logout 401 as a completed local logout", async () => {
    vi.mocked(logout).mockRejectedValue(createAxiosError(401));
    const { queryClient } = renderAuthenticatedLayout();
    const user = userEvent.setup();

    await screen.findByText("Private dashboard");
    queryClient.setQueryData(["documents"], [{ id: 1 }]);
    await user.click(screen.getByRole("button", { name: "Déconnexion" }));

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(queryClient.getQueryData(["documents"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth", "me"])).toBeNull();
    expect(
      screen.queryByText("Impossible de se déconnecter."),
    ).not.toBeInTheDocument();
  });

  it("keeps the authenticated state after a logout network failure", async () => {
    vi.mocked(logout).mockRejectedValue(new Error("Network unavailable"));
    const { queryClient } = renderAuthenticatedLayout();
    const user = userEvent.setup();

    await screen.findByText("Private dashboard");
    await user.click(screen.getByRole("button", { name: "Déconnexion" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de se déconnecter.",
    );
    expect(screen.getByText("Private dashboard")).toBeInTheDocument();
    expect(queryClient.getQueryData(["auth", "me"])).toEqual(authenticatedUser);
  });
});
