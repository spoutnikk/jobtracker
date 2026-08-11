import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { ReactNode } from "react";
import { me, type AuthenticatedUser } from "../api/auth";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./useAuth";

const authMeQueryKey = ["auth", "me"] as const;

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
  const authQuery = useQuery({
    queryKey: authMeQueryKey,
    queryFn: restoreAuthenticatedUser,
    retry: false,
    staleTime: Infinity,
  });

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
