import { useQuery } from "@tanstack/react-query";
import { getApplications } from "../api/applications";

function ApplicationsPage() {
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
