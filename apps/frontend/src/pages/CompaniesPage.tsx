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
import { Link } from "react-router-dom";
import CollapsibleSection from "../components/CollapsibleSection";
import PageShell from "../components/PageShell";
import StatusMessage from "../components/StatusMessage";

function CompaniesPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<CompanySortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<CompanySortOrder>("desc");
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
    return (
      <PageShell>
        <p>Chargement des entreprises...</p>
      </PageShell>
    );
  }

  if (companiesQuery.isError) {
    return (
      <PageShell>
        <p className="text-red-600">Impossible de charger les entreprises.</p>
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
            setSearch(searchInput.trim());
            setPage(1);
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
                onChange={(event) => setSearchInput(event.target.value)}
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
                  setSortBy(event.target.value as CompanySortBy);
                  setPage(1);
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
                  setSortOrder(event.target.value as CompanySortOrder);
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
                setSearchInput("");
                setSearch("");
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

      <div className="mt-6 flex items-center justify-between text-sm text-gray-600">
        <p>{companiesQuery.data.total} entreprises</p>
        <p>
          Page {companiesQuery.data.page} sur {companiesQuery.data.totalPages}
        </p>
      </div>
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
            companiesQuery.data.totalPages === 0 ||
            page >= companiesQuery.data.totalPages
          }
          onClick={() => setPage((current) => current + 1)}
          className="rounded-md border border-gray-300 px-4 py-2 disabled:opacity-50"
        >
          Suivant
        </button>
      </div>
    </PageShell>
  );
}

export default CompaniesPage;
