import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { getCompanies } from "../api/companies";
import {
  createJobOffer,
  getJobOffers,
  type ContractType,
  type CreateJobOfferInput,
} from "../api/job-offers";

const contractTypeLabels: Record<ContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  INTERNSHIP: "Stage",
  FREELANCE: "Freelance",
  TEMPORARY: "Intérim",
  OTHER: "Autre",
};

function JobOffersPage() {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [contractType, setContractType] = useState<ContractType | "">("");
  const [salary, setSalary] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const jobOffersQuery = useQuery({
    queryKey: ["job-offers"],
    queryFn: getJobOffers,
  });

  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: getCompanies,
  });

  const createJobOfferMutation = useMutation({
    mutationFn: createJobOffer,
    onMutate: () => {
      setCreateError(null);
    },
    onSuccess: async () => {
      setTitle("");
      setCompanyId("");
      setUrl("");
      setDescription("");
      setLocation("");
      setContractType("");
      setSalary("");
      setPublishedAt("");
      setCreateError(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["job-offers"] }),
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
    },
    onError: async (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        setCreateError(
          "La société sélectionnée n'existe plus. Actualisez la liste et choisissez une autre société.",
        );

        await queryClient.invalidateQueries({ queryKey: ["companies"] });
        return;
      }

      setCreateError("Impossible de créer l'offre.");
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle || !companyId) {
      return;
    }

    const input: CreateJobOfferInput = {
      title: trimmedTitle,
      companyId: Number(companyId),
      url: url || undefined,
      description: description || undefined,
      location: location || undefined,
      contractType: contractType || undefined,
      salary: salary || undefined,
      publishedAt: publishedAt
        ? new Date(publishedAt).toISOString()
        : undefined,
    };

    createJobOfferMutation.mutate(input);
  }

  if (jobOffersQuery.isPending) {
    return (
      <main className="min-h-screen p-8">
        <p>Chargement des offres d’emploi...</p>
      </main>
    );
  }

  if (jobOffersQuery.isError) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-red-600">Impossible de charger les offres.</p>
      </main>
    );
  }

  const creationUnavailable =
    companiesQuery.isPending ||
    companiesQuery.isError ||
    companiesQuery.data.length === 0;

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Offres d’emploi</h1>

        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Nouvelle offre</h2>

          {companiesQuery.isPending && (
            <p className="mt-4 text-sm text-gray-600">
              Chargement des sociétés...
            </p>
          )}

          {companiesQuery.isError && (
            <p className="mt-4 text-sm text-red-600">
              Impossible de charger les sociétés. La création d'une offre est
              indisponible.
            </p>
          )}

          {companiesQuery.isSuccess && companiesQuery.data.length === 0 && (
            <p className="mt-4 text-sm text-gray-600">
              Vous devez d'abord créer une société avant de pouvoir ajouter une
              offre.
            </p>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Titre</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Société</span>
              <select
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                required
                disabled={creationUnavailable}
                className="rounded-md border border-gray-300 px-3 py-2 disabled:opacity-50"
              >
                <option value="">Sélectionner une société</option>
                {companiesQuery.data?.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">URL</span>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Localisation
              </span>
              <input
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Type de contrat
              </span>
              <select
                value={contractType}
                onChange={(event) =>
                  setContractType(event.target.value as ContractType | "")
                }
                className="rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="">Non renseigné</option>
                {Object.entries(contractTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Salaire</span>
              <input
                type="text"
                value={salary}
                onChange={(event) => setSalary(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Date de publication
              </span>
              <input
                type="datetime-local"
                value={publishedAt}
                onChange={(event) => setPublishedAt(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={
              createJobOfferMutation.isPending ||
              !title.trim() ||
              !companyId ||
              creationUnavailable
            }
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {createJobOfferMutation.isPending ? "Création..." : "Créer l'offre"}
          </button>

          {createError && (
            <p className="mt-3 text-sm text-red-600">{createError}</p>
          )}
        </form>

        {jobOffersQuery.data.length === 0 ? (
          <p className="mt-6 text-gray-600">Aucune offre enregistrée.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {jobOffersQuery.data.map((jobOffer) => (
              <article
                key={jobOffer.id}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
              >
                <h2 className="text-xl font-semibold">{jobOffer.title}</h2>
                <p className="mt-1 text-gray-600">{jobOffer.company.name}</p>

                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  {jobOffer.location && (
                    <p>Localisation : {jobOffer.location}</p>
                  )}

                  {jobOffer.contractType && (
                    <p>Contrat : {contractTypeLabels[jobOffer.contractType]}</p>
                  )}

                  {jobOffer.salary && <p>Salaire : {jobOffer.salary}</p>}

                  {jobOffer.publishedAt && (
                    <p>
                      Publication :{" "}
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "long",
                        timeStyle: "short",
                      }).format(new Date(jobOffer.publishedAt))}
                    </p>
                  )}

                  {jobOffer.url && (
                    <p>
                      Lien :{" "}
                      <a
                        href={jobOffer.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {jobOffer.url}
                      </a>
                    </p>
                  )}
                </div>

                {jobOffer.description && (
                  <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">
                    {jobOffer.description}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default JobOffersPage;
