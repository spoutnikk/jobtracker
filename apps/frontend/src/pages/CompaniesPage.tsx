import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompany,
  getCompanies,
  updateCompany,
  deleteCompany,
  type CompanyFilters,
  type CompanySortBy,
  type CompanySortOrder,
} from "../api/companies";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CollapsibleSection from "../components/CollapsibleSection";
import PageShell from "../components/PageShell";
import PageLoadingState from "../components/PageLoadingState";
import Pagination from "../components/Pagination";
import StatusMessage from "../components/StatusMessage";

function CompaniesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search")?.trim() ?? "";
  const pageParam = Number(searchParams.get("page"));
  const pageSizeParam = Number(searchParams.get("pageSize"));
  const sortByParam = searchParams.get("sortBy");
  const sortOrderParam = searchParams.get("sortOrder");

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const pageSize =
    pageSizeParam === 20 || pageSizeParam === 50 ? pageSizeParam : 10;
  const sortBy: CompanySortBy =
    sortByParam === "name" ||
    sortByParam === "updatedAt" ||
    sortByParam === "createdAt"
      ? sortByParam
      : "createdAt";
  const sortOrder: CompanySortOrder =
    sortOrderParam === "asc" || sortOrderParam === "desc"
      ? sortOrderParam
      : "desc";

  const [searchDraft, setSearchDraft] = useState(() => ({
    base: search,
    value: search,
  }));
  const searchInput = searchDraft.base === search ? searchDraft.value : search;

  function replaceCompanyParams(
    updates: Partial<
      Record<"search" | "page" | "pageSize" | "sortBy" | "sortOrder", string>
    >,
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

  function setPage(nextPage: number | ((currentPage: number) => number)) {
    const resolvedPage =
      typeof nextPage === "function" ? nextPage(page) : nextPage;

    replaceCompanyParams({
      page: resolvedPage <= 1 ? "" : String(resolvedPage),
    });
  }

  const companyFilters: CompanyFilters = {
    search: search || undefined,
    page,
    pageSize,
    sortBy,
    sortOrder,
  };
  const companiesQuery = useQuery({
    queryKey: ["companies", companyFilters],
    queryFn: () => getCompanies(companyFilters),
  });
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("");

  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editCity, setEditCity] = useState("");

  const [deleteErrorCompanyId, setDeleteErrorCompanyId] = useState<
    number | null
  >(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createCompanyMutation = useMutation({
    mutationFn: createCompany,
    onMutate: () => setSuccessMessage(null),
    onSuccess: async () => {
      setName("");
      setWebsite("");
      setCity("");
      setSuccessMessage("Entreprise créée avec succès.");

      await queryClient.invalidateQueries({
        queryKey: ["companies"],
      });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: {
        name?: string;
        website?: string;
        city?: string;
      };
    }) => updateCompany(id, input),
    onMutate: () => setSuccessMessage(null),
    onSuccess: async () => {
      setEditingCompanyId(null);
      setSuccessMessage("Entreprise modifiée avec succès.");

      await queryClient.invalidateQueries({
        queryKey: ["companies"],
      });
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: deleteCompany,
    onMutate: () => setSuccessMessage(null),

    onSuccess: async () => {
      setDeleteErrorCompanyId(null);
      setSuccessMessage("Entreprise supprimée avec succès.");

      await queryClient.invalidateQueries({
        queryKey: ["companies"],
      });
    },

    onError: (_error, companyId) => {
      setDeleteErrorCompanyId(companyId);
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    createCompanyMutation.mutate({
      name,
      website: website || undefined,
      city: city || undefined,
    });
  }

  if (companiesQuery.isPending) {
    return <PageLoadingState>Chargement des entreprises...</PageLoadingState>;
  }

  if (companiesQuery.isError) {
    return (
      <PageShell>
        <StatusMessage variant="error">
          Impossible de charger les entreprises.
        </StatusMessage>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1 className="text-3xl font-bold">Entreprises</h1>
      {successMessage && (
        <StatusMessage variant="success" className="mt-4">
          {successMessage}
        </StatusMessage>
      )}
      <CollapsibleSection title="Filtrer les entreprises" defaultOpen>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const nextSearch = searchInput.trim();

            setSearchDraft({
              base: nextSearch,
              value: nextSearch,
            });
            replaceCompanyParams({
              search: nextSearch,
              page: "",
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Recherche
              </span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) =>
                  setSearchDraft({
                    base: search,
                    value: event.target.value,
                  })
                }
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Trier par
              </span>
              <select
                value={sortBy}
                onChange={(event) => {
                  const nextSortBy = event.target.value as CompanySortBy;

                  replaceCompanyParams({
                    sortBy: nextSortBy === "createdAt" ? "" : nextSortBy,
                    page: "",
                  });
                }}
                className="rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="name">Nom</option>
                <option value="createdAt">Date de création</option>
                <option value="updatedAt">Date de modification</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Ordre</span>
              <select
                value={sortOrder}
                onChange={(event) => {
                  const nextSortOrder = event.target.value as CompanySortOrder;

                  replaceCompanyParams({
                    sortOrder: nextSortOrder === "desc" ? "" : nextSortOrder,
                    page: "",
                  });
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
                  const nextPageSize = Number(event.target.value);

                  replaceCompanyParams({
                    pageSize: nextPageSize === 10 ? "" : String(nextPageSize),
                    page: "",
                  });
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
                setSearchDraft({ base: "", value: "" });
                replaceCompanyParams({
                  search: "",
                  page: "",
                  pageSize: "",
                  sortBy: "",
                  sortOrder: "",
                });
              }}
              className="rounded-md border border-gray-300 px-4 py-2 font-medium"
            >
              Réinitialiser
            </button>
          </div>
        </form>
      </CollapsibleSection>
      <CollapsibleSection title="Nouvelle entreprise" defaultOpen={false}>
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Nom</span>

              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Site web
              </span>

              <input
                type="url"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://example.com"
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Ville</span>

              <input
                type="text"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={createCompanyMutation.isPending}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {createCompanyMutation.isPending
              ? "Création..."
              : "Créer l'entreprise"}
          </button>

          {createCompanyMutation.isError && (
            <p className="mt-3 text-sm text-red-600">
              Impossible de créer l'entreprise.
            </p>
          )}
        </form>
      </CollapsibleSection>

      {companiesQuery.data.items.length === 0 ? (
        <p className="mt-6 text-gray-600">
          {search
            ? "Aucun résultat pour cette recherche."
            : "Aucune entreprise enregistrée."}
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {companiesQuery.data.items.map((company) => (
            <article
              key={company.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-xl font-semibold">{company.name}</h2>

              <div className="mt-3 space-y-1 text-sm text-gray-600">
                {company.city && <p>Ville : {company.city}</p>}

                {company.website && (
                  <p>
                    Site :{" "}
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {company.website}
                    </a>
                  </p>
                )}

                <p>
                  <Link
                    to={`/job-offers?companyId=${company.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {company.jobOffers.length} offre
                    {company.jobOffers.length > 1 ? "s" : ""} d'emploi
                  </Link>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCompanyId(company.id);
                    setEditName(company.name);
                    setEditWebsite(company.website ?? "");
                    setEditCity(company.city ?? "");
                  }}
                  className="mt-4 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Supprimer l'entreprise "${company.name}" ?`,
                    );

                    if (confirmed) {
                      deleteCompanyMutation.mutate(company.id);
                    }
                  }}
                  disabled={deleteCompanyMutation.isPending}
                  className="mt-4 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>

              {editingCompanyId === company.id && (
                <form
                  className="mt-4 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4"
                  onSubmit={(event) => {
                    event.preventDefault();

                    updateCompanyMutation.mutate({
                      id: company.id,
                      input: {
                        name: editName,
                        website: editWebsite || undefined,
                        city: editCity || undefined,
                      },
                    });
                  }}
                >
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">
                      Nom
                    </span>
                    <input
                      type="text"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      required
                      className="rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">
                      Site web
                    </span>
                    <input
                      type="url"
                      value={editWebsite}
                      onChange={(event) => setEditWebsite(event.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">
                      Ville
                    </span>
                    <input
                      type="text"
                      value={editCity}
                      onChange={(event) => setEditCity(event.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={updateCompanyMutation.isPending}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Enregistrer
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingCompanyId(null)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              )}
              {deleteErrorCompanyId === company.id && (
                <p className="mt-3 text-sm text-red-600">
                  Impossible de supprimer cette entreprise. Vérifiez qu'aucune
                  offre d'emploi ne lui est encore associée.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      <Pagination
        page={companiesQuery.data.page}
        totalPages={companiesQuery.data.totalPages}
        totalLabel={`${companiesQuery.data.total} entreprises`}
        onPageChange={setPage}
      />
    </PageShell>
  );
}

export default CompaniesPage;
