import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login } from "../api/auth";

interface RedirectLocation {
  pathname: string;
  search?: string;
  hash?: string;
}

function getRedirectPath(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) {
    return "/dashboard";
  }

  const from = (state as Record<string, unknown>).from;

  if (typeof from !== "object" || from === null || !("pathname" in from)) {
    return "/dashboard";
  }

  const { pathname, search, hash } = from as RedirectLocation;

  if (
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname === "/login"
  ) {
    return "/dashboard";
  }

  return `${pathname}${typeof search === "string" ? search : ""}${typeof hash === "string" ? hash : ""}`;
}

function LoginPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      setPassword("");
      queryClient.removeQueries({
        predicate: (query) =>
          !(
            query.queryKey.length === 2 &&
            query.queryKey[0] === "auth" &&
            query.queryKey[1] === "me"
          ),
      });
      queryClient.setQueryData(["auth", "me"], user);
      navigate(getRedirectPath(location.state), { replace: true });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    loginMutation.mutate({
      email: email.trim(),
      password,
    });
  }

  const errorMessage =
    loginMutation.isError &&
    axios.isAxiosError(loginMutation.error) &&
    loginMutation.error.response?.status === 401
      ? "Email ou mot de passe incorrect."
      : loginMutation.isError
        ? "Impossible de se connecter."
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-3xl font-bold">Connexion</h1>

        <label className="mt-6 flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">
            Mot de passe
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loginMutation.isPending ? "Connexion..." : "Connexion"}
        </button>

        {errorMessage && (
          <p className="mt-4 text-sm text-red-600">{errorMessage}</p>
        )}
      </form>
    </main>
  );
}

export default LoginPage;
