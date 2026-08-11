import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, type ReactNode } from "react";
import { me, type AuthenticatedUser } from "../api/auth";
import { apiClient } from "../api/client";
import { authMeQueryKey, setAnonymousAuthState } from "./auth-cache";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./useAuth";

function isLocallyHandledAuthRequest(url: string | undefined): boolean {
  return url === "/auth/login" || url === "/auth/me" || url === "/auth/logout";
}

async function restoreAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    return await me();
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
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
        if (
          axios.isAxiosError(error) &&
          error.response?.status === 401 &&
          !isLocallyHandledAuthRequest(error.config?.url)
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
