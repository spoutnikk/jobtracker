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

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  firstName: string;
  lastName: string;
  email: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface DeleteAccountInput {
  password: string;
}

export async function deleteAccount(input: DeleteAccountInput): Promise<void> {
  await apiClient.delete("/auth/me", {
    data: input,
  });
}

export async function changePassword(
  input: ChangePasswordInput,
): Promise<void> {
  await apiClient.patch("/auth/me/password", input);
}

export async function revokeOtherSessions(): Promise<void> {
  await apiClient.post("/auth/sessions/others");
}

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<AuthenticatedUser> {
  const response = await apiClient.patch<AuthenticatedUser>("/auth/me", input);

  return response.data;
}

export async function register(
  input: RegisterInput,
): Promise<AuthenticatedUser> {
  const response = await apiClient.post<AuthenticatedUser>(
    "/auth/register",
    input,
  );

  return response.data;
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
