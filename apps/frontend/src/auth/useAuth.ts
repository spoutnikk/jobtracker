import { createContext, useContext } from "react";
import type { AuthenticatedUser } from "../api/auth";

export type AuthStatus =
  "initializing" | "authenticated" | "anonymous" | "error";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  retryInitialization: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
