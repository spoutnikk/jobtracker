import {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from "axios";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { me, type AuthenticatedUser } from "../api/auth";
import { apiClient } from "../api/client";
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

function createAxiosError(
  status: number,
  url?: string,
  method?: string,
): AxiosError {
  const config: InternalAxiosRequestConfig = {
    url,
    method,
    headers: new AxiosHeaders(),
  };

  return new AxiosError(
    "Request failed",
    "ERR_BAD_RESPONSE",
    config,
    undefined,
    {
      data: {},
      status,
      statusText: "Error",
      headers: new AxiosHeaders(),
      config,
    },
  );
}

function createRejectedApiRequest(url: string, status: number, method = "get") {
  const error = createAxiosError(status, url, method);

  return {
    error,
    request: apiClient.request({
      url,
      method,
      adapter: () => Promise.reject(error),
    }),
  };
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

  it("clears sensitive caches and expires auth after a business 401", async () => {
    vi.mocked(me).mockResolvedValue(authenticatedUser);
    const { queryClient } = renderAuthProvider();

    await screen.findByText("status:authenticated");
    queryClient.setQueryData(["applications"], [{ id: 1 }]);

    const { error, request } = createRejectedApiRequest("/applications", 401);
    await expect(request).rejects.toBe(error);

    expect(await screen.findByText("status:anonymous")).toBeInTheDocument();
    expect(queryClient.getQueryData(["applications"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth", "me"])).toBeNull();
  });

  it("does not globally handle 401 responses from auth endpoints", async () => {
    vi.mocked(me).mockResolvedValue(authenticatedUser);
    const { queryClient } = renderAuthProvider();

    await screen.findByText("status:authenticated");
    queryClient.setQueryData(["applications"], [{ id: 1 }]);

    const loginRequest = createRejectedApiRequest("/auth/login", 401, "post");
    const meRequest = createRejectedApiRequest("/auth/me", 401);
    await expect(loginRequest.request).rejects.toBe(loginRequest.error);
    await expect(meRequest.request).rejects.toBe(meRequest.error);

    expect(screen.getByText("status:authenticated")).toBeInTheDocument();
    expect(queryClient.getQueryData(["applications"])).toEqual([{ id: 1 }]);
    expect(queryClient.getQueryData(["auth", "me"])).toEqual(authenticatedUser);
  });

  it("keeps a coherent anonymous state after simultaneous business 401s", async () => {
    vi.mocked(me).mockResolvedValue(authenticatedUser);
    const { queryClient } = renderAuthProvider();

    await screen.findByText("status:authenticated");
    queryClient.setQueryData(["documents"], [{ id: 1 }]);

    const results = await Promise.allSettled([
      createRejectedApiRequest("/applications", 401).request,
      createRejectedApiRequest("/documents", 401).request,
    ]);

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(await screen.findByText("status:anonymous")).toBeInTheDocument();
    expect(queryClient.getQueryData(["documents"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth", "me"])).toBeNull();
  });

  it("installs one response interceptor and ejects it on unmount", async () => {
    const useSpy = vi.spyOn(apiClient.interceptors.response, "use");
    const ejectSpy = vi.spyOn(apiClient.interceptors.response, "eject");
    vi.mocked(me).mockResolvedValue(authenticatedUser);

    const { rerender, unmount } = renderAuthProvider();
    await screen.findByText("status:authenticated");
    expect(useSpy).toHaveBeenCalledTimes(1);
    const interceptorId = useSpy.mock.results[0]?.value;

    rerender(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );
    expect(useSpy).toHaveBeenCalledTimes(1);

    unmount();
    expect(ejectSpy).toHaveBeenCalledWith(interceptorId);
  });
});
