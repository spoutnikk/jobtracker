import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { me, type AuthenticatedUser } from "../api/auth";
import { apiClient } from "../api/client";
import { hasHttpStatus } from "../api/http-error";
import { authMeQueryKey, setAnonymousAuthState } from "./auth-cache";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./useAuth";

function isLocallyHandledAuthRequest(url: string | undefined): boolean {
  return (
    url === "/auth/login" ||
    url === "/auth/register" ||
    url === "/auth/me" ||
    url === "/auth/logout"
  );
}

async function restoreAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    return await me();
  } catch (error: unknown) {
    if (hasHttpStatus(error, 401)) {
      return null;
    }

    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const authQuery = useQuery({
    queryKey: authMeQueryKey,
    queryFn: restoreAuthenticatedUser,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    const interceptorId = apiClient.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        const requestUrl =
          typeof error === "object" &&
          error !== null &&
          "config" in error &&
          typeof error.config === "object" &&
          error.config !== null &&
          "url" in error.config &&
          typeof error.config.url === "string"
            ? error.config.url
            : undefined;

        if (
          hasHttpStatus(error, 401) &&
          !isLocallyHandledAuthRequest(requestUrl)
        ) {
          setAnonymousAuthState(queryClient);
        }

        return Promise.reject(error);
      },
    );

    return () => {
      apiClient.interceptors.response.eject(interceptorId);
    };
  }, [queryClient]);

  let status: AuthStatus;
  let user: AuthenticatedUser | null = null;

  if (authQuery.isPending) {
    status = "initializing";
  } else if (authQuery.isError) {
    status = "error";
  } else if (authQuery.data === null) {
    status = "anonymous";
  } else {
    status = "authenticated";
    user = authQuery.data;
  }

  const value: AuthContextValue = {
    status,
    user,
    retryInitialization: () => {
      void authQuery.refetch();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
