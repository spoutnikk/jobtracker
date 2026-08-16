import { AxiosError, AxiosHeaders } from "axios";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { me, register, type AuthenticatedUser } from "../api/auth";
import { AuthProvider } from "../auth/AuthProvider";
import AnonymousOnlyRoute from "../routes/AnonymousOnlyRoute";
import ProtectedRoute from "../routes/ProtectedRoute";
import { renderWithProviders } from "../test/renderWithProviders";
import RegisterPage from "./RegisterPage";

vi.mock("../api/auth", () => ({
  me: vi.fn(),
  register: vi.fn(),
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

function renderRegister() {
  const router = createMemoryRouter(
    [
      { path: "/register", element: <RegisterPage /> },
      { path: "/login", element: <p>Login destination</p> },
      { path: "/dashboard", element: <p>Dashboard destination</p> },
    ],
    { initialEntries: ["/register"] },
  );
  const result = renderWithProviders(<RouterProvider router={router} />);

  return { router, ...result };
}

async function fillValidRegistration() {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Prénom"), "  Ada  ");
  await user.type(screen.getByLabelText("Nom"), "  Lovelace ");
  await user.type(screen.getByLabelText("Email"), "  Ada@Example.com  ");
  await user.type(screen.getByLabelText("Mot de passe"), "secret-password");
  await user.type(
    screen.getByLabelText("Confirmer le mot de passe"),
    "secret-password",
  );

  return user;
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(me).mockReset();
    vi.mocked(register).mockReset();
  });

  it("registers, synchronizes auth state, clears business queries, and redirects", async () => {
    vi.mocked(register).mockResolvedValue(authenticatedUser);
    const { queryClient, router } = renderRegister();
    queryClient.setQueryData(["applications"], [{ id: 1 }]);
    const user = await fillValidRegistration();

    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(register).toHaveBeenCalledTimes(1);

    const [registerInput] = vi.mocked(register).mock.calls[0];

    expect(registerInput).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "Ada@Example.com",
      password: "secret-password",
    });
    expect(queryClient.getQueryData(["applications"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth", "me"])).toEqual(authenticatedUser);
    expect(
      await screen.findByText("Dashboard destination"),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dashboard");
  });

  it("rejects mismatched passwords locally", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText("Prénom"), "Ada");
    await user.type(screen.getByLabelText("Nom"), "Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "secret-password");
    await user.type(
      screen.getByLabelText("Confirmer le mot de passe"),
      "different-password",
    );
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(register).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    const confirmationInput = screen.getByLabelText(
      "Confirmer le mot de passe",
    );

    expect(alert).toHaveTextContent("Les mots de passe ne correspondent pas.");
    expect(confirmationInput).toHaveAttribute("aria-invalid", "true");
    expect(confirmationInput).toHaveAttribute("aria-describedby", alert.id);
  });

  it("shows a stable conflict message for an existing email", async () => {
    vi.mocked(register).mockRejectedValue(createAxiosError(409));
    renderRegister();
    const user = await fillValidRegistration();

    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    const alert = await screen.findByRole("alert");
    const emailInput = screen.getByLabelText("Email");

    expect(alert).toHaveTextContent(
      "Un compte existe déjà avec cette adresse email.",
    );
    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(emailInput).toHaveAttribute("aria-describedby", "register-error");
    expect(document.getElementById("register-error")).toBe(alert);
  });

  it("shows a stable generic error", async () => {
    vi.mocked(register).mockRejectedValue(new Error("Network unavailable"));
    renderRegister();
    const user = await fillValidRegistration();

    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de créer le compte.",
    );
  });

  it("disables submission while registration is pending", async () => {
    let resolveRegistration: ((user: AuthenticatedUser) => void) | undefined;
    vi.mocked(register).mockImplementation(
      () =>
        new Promise<AuthenticatedUser>((resolve) => {
          resolveRegistration = resolve;
        }),
    );
    renderRegister();
    const user = await fillValidRegistration();

    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(
      screen.getByRole("button", { name: "Création du compte..." }),
    ).toBeDisabled();

    if (!resolveRegistration) {
      throw new Error("Registration resolver was not initialized");
    }

    const resolvePendingRegistration = resolveRegistration;

    await act(async () => {
      resolvePendingRegistration(authenticatedUser);
    });
  });

  it("synchronizes AuthProvider after registration", async () => {
    vi.mocked(me).mockRejectedValue(createAxiosError(401));
    vi.mocked(register).mockResolvedValue(authenticatedUser);
    const router = createMemoryRouter(
      [
        {
          element: <AnonymousOnlyRoute />,
          children: [{ path: "/register", element: <RegisterPage /> }],
        },
        {
          element: <ProtectedRoute />,
          children: [{ path: "/dashboard", element: <p>Dashboard privé</p> }],
        },
      ],
      { initialEntries: ["/register"] },
    );

    const { queryClient } = renderWithProviders(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Créer un compte" }),
    ).toBeInTheDocument();
    queryClient.setQueryData(["documents"], [{ id: 1 }]);
    const user = await fillValidRegistration();

    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByText("Dashboard privé")).toBeInTheDocument();
    expect(queryClient.getQueryData(["documents"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth", "me"])).toEqual(authenticatedUser);
  });
});
