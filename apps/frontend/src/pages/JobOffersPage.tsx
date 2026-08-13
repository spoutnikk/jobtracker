import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import { Link } from "react-router-dom";
import { getAllCompanies } from "../api/companies";
import {
  createJobOffer,
  deleteJobOffer,
  getJobOffers,
  updateJobOffer,
  type ContractType,
  type CreateJobOfferInput,
  type FindJobOffersParams,
  type JobOffer,
  type JobOfferSortBy,
  type JobOfferSortOrder,
  type UpdateJobOfferInput,
} from "../api/job-offers";

const contractTypeLabels: Record<ContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  INTERNSHIP: "Stage",
  FREELANCE: "Freelance",
  TEMPORARY: "Intérim",
  OTHER: "Autre",
};

const contractTypes = Object.keys(contractTypeLabels) as ContractType[];

function getInitialJobOfferFilters(): {
  search: string;
  companyId: string;
  contractType: ContractType | "";
} {
  const searchParams = new URLSearchParams(window.location.search);
  const search = searchParams.get("search")?.trim() ?? "";
  const companyIdParam = searchParams.get("companyId");
  const companyIdNumber = companyIdParam ? Number(companyIdParam) : NaN;
  const companyId =
    Number.isInteger(companyIdNumber) && companyIdNumber > 0
      ? String(companyIdNumber)
      : "";
  const contractTypeParam = searchParams.get("contractType");
  const contractType =
    contractTypeParam &&
    contractTypes.includes(contractTypeParam as ContractType)
      ? (contractTypeParam as ContractType)
      : "";

  return { search, companyId, contractType };
}

function replaceJobOfferFilterParams(
  updates: Partial<Record<"search" | "companyId" | "contractType", string>>,
) {
  const searchParams = new URLSearchParams(window.location.search);

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
  }

  const query = searchParams.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
}

function toDatetimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function JobOffersPage() {
  const queryClient = useQueryClient();
  const initialFilters = getInitialJobOfferFilters();

  const [filterSearchInput, setFilterSearchInput] = useState(
    initialFilters.search,
  );
  const [filterSearch, setFilterSearch] = useState(initialFilters.search);
  const [filterCompanyId, setFilterCompanyId] = useState(
    initialFilters.companyId,
  );
  const [filterContractType, setFilterContractType] = useState<
    ContractType | ""
  >(initialFilters.contractType);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<JobOfferSortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<JobOfferSortOrder>("desc");

  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [contractType, setContractType] = useState<ContractType | "">("");
  const [salary, setSalary] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingJobOfferId, setEditingJobOfferId] = useState<number | null>(
    null,
  );
  const [editTitle, setEditTitle] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editContractType, setEditContractType] = useState<ContractType | "">(
    "",
  );
  const [editSalary, setEditSalary] = useState("");
  const [editPublishedAt, setEditPublishedAt] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{
    jobOfferId: number;
    message: string;
  } | null>(null);

  const companiesQuery = useQuery({
    queryKey: ["companies", "all"],
    queryFn: getAllCompanies,
  });

  const jobOfferFilters: FindJobOffersParams = {
    search: filterSearch || undefined,
    companyId: filterCompanyId ? Number(filterCompanyId) : undefined,
    contractType: filterContractType || undefined,
    page,
    pageSize,
    sortBy,
    sortOrder,
  };
  const jobOffersQuery = useQuery({
    queryKey: ["job-offers", jobOfferFilters],
    queryFn: () => getJobOffers(jobOfferFilters),
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

  const updateJobOfferMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateJobOfferInput }) =>
      updateJobOffer(id, input),
    onMutate: () => {
      setEditError(null);
    },
    onSuccess: async () => {
      setEditingJobOfferId(null);
      setEditError(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["job-offers"] }),
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
      ]);
    },
    onError: async (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        setEditError(
          "Impossible de modifier cette offre car elle ou la société sélectionnée n'existe plus.",
        );

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["job-offers"] }),
          queryClient.invalidateQueries({ queryKey: ["companies"] }),
        ]);
        return;
      }

      setEditError("Impossible de modifier l'offre.");
    },
  });

  const deleteJobOfferMutation = useMutation({
    mutationFn: deleteJobOffer,
    onMutate: () => {
      setDeleteError(null);
    },
    onSuccess: async (_deletedJobOffer, jobOfferId) => {
      setDeleteError(null);
      setEditingJobOfferId((currentId) =>
        currentId === jobOfferId ? null : currentId,
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["job-offers"] }),
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
    },
    onError: async (error, jobOfferId) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setDeleteError({
          jobOfferId,
          message:
            "Cette offre ne peut pas être supprimée car elle est liée à une ou plusieurs candidatures.",
        });
        return;
      }

      if (axios.isAxiosError(error) && error.response?.status === 404) {
        setDeleteError({
          jobOfferId,
          message: "Cette offre n'existe plus.",
        });

        await queryClient.invalidateQueries({ queryKey: ["job-offers"] });
        return;
      }

      setDeleteError({
        jobOfferId,
        message: "Impossible de supprimer l'offre.",
      });
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

  function startEditing(jobOffer: JobOffer) {
    setEditingJobOfferId(jobOffer.id);
    setEditTitle(jobOffer.title);
    setEditCompanyId(String(jobOffer.companyId));
    setEditUrl(jobOffer.url ?? "");
    setEditDescription(jobOffer.description ?? "");
    setEditLocation(jobOffer.location ?? "");
    setEditContractType(jobOffer.contractType ?? "");
    setEditSalary(jobOffer.salary ?? "");
    setEditPublishedAt(toDatetimeLocal(jobOffer.publishedAt));
    setEditError(null);
  }

  function handleUpdate(
    event: React.FormEvent<HTMLFormElement>,
    jobOfferId: number,
  ) {
    event.preventDefault();

    const trimmedTitle = editTitle.trim();

    if (!trimmedTitle || !editCompanyId) {
      return;
    }

    const input: UpdateJobOfferInput = {
      title: trimmedTitle,
      companyId: Number(editCompanyId),
      url: editUrl || undefined,
      description: editDescription || undefined,
      location: editLocation || undefined,
      contractType: editContractType || undefined,
      salary: editSalary || undefined,
      publishedAt: editPublishedAt
        ? new Date(editPublishedAt).toISOString()
        : undefined,
    };

    updateJobOfferMutation.mutate({ id: jobOfferId, input });
  }

  function handleDelete(jobOffer: JobOffer) {
    const confirmed = window.confirm(`Supprimer l'offre "${jobOffer.title}" ?`);

    if (!confirmed) {
      return;
    }

    deleteJobOfferMutation.mutate(jobOffer.id);
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

        <CollapsibleSection title="Filtrer les offres" defaultOpen>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const nextSearch = filterSearchInput.trim();

              setFilterSearchInput(nextSearch);
              setFilterSearch(nextSearch);
              setPage(1);
              replaceJobOfferFilterParams({ search: nextSearch });
            }}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">
                  Recherche
                </span>
                <input
                  type="search"
                  value={filterSearchInput}
                  onChange={(event) => setFilterSearchInput(event.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">
                  Filtrer par société
                </span>
                <select
                  value={filterCompanyId}
                  onChange={(event) => {
                    const nextCompanyId = event.target.value;

                    setFilterCompanyId(nextCompanyId);
                    setPage(1);
                    replaceJobOfferFilterParams({ companyId: nextCompanyId });
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="">Toutes les sociétés</option>
                  {companiesQuery.data?.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">
                  Filtrer par contrat
                </span>
                <select
                  value={filterContractType}
                  onChange={(event) => {
                    const nextContractType = event.target.value as
                      ContractType | "";

                    setFilterContractType(nextContractType);
                    setPage(1);
                    replaceJobOfferFilterParams({
                      contractType: nextContractType,
                    });
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="">Tous les contrats</option>
                  {Object.entries(contractTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">
                  Trier par
                </span>
                <select
                  value={sortBy}
                  onChange={(event) => {
                    setSortBy(event.target.value as JobOfferSortBy);
                    setPage(1);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="title">Titre</option>
                  <option value="createdAt">Date de création</option>
                  <option value="publishedAt">Date de publication</option>
                  <option value="updatedAt">Date de modification</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Ordre</span>
                <select
                  value={sortOrder}
                  onChange={(event) => {
                    setSortOrder(event.target.value as JobOfferSortOrder);
                    setPage(1);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="desc">Décroissant</option>
                  <option value="asc">Croissant</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">
                  Par page
                </span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white"
              >
                Rechercher
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterSearchInput("");
                  setFilterSearch("");
                  setFilterCompanyId("");
                  setFilterContractType("");
                  replaceJobOfferFilterParams({
                    search: "",
                    companyId: "",
                    contractType: "",
                  });
                  setPage(1);
                  setPageSize(10);
                  setSortBy("createdAt");
                  setSortOrder("desc");
                }}
                className="rounded-md border border-gray-300 px-4 py-2 font-medium"
              >
                Réinitialiser
              </button>
            </div>
          </form>
        </CollapsibleSection>

        <CollapsibleSection title="Nouvelle offre" defaultOpen={false}>
          <form onSubmit={handleSubmit} className="mt-4">
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
                Vous devez d'abord créer une société avant de pouvoir ajouter
                une offre.
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
                <span className="text-sm font-medium text-gray-700">
                  Société
                </span>
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
                <span className="text-sm font-medium text-gray-700">
                  Salaire
                </span>
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
              {createJobOfferMutation.isPending
                ? "Création..."
                : "Créer l'offre"}
            </button>

            {createError && (
              <p className="mt-3 text-sm text-red-600">{createError}</p>
            )}
          </form>
        </CollapsibleSection>

        {editError && <p className="mt-4 text-sm text-red-600">{editError}</p>}

        <div className="mt-6 flex items-center justify-between text-sm text-gray-600">
          <p>{jobOffersQuery.data.total} offres</p>
          <p>
            Page {jobOffersQuery.data.page} sur {jobOffersQuery.data.totalPages}
          </p>
        </div>
        {jobOffersQuery.data.items.length === 0 ? (
          <p className="mt-6 text-gray-600">Aucune offre enregistrée.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {jobOffersQuery.data.items.map((jobOffer) => (
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

                {editingJobOfferId !== jobOffer.id && (
                  <div className="mt-4 flex gap-2">
                    <Link
                      to={`/applications?jobOfferId=${jobOffer.id}`}
                      className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                    >
                      Voir les candidatures
                    </Link>
                    <button
                      type="button"
                      onClick={() => startEditing(jobOffer)}
                      disabled={
                        updateJobOfferMutation.isPending ||
                        deleteJobOfferMutation.isPending
                      }
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Modifier
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(jobOffer)}
                      disabled={
                        updateJobOfferMutation.isPending ||
                        deleteJobOfferMutation.isPending
                      }
                      className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleteJobOfferMutation.isPending &&
                      deleteJobOfferMutation.variables === jobOffer.id
                        ? "Suppression..."
                        : "Supprimer"}
                    </button>
                  </div>
                )}

                {editingJobOfferId === jobOffer.id && (
                  <form
                    className="mt-4 space-y-4 rounded-md border border-gray-200 bg-gray-50 p-4"
                    onSubmit={(event) => handleUpdate(event, jobOffer.id)}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-700">
                          Titre
                        </span>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          required
                          className="rounded-md border border-gray-300 px-3 py-2"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-700">
                          Société
                        </span>
                        <select
                          value={editCompanyId}
                          onChange={(event) =>
                            setEditCompanyId(event.target.value)
                          }
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
                        <span className="text-sm font-medium text-gray-700">
                          URL
                        </span>
                        <input
                          type="url"
                          value={editUrl}
                          onChange={(event) => setEditUrl(event.target.value)}
                          className="rounded-md border border-gray-300 px-3 py-2"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-700">
                          Localisation
                        </span>
                        <input
                          type="text"
                          value={editLocation}
                          onChange={(event) =>
                            setEditLocation(event.target.value)
                          }
                          className="rounded-md border border-gray-300 px-3 py-2"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-700">
                          Type de contrat
                        </span>
                        <select
                          value={editContractType}
                          onChange={(event) =>
                            setEditContractType(
                              event.target.value as ContractType | "",
                            )
                          }
                          className="rounded-md border border-gray-300 px-3 py-2"
                        >
                          <option value="">Non renseigné</option>
                          {Object.entries(contractTypeLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-700">
                          Salaire
                        </span>
                        <input
                          type="text"
                          value={editSalary}
                          onChange={(event) =>
                            setEditSalary(event.target.value)
                          }
                          className="rounded-md border border-gray-300 px-3 py-2"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-700">
                          Date de publication
                        </span>
                        <input
                          type="datetime-local"
                          value={editPublishedAt}
                          onChange={(event) =>
                            setEditPublishedAt(event.target.value)
                          }
                          className="rounded-md border border-gray-300 px-3 py-2"
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-700">
                        Description
                      </span>
                      <textarea
                        value={editDescription}
                        onChange={(event) =>
                          setEditDescription(event.target.value)
                        }
                        rows={4}
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                    </label>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={
                          updateJobOfferMutation.isPending ||
                          !editTitle.trim() ||
                          !editCompanyId ||
                          creationUnavailable
                        }
                        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {updateJobOfferMutation.isPending
                          ? "Enregistrement..."
                          : "Enregistrer"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingJobOfferId(null);
                          setEditError(null);
                        }}
                        disabled={updateJobOfferMutation.isPending}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                )}

                {deleteError?.jobOfferId === jobOffer.id && (
                  <p className="mt-3 text-sm text-red-600">
                    {deleteError.message}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
            className="rounded-md border border-gray-300 px-4 py-2 disabled:opacity-50"
          >
            Précédent
          </button>
          <button
            type="button"
            disabled={
              jobOffersQuery.data.totalPages === 0 ||
              page >= jobOffersQuery.data.totalPages
            }
            onClick={() => setPage((current) => current + 1)}
            className="rounded-md border border-gray-300 px-4 py-2 disabled:opacity-50"
          >
            Suivant
          </button>
        </div>
      </div>
    </main>
  );
}

export default JobOffersPage;
