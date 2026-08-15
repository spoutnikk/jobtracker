import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import {
  updateProfile,
  type AuthenticatedUser,
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

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updatedUser) => {
      setFirstName(updatedUser.firstName);
      setLastName(updatedUser.lastName);
      setEmail(updatedUser.email);
      queryClient.setQueryData(authMeQueryKey, updatedUser);
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

  const errorMessage =
    updateMutation.isError &&
    axios.isAxiosError(updateMutation.error) &&
    updateMutation.error.response?.status === 409
      ? "Un compte existe déjà avec cette adresse email."
      : updateMutation.isError
        ? "Impossible de mettre à jour le profil."
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
    </PageShell>
  );
}

export default ProfilePage;
