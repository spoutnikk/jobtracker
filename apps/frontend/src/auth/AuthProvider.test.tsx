import { AxiosError, AxiosHeaders } from "axios";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { me, type AuthenticatedUser } from "../api/auth";
import { renderWithProviders } from "../test/renderWithProviders";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

vi.mock("../api/auth", () => ({
  me: vi.fn(),
}));

const authenticatedUser: AuthenticatedUser = {
  id: 7,
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
};

function AuthStateProbe() {
  const { status, user, retryInitialization } = useAuth();

  return (
    <div>
      <p>status:{status}</p>
      <p>user:{user?.email ?? "none"}</p>
      <button type="button" onClick={retryInitialization}>
        Retry
      </button>
    </div>
  );
}

function createAxiosError(status: number): AxiosError {
  return new AxiosError(
    "Request failed",
    "ERR_BAD_RESPONSE",
    {
      headers: new AxiosHeaders(),
    },
    undefined,
    {
      data: {},
      status,
      statusText: "Error",
      headers: new AxiosHeaders(),
      config: {
        headers: new AxiosHeaders(),
      },
    },
  );
}

function renderAuthProvider() {
  return renderWithProviders(
    <AuthProvider>
      <AuthStateProbe />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(me).mockReset();
  });

  it("restores an authenticated user without storing browser credentials", async () => {
    const storageSetItem = vi.spyOn(Storage.prototype, "setItem");
    const initialCookie = document.cookie;
    vi.mocked(me).mockResolvedValue(authenticatedUser);

    renderAuthProvider();

    expect(await screen.findByText("status:authenticated")).toBeInTheDocument();
    expect(screen.getByText("user:ada@example.com")).toBeInTheDocument();
    expect(storageSetItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe(initialCookie);
  });

  it("treats an unauthorized session as anonymous", async () => {
    vi.mocked(me).mockRejectedValue(createAxiosError(401));

    renderAuthProvider();

    expect(await screen.findByText("status:anonymous")).toBeInTheDocument();
    expect(screen.getByText("user:none")).toBeInTheDocument();
    expect(screen.queryByText("status:error")).not.toBeInTheDocument();
  });

  it("keeps a network failure as a retryable initialization error", async () => {
    vi.mocked(me).mockRejectedValue(new Error("Network unavailable"));

    renderAuthProvider();

    expect(await screen.findByText("status:error")).toBeInTheDocument();
    expect(screen.getByText("user:none")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("restores the user after retrying a failed initialization", async () => {
    const user = userEvent.setup();
    vi.mocked(me)
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(authenticatedUser);

    renderAuthProvider();

    await screen.findByText("status:error");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("status:authenticated")).toBeInTheDocument();
    expect(screen.getByText("user:ada@example.com")).toBeInTheDocument();
    expect(me).toHaveBeenCalledTimes(2);
  });
});
