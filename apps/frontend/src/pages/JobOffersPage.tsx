import { useQuery } from "@tanstack/react-query";
import { getJobOffers, type ContractType } from "../api/job-offers";

const contractTypeLabels: Record<ContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  INTERNSHIP: "Stage",
  FREELANCE: "Freelance",
  TEMPORARY: "Intérim",
  OTHER: "Autre",
};

function JobOffersPage() {
  const jobOffersQuery = useQuery({
    queryKey: ["job-offers"],
    queryFn: getJobOffers,
  });

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

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Offres d’emploi</h1>

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
