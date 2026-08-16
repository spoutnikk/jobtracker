import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import { hasHttpStatus } from "../api/http-error";
import { authMeQueryKey, clearSensitiveQueries } from "../auth/auth-cache";

function RegisterPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      setPassword("");
      setPasswordConfirmation("");
      clearSensitiveQueries(queryClient);
      queryClient.setQueryData(authMeQueryKey, user);
      navigate("/dashboard", { replace: true });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 12) {
      setLocalError("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }

    if (password !== passwordConfirmation) {
      setLocalError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLocalError(null);
    registerMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
    });
  }

  const remoteError =
    registerMutation.isError && hasHttpStatus(registerMutation.error, 409)
      ? "Un compte existe déjà avec cette adresse email."
      : registerMutation.isError
        ? "Impossible de créer le compte."
        : null;
  const errorMessage = localError ?? remoteError;
  const passwordConfirmationInvalid =
    localError === "Les mots de passe ne correspondent pas.";
  const emailRemoteInvalid =
    registerMutation.isError && hasHttpStatus(registerMutation.error, 409);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-3xl font-bold">Créer un compte</h1>

        <label className="mt-6 flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Prénom</span>
          <input
            type="text"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
            autoComplete="given-name"
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Nom</span>
          <input
            type="text"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
            autoComplete="family-name"
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            aria-invalid={emailRemoteInvalid || undefined}
            aria-describedby={emailRemoteInvalid ? "register-error" : undefined}
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
            minLength={12}
            autoComplete="new-password"
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <p className="mt-1 text-xs text-gray-500">12 caractères minimum.</p>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">
            Confirmer le mot de passe
          </span>
          <input
            type="password"
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
            aria-invalid={passwordConfirmationInvalid || undefined}
            aria-describedby={
              passwordConfirmationInvalid ? "register-error" : undefined
            }
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {registerMutation.isPending
            ? "Création du compte..."
            : "Créer mon compte"}
        </button>

        {errorMessage && (
          <p
            id="register-error"
            role="alert"
            className="mt-4 text-sm text-red-600"
          >
            {errorMessage}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-gray-600">
          Déjà un compte ?{" "}
          <Link
            to="/login"
            className="font-medium text-blue-700 hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </form>
    </main>
  );
}

export default RegisterPage;
