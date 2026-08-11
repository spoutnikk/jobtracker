import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "../api/dashboard";

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

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Tableau de bord</h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Candidatures</p>
            <p className="mt-2 text-3xl font-bold">{stats.totalApplications}</p>
          </article>

          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Entreprises</p>
            <p className="mt-2 text-3xl font-bold">{stats.totalCompanies}</p>
          </article>

          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Offres</p>
            <p className="mt-2 text-3xl font-bold">{stats.totalJobOffers}</p>
          </article>

          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Relances à venir</p>
            <p className="mt-2 text-3xl font-bold">{stats.upcomingFollowUps}</p>
          </article>

          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Entretiens à venir</p>
            <p className="mt-2 text-3xl font-bold">
              {stats.upcomingInterviews}
            </p>
          </article>
          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Candidatures sur 30 jours</p>
            <p className="mt-2 text-3xl font-bold">
              {stats.recentApplications}
            </p>
          </article>

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
          <h2 className="text-2xl font-semibold">Candidatures par statut</h2>

          {stats.applicationsByStatus.length === 0 ? (
            <p className="mt-4 text-gray-600">Aucune candidature à analyser.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {stats.applicationsByStatus.map((item) => (
                <div
                  key={item.status}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
                >
                  <span className="font-medium">{item.status}</span>
                  <span className="text-lg font-semibold">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default DashboardPage;
