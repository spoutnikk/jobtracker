import axios from "axios";

export const DEFAULT_API_BASE_URL = "http://localhost:3000";

export function resolveApiBaseUrl(value: string | undefined): string {
  const normalizedValue = value?.trim().replace(/\/+$/, "");

  return normalizedValue || DEFAULT_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});
