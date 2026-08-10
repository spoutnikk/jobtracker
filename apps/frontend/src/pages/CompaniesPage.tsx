import { useQuery } from "@tanstack/react-query";
import { getCompanies } from "../api/companies";

function CompaniesPage() {
  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: getCompanies,
  });

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
