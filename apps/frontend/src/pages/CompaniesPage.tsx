import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCompany, getCompanies } from "../api/companies";
import { useState } from "react";

function CompaniesPage() {
  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: getCompanies,
  });
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("");

  const createCompanyMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: async () => {
      setName("");
      setWebsite("");
      setCity("");

      await queryClient.invalidateQueries({
        queryKey: ["companies"],
      });
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
      <main className="min-h-screen p-8">
        <p>Chargement des entreprises...</p>
      </main>
    );
  }

  if (companiesQuery.isError) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-red-600">Impossible de charger les entreprises.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Entreprises</h1>
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Nouvelle entreprise</h2>

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

        {companiesQuery.data.length === 0 ? (
          <p className="mt-6 text-gray-600">Aucune entreprise enregistrée.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {companiesQuery.data.map((company) => (
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
                    {company.jobOffers.length} offre
                    {company.jobOffers.length > 1 ? "s" : ""} d'emploi
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default CompaniesPage;
