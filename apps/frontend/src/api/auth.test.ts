import { describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import {
  changePassword,
  deleteAccount,
  login,
  logout,
  me,
  register,
  revokeOtherSessions,
  updateProfile,
  type AuthenticatedUser,
} from "./auth";

vi.mock("./client", () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

const authenticatedUser: AuthenticatedUser = {
  id: 1,
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
};

describe("auth API", () => {
  it("logs in and returns the authenticated user", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: authenticatedUser,
    });

    const input = {
      email: "ada@example.com",
      password: "secret-password",
    };

    await expect(login(input)).resolves.toEqual(authenticatedUser);

    expect(apiClient.post).toHaveBeenCalledWith("/auth/login", input);
  });

  it("registers and returns the authenticated user", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: authenticatedUser,
    });

    const input = {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      password: "secret-password",
    };

    await expect(register(input)).resolves.toEqual(authenticatedUser);

    expect(apiClient.post).toHaveBeenCalledWith("/auth/register", input);
  });

  it("loads the current authenticated user", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: authenticatedUser,
    });

    await expect(me()).resolves.toEqual(authenticatedUser);

    expect(apiClient.get).toHaveBeenCalledWith("/auth/me");
  });

  it("updates the authenticated profile", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: authenticatedUser,
    });

    const input = {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    };

    await expect(updateProfile(input)).resolves.toEqual(authenticatedUser);

    expect(apiClient.patch).toHaveBeenCalledWith("/auth/me", input);
  });

  it("changes the current password", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({});

    const input = {
      currentPassword: "old-password",
      newPassword: "new-secure-password",
    };

    await expect(changePassword(input)).resolves.toBeUndefined();

    expect(apiClient.patch).toHaveBeenCalledWith("/auth/me/password", input);
  });

  it("revokes all other sessions", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({});

    await expect(revokeOtherSessions()).resolves.toBeUndefined();

    expect(apiClient.post).toHaveBeenCalledWith("/auth/sessions/others");
  });

  it("deletes the authenticated account with the password payload", async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({});

    const input = {
      password: "current-password",
    };

    await expect(deleteAccount(input)).resolves.toBeUndefined();

    expect(apiClient.delete).toHaveBeenCalledWith("/auth/me", {
      data: input,
    });
  });

  it("logs out the current session", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({});

    await expect(logout()).resolves.toBeUndefined();

    expect(apiClient.post).toHaveBeenCalledWith("/auth/logout");
  });
});
