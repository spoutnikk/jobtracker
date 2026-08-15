import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import {
  changePassword,
  updateProfile,
  type AuthenticatedUser,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from "../api/auth";
import { authMeQueryKey } from "../auth/auth-cache";
import { useAuth } from "../auth/useAuth";
import PageShell from "../components/PageShell";
import StatusMessage from "../components/StatusMessage";

function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return <ProfileForm key={user.id} user={user} />;
}

function ProfileForm({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [passwordLocalError, setPasswordLocalError] = useState<string | null>(
    null,
  );

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updatedUser) => {
      setFirstName(updatedUser.firstName);
      setLastName(updatedUser.lastName);
      setEmail(updatedUser.email);
      queryClient.setQueryData(authMeQueryKey, updatedUser);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirmation("");
      setPasswordLocalError(null);
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: UpdateProfileInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    };

    updateMutation.mutate(input);
  }

  function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < 12) {
      setPasswordLocalError(
        "Le nouveau mot de passe doit contenir au moins 12 caractères.",
      );
      return;
    }

    if (newPassword !== newPasswordConfirmation) {
      setPasswordLocalError("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }

    setPasswordLocalError(null);

    const input: ChangePasswordInput = {
      currentPassword,
      newPassword,
    };

    changePasswordMutation.mutate(input);
  }

  const errorMessage =
    updateMutation.isError &&
    axios.isAxiosError(updateMutation.error) &&
    updateMutation.error.response?.status === 409
      ? "Un compte existe déjà avec cette adresse email."
      : updateMutation.isError
        ? "Impossible de mettre à jour le profil."
        : null;

  const passwordRemoteError =
    changePasswordMutation.isError &&
    axios.isAxiosError(changePasswordMutation.error) &&
    changePasswordMutation.error.response?.status === 401
      ? "Mot de passe actuel incorrect."
      : changePasswordMutation.isError
        ? "Impossible de modifier le mot de passe."
        : null;
  const passwordErrorMessage = passwordLocalError ?? passwordRemoteError;

  return (
    <PageShell>
      <h1 className="text-3xl font-bold">Profil</h1>

      {updateMutation.isSuccess && (
        <StatusMessage variant="success" className="mt-4">
          Profil mis à jour.
        </StatusMessage>
      )}

      {errorMessage && (
        <StatusMessage variant="error" className="mt-4">
          {errorMessage}
        </StatusMessage>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
      >
        <label className="flex flex-col gap-1">
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
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {updateMutation.isPending
            ? "Enregistrement..."
            : "Enregistrer les modifications"}
        </button>
      </form>

      <section className="mt-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Modifier mon mot de passe</h2>

        {changePasswordMutation.isSuccess && (
          <StatusMessage variant="success" className="mt-4">
            Mot de passe mis à jour.
          </StatusMessage>
        )}

        {passwordErrorMessage && (
          <StatusMessage variant="error" className="mt-4">
            {passwordErrorMessage}
          </StatusMessage>
        )}

        <form onSubmit={handlePasswordSubmit} className="mt-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Mot de passe actuel
            </span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Nouveau mot de passe
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>

          <p className="mt-1 text-xs text-gray-500">12 caractères minimum.</p>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Confirmer le nouveau mot de passe
            </span>
            <input
              type="password"
              value={newPasswordConfirmation}
              onChange={(event) =>
                setNewPasswordConfirmation(event.target.value)
              }
              required
              minLength={12}
              autoComplete="new-password"
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="mt-6 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {changePasswordMutation.isPending
              ? "Modification..."
              : "Modifier le mot de passe"}
          </button>
        </form>
      </section>
    </PageShell>
  );
}

export default ProfilePage;
