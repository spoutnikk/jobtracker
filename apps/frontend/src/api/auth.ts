import { apiClient } from "./client";

export interface AuthenticatedUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function login(input: LoginInput): Promise<AuthenticatedUser> {
  const response = await apiClient.post<AuthenticatedUser>(
    "/auth/login",
    input,
  );

  return response.data;
}

export async function me(): Promise<AuthenticatedUser> {
  const response = await apiClient.get<AuthenticatedUser>("/auth/me");

  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
}
