import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  changePassword,
  deleteAccount,
  revokeOtherSessions,
  updateProfile,
  type AuthenticatedUser,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type UpdateProfileInput,
} from "../api/auth";
import { hasHttpStatus } from "../api/http-error";
import { authMeQueryKey, setAnonymousAuthState } from "../auth/auth-cache";
import { useAuth } from "../auth/useAuth";
import PageShell from "../components/PageShell";
import StatusMessage from "../components/StatusMessage";
import { confirmDialog } from "../components/confirm-dialog";

function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return <ProfileForm key={user.id} user={user} />;
}

function ProfileForm({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [passwordLocalError, setPasswordLocalError] = useState<string | null>(
    null,
  );
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");

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

  const revokeOtherSessionsMutation = useMutation({
    mutationFn: revokeOtherSessions,
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      setAnonymousAuthState(queryClient);
      void navigate("/login", { replace: true });
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

  async function handleRevokeOtherSessions() {
    const confirmed = await confirmDialog(
      "Déconnecter tous les autres appareils ? Votre session actuelle restera active.",
      { confirmLabel: "Déconnecter" },
    );

    if (!confirmed) {
      return;
    }

    revokeOtherSessionsMutation.mutate();
  }

  async function handleDeleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const confirmed = await confirmDialog(
      "Supprimer définitivement votre compte et toutes vos données ? Cette action est irréversible.",
      { confirmLabel: "Supprimer définitivement" },
    );

    if (!confirmed) {
      return;
    }

    const input: DeleteAccountInput = {
      password: deleteAccountPassword,
    };

    deleteAccountMutation.mutate(input);
  }

  const errorMessage =
    updateMutation.isError && hasHttpStatus(updateMutation.error, 409)
      ? "Un compte existe déjà avec cette adresse email."
      : updateMutation.isError
        ? "Impossible de mettre à jour le profil."
        : null;

  const passwordRemoteError =
    changePasswordMutation.isError &&
    hasHttpStatus(changePasswordMutation.error, 401)
      ? "Mot de passe actuel incorrect."
      : changePasswordMutation.isError
        ? "Impossible de modifier le mot de passe."
        : null;
  const passwordErrorMessage = passwordLocalError ?? passwordRemoteError;

  const deleteAccountError =
    deleteAccountMutation.isError &&
    hasHttpStatus(deleteAccountMutation.error, 401)
      ? "Mot de passe actuel incorrect."
      : deleteAccountMutation.isError
        ? "Impossible de supprimer le compte."
        : null;

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

      <section className="mt-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Sessions</h2>
        <p className="mt-2 text-sm text-gray-600">
          Déconnectez tous les autres appareils sur lesquels votre compte est
          actuellement connecté. Votre session actuelle restera active.
        </p>

        {revokeOtherSessionsMutation.isSuccess && (
          <StatusMessage variant="success" className="mt-4">
            Les autres appareils ont été déconnectés.
          </StatusMessage>
        )}

        {revokeOtherSessionsMutation.isError && (
          <StatusMessage variant="error" className="mt-4">
            Impossible de déconnecter les autres appareils.
          </StatusMessage>
        )}

        <button
          type="button"
          onClick={handleRevokeOtherSessions}
          disabled={revokeOtherSessionsMutation.isPending}
          className="mt-4 rounded-md border border-red-300 px-4 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {revokeOtherSessionsMutation.isPending
            ? "Déconnexion..."
            : "Déconnecter les autres appareils"}
        </button>
      </section>

      <section className="mt-8 rounded-lg border border-red-200 bg-red-50 p-5">
        <h2 className="text-xl font-semibold text-red-800">
          Supprimer mon compte
        </h2>

        <p className="mt-2 text-sm text-red-700">
          Cette action est irréversible. Toutes vos candidatures, entreprises,
          offres, documents et sessions seront supprimés.
        </p>

        {deleteAccountError && (
          <StatusMessage variant="error" className="mt-4">
            {deleteAccountError}
          </StatusMessage>
        )}

        <form onSubmit={handleDeleteAccount} className="mt-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-red-800">
              Mot de passe actuel
            </span>
            <input
              type="password"
              value={deleteAccountPassword}
              onChange={(event) => setDeleteAccountPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="rounded-md border border-red-300 bg-white px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={deleteAccountMutation.isPending}
            className="mt-4 rounded-md bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {deleteAccountMutation.isPending
              ? "Suppression..."
              : "Supprimer mon compte"}
          </button>
        </form>
      </section>
    </PageShell>
  );
}

export default ProfilePage;
