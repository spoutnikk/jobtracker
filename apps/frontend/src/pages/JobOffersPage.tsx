import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import { Link, useSearchParams } from "react-router-dom";
import { getAllCompanies } from "../api/companies";
import { hasHttpStatus } from "../api/http-error";
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
import PageShell from "../components/PageShell";
import LoadingMessage from "../components/LoadingMessage";
import PageLoadingState from "../components/PageLoadingState";
import Pagination from "../components/Pagination";
import StatusMessage from "../components/StatusMessage";
import { confirmDialog } from "../components/confirm-dialog";
import { formControlClassName } from "../components/form-control";

const contractTypeLabels: Record<ContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  INTERNSHIP: "Stage",
  FREELANCE: "Freelance",
  TEMPORARY: "Intérim",
  OTHER: "Autre",
};

const contractTypes = Object.keys(contractTypeLabels) as ContractType[];

function parsePositiveInteger(value: string | null) {
  if (!value) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function parseContractType(value: string | null): ContractType | "" {
  return value && contractTypes.includes(value as ContractType)
    ? (value as ContractType)
    : "";
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
  const [searchParams, setSearchParams] = useSearchParams();

  const filterSearch = searchParams.get("search")?.trim() ?? "";
  const filterCompanyId = parsePositiveInteger(searchParams.get("companyId"));
  const filterContractType = parseContractType(
    searchParams.get("contractType"),
  );
  const [filterSearchDraft, setFilterSearchDraft] = useState(() => ({
    base: filterSearch,
    value: filterSearch,
  }));
  const filterSearchInput =
    filterSearchDraft.base === filterSearch
      ? filterSearchDraft.value
      : filterSearch;
  const filterKey = `${filterSearch}\u0000${filterCompanyId ?? ""}\u0000${filterContractType}`;

  const [pageState, setPageState] = useState({
    filterKey,
    page: 1,
  });

  const page = pageState.filterKey === filterKey ? pageState.page : 1;

  function setPage(nextPage: number | ((currentPage: number) => number)) {
    setPageState((currentState) => {
      const currentPage =
        currentState.filterKey === filterKey ? currentState.page : 1;

      return {
        filterKey,
        page: typeof nextPage === "function" ? nextPage(currentPage) : nextPage,
      };
    });
  }

  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<JobOfferSortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<JobOfferSortOrder>("desc");

  function replaceJobOfferFilterParams(
    updates: Partial<Record<"search" | "companyId" | "contractType", string>>,
  ) {
    setSearchParams(
      (currentSearchParams) => {
        const nextSearchParams = new URLSearchParams(currentSearchParams);

        for (const [key, value] of Object.entries(updates)) {
          if (value) {
            nextSearchParams.set(key, value);
          } else {
            nextSearchParams.delete(key);
          }
        }

        return nextSearchParams;
      },
      { replace: true },
    );
  }

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: ["companies", "all"],
    queryFn: getAllCompanies,
  });

  const jobOfferFilters: FindJobOffersParams = {
    search: filterSearch || undefined,
    companyId: filterCompanyId ?? undefined,
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
      setSuccessMessage(null);
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
      setSuccessMessage("Offre créée avec succès.");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["job-offers"] }),
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
    },
    onError: async (error) => {
      if (hasHttpStatus(error, 404)) {
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
      setSuccessMessage(null);
    },
    onSuccess: async () => {
      setEditingJobOfferId(null);
      setEditError(null);
      setSuccessMessage("Offre modifiée avec succès.");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["job-offers"] }),
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
      ]);
    },
    onError: async (error) => {
      if (hasHttpStatus(error, 404)) {
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
      setSuccessMessage(null);
    },
    onSuccess: async (_deletedJobOffer, jobOfferId) => {
      setDeleteError(null);
      setSuccessMessage("Offre supprimée avec succès.");
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
      if (hasHttpStatus(error, 409)) {
        setDeleteError({
          jobOfferId,
          message:
            "Cette offre ne peut pas être supprimée car elle est liée à une ou plusieurs candidatures.",
        });
        return;
      }

      if (hasHttpStatus(error, 404)) {
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

  async function handleDelete(jobOffer: JobOffer) {
    const confirmed = await confirmDialog(
      `Supprimer l'offre "${jobOffer.title}" ?`,
    );

    if (!confirmed) {
      return;
    }

    deleteJobOfferMutation.mutate(jobOffer.id);
  }

  if (jobOffersQuery.isPending) {
    return (
      <PageLoadingState>Chargement des offres d’emploi...</PageLoadingState>
    );
  }

  if (jobOffersQuery.isError) {
    return (
      <PageShell>
        <StatusMessage variant="error">
          Impossible de charger les offres.
        </StatusMessage>
      </PageShell>
    );
  }

  const creationUnavailable =
    companiesQuery.isPending ||
    companiesQuery.isError ||
    companiesQuery.data.length === 0;

  return (
    <PageShell>
      <h1 className="text-3xl font-bold">Offres d’emploi</h1>
      {successMessage && (
        <StatusMessage variant="success" className="mt-4">
          {successMessage}
        </StatusMessage>
      )}

      <CollapsibleSection title="Filtrer les offres" defaultOpen>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const nextSearch = filterSearchInput.trim();

            setFilterSearchDraft({
              base: nextSearch,
              value: nextSearch,
            });
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
                onChange={(event) =>
                  setFilterSearchDraft({
                    base: filterSearch,
                    value: event.target.value,
                  })
                }
                className={formControlClassName}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Filtrer par société
              </span>
              <select
                value={filterCompanyId ?? ""}
                onChange={(event) => {
                  const nextCompanyId = event.target.value;

                  setPage(1);
                  replaceJobOfferFilterParams({ companyId: nextCompanyId });
                }}
                className={formControlClassName}
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

                  setPage(1);
                  replaceJobOfferFilterParams({
                    contractType: nextContractType,
                  });
                }}
                className={formControlClassName}
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
                className={formControlClassName}
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
                className={formControlClassName}
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
                className={formControlClassName}
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
                setFilterSearchDraft({ base: "", value: "" });
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
            <LoadingMessage className="mt-4 text-sm text-gray-600">
              Chargement des sociétés...
            </LoadingMessage>
          )}

          {companiesQuery.isError && (
            <StatusMessage variant="error" className="mt-4">
              Impossible de charger les sociétés. La création d'une offre est
              indisponible.
            </StatusMessage>
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
                className={formControlClassName}
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
                className={formControlClassName}
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
                className={formControlClassName}
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
                className={formControlClassName}
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
                className={formControlClassName}
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
                className={formControlClassName}
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
              className={formControlClassName}
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
            <StatusMessage variant="error" className="mt-3">
              {createError}
            </StatusMessage>
          )}
        </form>
      </CollapsibleSection>

      {editError && (
        <StatusMessage variant="error" className="mt-4">
          {editError}
        </StatusMessage>
      )}

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
                {jobOffer.location && <p>Localisation : {jobOffer.location}</p>}

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
                        className={formControlClassName}
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
                        className={formControlClassName}
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
                        className={formControlClassName}
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
                        className={formControlClassName}
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
                        onChange={(event) => setEditSalary(event.target.value)}
                        className={formControlClassName}
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
                        className={formControlClassName}
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
                      className={formControlClassName}
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
                <StatusMessage variant="error" className="mt-3">
                  {deleteError.message}
                </StatusMessage>
              )}
            </article>
          ))}
        </div>
      )}
      <Pagination
        page={jobOffersQuery.data.page}
        totalPages={jobOffersQuery.data.totalPages}
        totalLabel={`${jobOffersQuery.data.total} offres`}
        onPageChange={setPage}
      />
    </PageShell>
  );
}

export default JobOffersPage;
