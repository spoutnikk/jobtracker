import { AxiosError, AxiosHeaders } from "axios";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changePassword,
  me,
  updateProfile,
  type AuthenticatedUser,
} from "../api/auth";
import { AuthProvider } from "../auth/AuthProvider";
import ProtectedRoute from "../routes/ProtectedRoute";
import { renderWithProviders } from "../test/renderWithProviders";
import ProfilePage from "./ProfilePage";

vi.mock("../api/auth", () => ({
  changePassword: vi.fn(),
  me: vi.fn(),
  updateProfile: vi.fn(),
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

function renderProfile() {
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [{ path: "/profile", element: <ProfilePage /> }],
      },
      { path: "/login", element: <p>Login destination</p> },
    ],
    { initialEntries: ["/profile"] },
  );

  const result = renderWithProviders(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );

  return { router, ...result };
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(changePassword).mockReset();
    vi.mocked(me).mockReset();
    vi.mocked(updateProfile).mockReset();
    vi.mocked(me).mockResolvedValue(authenticatedUser);
  });

  it("renders the authenticated user profile", async () => {
    renderProfile();

    expect(
      await screen.findByRole("heading", { name: "Profil" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Prénom")).toHaveValue("Ada");
    expect(screen.getByLabelText("Nom")).toHaveValue("Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("updates the profile and synchronizes the auth cache", async () => {
    const updatedUser: AuthenticatedUser = {
      ...authenticatedUser,
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.com",
    };
    vi.mocked(updateProfile).mockResolvedValue(updatedUser);
    const { queryClient } = renderProfile();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Profil" });
    await user.clear(screen.getByLabelText("Prénom"));
    await user.type(screen.getByLabelText("Prénom"), "  Grace  ");
    await user.clear(screen.getByLabelText("Nom"));
    await user.type(screen.getByLabelText("Nom"), " Hopper ");
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), " grace@example.com ");
    await user.click(
      screen.getByRole("button", { name: "Enregistrer les modifications" }),
    );

    expect(updateProfile).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(updateProfile).mock.calls[0];

    if (!firstCall) {
      throw new Error("updateProfile was not called");
    }

    expect(firstCall[0]).toEqual({
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.com",
    });

    expect(await screen.findByText("Profil mis à jour.")).toBeInTheDocument();
    expect(queryClient.getQueryData(["auth", "me"])).toEqual(updatedUser);
    expect(screen.getByLabelText("Prénom")).toHaveValue("Grace");
    expect(screen.getByLabelText("Nom")).toHaveValue("Hopper");
    expect(screen.getByLabelText("Email")).toHaveValue("grace@example.com");
  });

  it("shows a stable conflict message for an existing email", async () => {
    vi.mocked(updateProfile).mockRejectedValue(createAxiosError(409));
    renderProfile();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Profil" });
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "existing@example.com");
    await user.click(
      screen.getByRole("button", { name: "Enregistrer les modifications" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Un compte existe déjà avec cette adresse email.",
    );
  });

  it("shows a stable generic error", async () => {
    vi.mocked(updateProfile).mockRejectedValue(
      new Error("Network unavailable"),
    );
    renderProfile();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Profil" });
    await user.click(
      screen.getByRole("button", { name: "Enregistrer les modifications" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de mettre à jour le profil.",
    );
  });

  it("changes the password and clears the password fields", async () => {
    vi.mocked(changePassword).mockResolvedValue(undefined);
    renderProfile();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Profil" });
    await user.type(
      screen.getByLabelText("Mot de passe actuel"),
      "current-password",
    );
    await user.type(
      screen.getByLabelText("Nouveau mot de passe"),
      "new-secure-password",
    );
    await user.type(
      screen.getByLabelText("Confirmer le nouveau mot de passe"),
      "new-secure-password",
    );
    await user.click(
      screen.getByRole("button", { name: "Modifier le mot de passe" }),
    );

    expect(changePassword).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(changePassword).mock.calls[0];

    if (!firstCall) {
      throw new Error("changePassword was not called");
    }

    expect(firstCall[0]).toEqual({
      currentPassword: "current-password",
      newPassword: "new-secure-password",
    });
    expect(
      await screen.findByText("Mot de passe mis à jour."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe actuel")).toHaveValue("");
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveValue("");
    expect(
      screen.getByLabelText("Confirmer le nouveau mot de passe"),
    ).toHaveValue("");
  });

  it("rejects mismatched new passwords locally", async () => {
    renderProfile();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Profil" });
    await user.type(
      screen.getByLabelText("Mot de passe actuel"),
      "current-password",
    );
    await user.type(
      screen.getByLabelText("Nouveau mot de passe"),
      "new-secure-password",
    );
    await user.type(
      screen.getByLabelText("Confirmer le nouveau mot de passe"),
      "different-password",
    );
    await user.click(
      screen.getByRole("button", { name: "Modifier le mot de passe" }),
    );

    expect(changePassword).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Les nouveaux mots de passe ne correspondent pas.",
    );
  });

  it("shows a stable current-password error for a 401", async () => {
    vi.mocked(changePassword).mockRejectedValue(createAxiosError(401));
    renderProfile();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Profil" });
    await user.type(
      screen.getByLabelText("Mot de passe actuel"),
      "wrong-password",
    );
    await user.type(
      screen.getByLabelText("Nouveau mot de passe"),
      "new-secure-password",
    );
    await user.type(
      screen.getByLabelText("Confirmer le nouveau mot de passe"),
      "new-secure-password",
    );
    await user.click(
      screen.getByRole("button", { name: "Modifier le mot de passe" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mot de passe actuel incorrect.",
    );
  });

  it("shows a stable generic password-change error", async () => {
    vi.mocked(changePassword).mockRejectedValue(
      new Error("Network unavailable"),
    );
    renderProfile();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Profil" });
    await user.type(
      screen.getByLabelText("Mot de passe actuel"),
      "current-password",
    );
    await user.type(
      screen.getByLabelText("Nouveau mot de passe"),
      "new-secure-password",
    );
    await user.type(
      screen.getByLabelText("Confirmer le nouveau mot de passe"),
      "new-secure-password",
    );
    await user.click(
      screen.getByRole("button", { name: "Modifier le mot de passe" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de modifier le mot de passe.",
    );
  });

  it("disables password submission while the request is pending", async () => {
    let resolvePasswordChange: (() => void) | undefined;
    vi.mocked(changePassword).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePasswordChange = resolve;
        }),
    );
    renderProfile();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Profil" });
    await user.type(
      screen.getByLabelText("Mot de passe actuel"),
      "current-password",
    );
    await user.type(
      screen.getByLabelText("Nouveau mot de passe"),
      "new-secure-password",
    );
    await user.type(
      screen.getByLabelText("Confirmer le nouveau mot de passe"),
      "new-secure-password",
    );
    await user.click(
      screen.getByRole("button", { name: "Modifier le mot de passe" }),
    );

    expect(
      screen.getByRole("button", { name: "Modification..." }),
    ).toBeDisabled();

    if (!resolvePasswordChange) {
      throw new Error("Password change resolver was not initialized");
    }

    const resolvePendingPasswordChange = resolvePasswordChange;
    await act(async () => {
      resolvePendingPasswordChange();
    });
  });

  it("disables submission while the update is pending", async () => {
    let resolveUpdate: ((user: AuthenticatedUser) => void) | undefined;
    vi.mocked(updateProfile).mockImplementation(
      () =>
        new Promise<AuthenticatedUser>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    renderProfile();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Profil" });
    await user.click(
      screen.getByRole("button", { name: "Enregistrer les modifications" }),
    );

    expect(
      screen.getByRole("button", { name: "Enregistrement..." }),
    ).toBeDisabled();

    if (!resolveUpdate) {
      throw new Error("Update resolver was not initialized");
    }

    const resolvePendingUpdate = resolveUpdate;
    await act(async () => {
      resolvePendingUpdate(authenticatedUser);
    });
  });
});
