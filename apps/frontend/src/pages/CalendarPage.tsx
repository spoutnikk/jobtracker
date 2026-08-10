import { useQuery } from "@tanstack/react-query";
import { getFollowUps, getInterviews } from "../api/applications";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function isSoon(value: string) {
  const eventDate = new Date(value).getTime();
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;

  return eventDate >= now && eventDate - now <= threeDays;
}

function CalendarPage() {
  const followUpsQuery = useQuery({
    queryKey: ["follow-ups"],
    queryFn: getFollowUps,
  });

  const interviewsQuery = useQuery({
    queryKey: ["interviews"],
    queryFn: getInterviews,
  });

  if (followUpsQuery.isPending || interviewsQuery.isPending) {
    return (
      <main className="min-h-screen p-8">
        <p>Chargement du calendrier...</p>
      </main>
    );
  }

  if (followUpsQuery.isError || interviewsQuery.isError) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-red-600">
          Impossible de charger les relances ou les entretiens.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Calendrier</h1>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold">Relances à venir</h2>

          {followUpsQuery.data.length === 0 ? (
            <p className="mt-4 text-gray-600">Aucune relance à venir.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {followUpsQuery.data.map((application) => (
                <article
                  key={application.id}
                  className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <h3 className="text-lg font-semibold">
                    {application.jobOffer.title}
                  </h3>

                  <p className="mt-1 text-gray-600">
                    {application.jobOffer.company.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-600">
                    {application.jobOffer.location && (
                      <span>{application.jobOffer.location}</span>
                    )}

                    {application.jobOffer.contractType && (
                      <span>• {application.jobOffer.contractType}</span>
                    )}

                    <span>• {application.status}</span>
                  </div>
                  {application.followUpAt && (
                    <p
                      className={
                        isSoon(application.followUpAt)
                          ? "mt-3 text-sm font-semibold text-orange-600"
                          : "mt-3 text-sm text-gray-700"
                      }
                    >
                      Relance prévue le {formatDateTime(application.followUpAt)}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold">Entretiens à venir</h2>

          {interviewsQuery.data.length === 0 ? (
            <p className="mt-4 text-gray-600">Aucun entretien à venir.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {interviewsQuery.data.map((application) => (
                <article
                  key={application.id}
                  className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <h3 className="text-lg font-semibold">
                    {application.jobOffer.title}
                  </h3>

                  <p className="mt-1 text-gray-600">
                    {application.jobOffer.company.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-600">
                    {application.jobOffer.location && (
                      <span>{application.jobOffer.location}</span>
                    )}

                    {application.jobOffer.contractType && (
                      <span>• {application.jobOffer.contractType}</span>
                    )}

                    <span>• {application.status}</span>
                  </div>
                  {application.interviewAt && (
                    <p
                      className={
                        isSoon(application.interviewAt)
                          ? "mt-3 text-sm font-semibold text-orange-600"
                          : "mt-3 text-sm text-gray-700"
                      }
                    >
                      Entretien prévu le{" "}
                      {formatDateTime(application.interviewAt)}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default CalendarPage;
