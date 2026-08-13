import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getDashboardStats } from "../api/dashboard";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
  });

  if (dashboardQuery.isPending) {
    return (
      <main className="min-h-screen p-8">
        <p>Chargement du tableau de bord...</p>
      </main>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-red-600">
          Impossible de charger le tableau de bord.
        </p>
      </main>
    );
  }

  const stats = dashboardQuery.data;
  const percentageFormatter = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 1,
  });
  const weekFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const maxWeeklyApplications = Math.max(
    ...stats.weeklyApplications.map(({ count }) => count),
    1,
  );
  const totalWeeklyApplications = stats.weeklyApplications.reduce(
    (total, { count }) => total + count,
    0,
  );
  const totalApplicationsByStatus = stats.applicationsByStatus.reduce(
    (total, item) => total + item.count,
    0,
  );

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Tableau de bord</h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link to="/applications" className="block">
            <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow">
              <p className="text-sm text-gray-600">Candidatures</p>
              <p className="mt-2 text-3xl font-bold">
                {stats.totalApplications}
              </p>
            </article>
          </Link>

          <Link to="/companies" className="block">
            <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow">
              <p className="text-sm text-gray-600">Entreprises</p>
              <p className="mt-2 text-3xl font-bold">{stats.totalCompanies}</p>
            </article>
          </Link>

          <Link to="/job-offers" className="block">
            <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow">
              <p className="text-sm text-gray-600">Offres</p>
              <p className="mt-2 text-3xl font-bold">{stats.totalJobOffers}</p>
            </article>
          </Link>

          <Link to="/calendar" className="block">
            <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow">
              <p className="text-sm text-gray-600">Relances à venir</p>
              <p className="mt-2 text-3xl font-bold">
                {stats.upcomingFollowUps}
              </p>
            </article>
          </Link>

          <Link to="/calendar" className="block">
            <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow">
              <p className="text-sm text-gray-600">Entretiens à venir</p>
              <p className="mt-2 text-3xl font-bold">
                {stats.upcomingInterviews}
              </p>
            </article>
          </Link>
          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Taux d'entretien</p>
            <p className="mt-2 text-3xl font-bold">
              {percentageFormatter.format(stats.interviewRate)} %
            </p>
          </article>

          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Candidatures — 7 jours</p>
            <p className="mt-2 text-3xl font-bold">
              {stats.applicationsLast7Days}
            </p>
          </article>

          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Candidatures — 30 jours</p>
            <p className="mt-2 text-3xl font-bold">
              {stats.applicationsLast30Days}
            </p>
          </article>

          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">
              Entretiens à venir — 7 jours
            </p>
            <p className="mt-2 text-3xl font-bold">
              {stats.upcomingInterviews7Days}
            </p>
          </article>

          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Relances à venir — 7 jours</p>
            <p className="mt-2 text-3xl font-bold">
              {stats.upcomingFollowUps7Days}
            </p>
          </article>
        </div>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold">
            Candidatures des 8 dernières semaines
          </h2>

          <div className="mt-4 grid h-64 grid-cols-8 gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            {stats.weeklyApplications.map(({ weekStart, count }) => {
              const weekLabel = weekFormatter.format(new Date(weekStart));
              const percentage =
                totalWeeklyApplications === 0
                  ? 0
                  : (count / totalWeeklyApplications) * 100;

              const formattedPercentage =
                percentageFormatter.format(percentage);

              const accessibleLabel = `Semaine du ${weekLabel} : ${count} ${
                count > 1 ? "candidatures" : "candidature"
              }, ${formattedPercentage} %`;

              return (
                <div
                  key={weekStart}
                  className="flex min-w-0 flex-col items-center justify-end gap-2"
                  role="img"
                  aria-label={accessibleLabel}
                >
                  <span className="text-center text-sm font-semibold">
                    {count}
                    <span className="block text-xs font-normal text-gray-500">
                      {formattedPercentage} %
                    </span>
                  </span>
                  <div className="flex h-40 w-full items-end justify-center">
                    <div
                      className="min-h-1 w-full max-w-10 rounded-t bg-blue-600"
                      style={{
                        height: `${(count / maxWeeklyApplications) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-center text-xs text-gray-600">
                    {weekLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="text-2xl font-semibold">Prochaines relances</h2>

            {stats.nextFollowUps.length === 0 ? (
              <p className="mt-4 text-gray-600">
                Pas de relance prévue dans les 7 prochains jours.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {stats.nextFollowUps.map((followUp) => (
                  <article
                    key={followUp.applicationId}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <h3 className="font-semibold">{followUp.jobTitle}</h3>
                    <p className="text-sm text-gray-600">
                      {followUp.companyName}
                    </p>
                    <p className="mt-2 text-sm">
                      {formatDateTime(followUp.followUpAt)}
                    </p>
                    <Link
                      to={`/applications/${followUp.applicationId}`}
                      className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline"
                    >
                      Voir la candidature « {followUp.jobTitle} »
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-2xl font-semibold">Prochains entretiens</h2>

            {stats.nextInterviews.length === 0 ? (
              <p className="mt-4 text-gray-600">
                Pas d'entretien prévu dans les 7 prochains jours.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {stats.nextInterviews.map((interview) => (
                  <article
                    key={interview.applicationId}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <h3 className="font-semibold">{interview.jobTitle}</h3>
                    <p className="text-sm text-gray-600">
                      {interview.companyName}
                    </p>
                    <p className="mt-2 text-sm">
                      {formatDateTime(interview.interviewAt)}
                    </p>
                    <Link
                      to={`/applications/${interview.applicationId}`}
                      className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline"
                    >
                      Voir la candidature « {interview.jobTitle} »
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold">Candidatures par statut</h2>

          {stats.applicationsByStatus.length === 0 ? (
            <p className="mt-4 text-gray-600">Aucune candidature à analyser.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {stats.applicationsByStatus.map((item) => {
                const percentage =
                  totalApplicationsByStatus === 0
                    ? 0
                    : (item.count / totalApplicationsByStatus) * 100;

                const formattedPercentage =
                  percentageFormatter.format(percentage);
                const accessibleLabel = `${item.status} : ${item.count} ${
                  item.count > 1 ? "candidatures" : "candidature"
                }, ${formattedPercentage} %`;

                return (
                  <div
                    key={item.status}
                    className="rounded-lg border border-gray-200 bg-white p-4"
                    role="img"
                    aria-label={accessibleLabel}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">{item.status}</span>

                      <span className="text-sm font-semibold text-gray-700">
                        {item.count} · {formattedPercentage} %
                      </span>
                    </div>

                    <div
                      className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{
                          width: `${percentage}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default DashboardPage;
