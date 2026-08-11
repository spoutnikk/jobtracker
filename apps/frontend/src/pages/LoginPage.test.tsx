import { AxiosError, AxiosHeaders } from "axios";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  type InitialEntry,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, me, type AuthenticatedUser } from "../api/auth";
import { AuthProvider } from "../auth/AuthProvider";
import { renderWithProviders } from "../test/renderWithProviders";
import AnonymousOnlyRoute from "../routes/AnonymousOnlyRoute";
import ProtectedRoute from "../routes/ProtectedRoute";
import LoginPage from "./LoginPage";

vi.mock("../api/auth", () => ({
  login: vi.fn(),
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

function renderLogin(initialEntry: InitialEntry = "/login") {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/dashboard", element: <p>Dashboard destination</p> },
      { path: "/applications", element: <p>Applications destination</p> },
    ],
    { initialEntries: [initialEntry] },
  );
  const result = renderWithProviders(<RouterProvider router={router} />);

  return { router, ...result };
}

async function fillAndSubmitLogin() {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Email"), "  Ada@Example.com  ");
  await user.type(screen.getByLabelText("Mot de passe"), "secret-password");
  await user.click(screen.getByRole("button", { name: "Connexion" }));

  return user;
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(login).mockReset();
    vi.mocked(me).mockReset();
  });

  it("logs in, replaces the auth cache, and returns to the requested route", async () => {
    vi.mocked(login).mockResolvedValue(authenticatedUser);
    const { queryClient } = renderLogin({
      pathname: "/login",
      state: {
        from: {
          pathname: "/applications",
          search: "",
          hash: "",
        },
      },
    });
    queryClient.setQueryData(["job-offers"], [{ id: 99 }]);
    const removeQueriesSpy = vi.spyOn(queryClient, "removeQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await fillAndSubmitLogin();

    expect(login).toHaveBeenCalledTimes(1);
    const firstLoginCall = vi.mocked(login).mock.calls[0];

    if (!firstLoginCall) {
      throw new Error("Login was not called");
    }

    const [loginInput] = firstLoginCall;
    expect(loginInput).toEqual({
      email: "Ada@Example.com",
      password: "secret-password",
    });
    expect(removeQueriesSpy).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["job-offers"])).toBeUndefined();
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ["auth", "me"],
      authenticatedUser,
    );
    expect(
      await screen.findByText("Applications destination"),
    ).toBeInTheDocument();
  });

  it("synchronizes AuthProvider after login while clearing business queries", async () => {
    vi.mocked(me).mockRejectedValue(createAxiosError(401));
    vi.mocked(login).mockResolvedValue(authenticatedUser);
    const router = createMemoryRouter(
      [
        {
          element: <AnonymousOnlyRoute />,
          children: [{ path: "/login", element: <LoginPage /> }],
        },
        {
          element: <ProtectedRoute />,
          children: [
            { path: "/private", element: <p>Authenticated content</p> },
            { path: "/dashboard", element: <p>Dashboard privé</p> },
          ],
        },
      ],
      { initialEntries: ["/private"] },
    );
    const { queryClient } = renderWithProviders(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Connexion" }),
    ).toBeInTheDocument();
    queryClient.setQueryData(["job-offers"], [{ id: 99 }]);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Connexion" }));

    expect(await screen.findByText("Dashboard privé")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dashboard");
    expect(queryClient.getQueryData(["job-offers"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth", "me"])).toEqual(authenticatedUser);
  });

  it("shows the stable invalid credentials message for a 401", async () => {
    vi.mocked(login).mockRejectedValue(createAxiosError(401));
    renderLogin();

    await fillAndSubmitLogin();

    expect(
      await screen.findByText("Email ou mot de passe incorrect."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Connexion" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dashboard destination")).not.toBeInTheDocument();
  });

  it("shows a stable generic message for another error", async () => {
    vi.mocked(login).mockRejectedValue(new Error("Network unavailable"));
    renderLogin();

    await fillAndSubmitLogin();

    expect(
      await screen.findByText("Impossible de se connecter."),
    ).toBeInTheDocument();
  });

  it("disables the submit button while login is pending", async () => {
    let resolveLogin: ((user: AuthenticatedUser) => void) | undefined;
    vi.mocked(login).mockImplementation(
      () =>
        new Promise<AuthenticatedUser>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    renderLogin();

    await fillAndSubmitLogin();

    const pendingButton = screen.getByRole("button", {
      name: "Connexion...",
    });
    expect(pendingButton).toBeDisabled();

    if (!resolveLogin) {
      throw new Error("Login resolver was not initialized");
    }

    const resolvePendingLogin = resolveLogin;
    await act(async () => {
      resolvePendingLogin(authenticatedUser);
    });
  });
});
