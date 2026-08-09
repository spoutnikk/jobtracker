import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createApplication,
  getApplications,
  type ApplicationStatus,
} from "../api/applications";
import { getJobOffers } from "../api/job-offers";
import { useState } from "react";

function ApplicationsPage() {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<ApplicationStatus>("DRAFT");
  const [source, setSource] = useState("");

  const [jobOfferId, setJobOfferId] = useState<number | null>(null);

  const jobOffersQuery = useQuery({
    queryKey: ["job-offers"],
    queryFn: getJobOffers,
  });

  const createApplicationMutation = useMutation({
    mutationFn: createApplication,
    onSuccess: async () => {
      setStatus("DRAFT");
      setSource("");

      await queryClient.invalidateQueries({
        queryKey: ["applications"],
      });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (jobOfferId === null) {
      return;
    }

    createApplicationMutation.mutate({
      userId: 1,
      jobOfferId,
      status,
      source: source || undefined,
    });
  }

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: getApplications,
  });

  if (applicationsQuery.isPending) {
    return (
      <main className="min-h-screen p-8">
        <p>Chargement des candidatures...</p>
      </main>
    );
  }

  if (applicationsQuery.isError) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-red-600">Impossible de charger les candidatures.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Candidatures</h1>
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Nouvelle candidature</h2>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Offre d'emploi
            </span>

            <select
              value={jobOfferId ?? ""}
              onChange={(event) =>
                setJobOfferId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              className="rounded-md border border-gray-300 px-3 py-2"
              required
            >
              <option value="">Sélectionner une offre</option>

              {jobOffersQuery.data?.map((jobOffer) => (
                <option key={jobOffer.id} value={jobOffer.id}>
                  {jobOffer.title} — {jobOffer.company.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Statut</span>

              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ApplicationStatus)
                }
                className="rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="DRAFT">À préparer</option>
                <option value="APPLIED">Envoyée</option>
                <option value="FOLLOW_UP">Relance</option>
                <option value="INTERVIEW">Entretien</option>
                <option value="ACCEPTED">Acceptée</option>
                <option value="REJECTED">Refusée</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Source</span>

              <input
                type="text"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="France Travail, LinkedIn..."
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={createApplicationMutation.isPending}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {createApplicationMutation.isPending
              ? "Création..."
              : "Créer la candidature"}
          </button>

          {createApplicationMutation.isError && (
            <p className="mt-3 text-sm text-red-600">
              Impossible de créer la candidature.
            </p>
          )}
        </form>
        {applicationsQuery.data.length === 0 ? (
          <p className="mt-6 text-gray-600">Aucune candidature enregistrée.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {applicationsQuery.data.map((application) => (
              <article
                key={application.id}
                className="rounded-lg border border-gray-200 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {application.jobOffer.title}
                    </h2>

                    <p className="mt-1 text-gray-600">
                      {application.jobOffer.company.name}
                    </p>
                  </div>

                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">
                    {application.status}
                  </span>
                </div>

                <div className="mt-4 space-y-1 text-sm text-gray-600">
                  {application.jobOffer.location && (
                    <p>Localisation : {application.jobOffer.location}</p>
                  )}

                  {application.jobOffer.contractType && (
                    <p>Contrat : {application.jobOffer.contractType}</p>
                  )}

                  {application.source && <p>Source : {application.source}</p>}

                  {application.contactName && (
                    <p>Contact : {application.contactName}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default ApplicationsPage;
