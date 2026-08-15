import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getAllApplications, type Application } from "../api/applications";
import PageShell from "../components/PageShell";

type PriorityKind = "FOLLOW_UP" | "INTERVIEW";

interface Priority {
  application: Application;
  kind: PriorityKind;
  date: string;
}

function isClosedApplication(application: Application) {
  return application.status === "ACCEPTED" || application.status === "REJECTED";
}

function isSameLocalDay(value: string, reference: Date) {
  const date = new Date(value);

  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function getEndOfToday(reference: Date) {
  const endOfToday = new Date(reference);
  endOfToday.setHours(23, 59, 59, 999);

  return endOfToday;
}

function buildPriorities(applications: Application[], now: Date): Priority[] {
  const endOfToday = getEndOfToday(now);

  return applications
    .filter((application) => !isClosedApplication(application))
    .flatMap((application): Priority[] => {
      const priorities: Priority[] = [];

      if (
        application.followUpAt &&
        new Date(application.followUpAt) <= endOfToday
      ) {
        priorities.push({
          application,
          kind: "FOLLOW_UP",
          date: application.followUpAt,
        });
      }

      if (
        application.interviewAt &&
        isSameLocalDay(application.interviewAt, now)
      ) {
        priorities.push({
          application,
          kind: "INTERVIEW",
          date: application.interviewAt,
        });
      }

      return priorities;
    })
    .sort((left, right) => {
      const dateDifference =
        new Date(left.date).getTime() - new Date(right.date).getTime();

      if (dateDifference !== 0) {
        return dateDifference;
      }

      return left.application.id - right.application.id;
    });
}

function formatPriorityDate(priority: Priority, now: Date) {
  const date = new Date(priority.date);

  if (priority.kind === "INTERVIEW") {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  if (isSameLocalDay(priority.date, now)) {
    return `Aujourd'hui à ${new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)}`;
  }

  return `En retard depuis le ${new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(date)}`;
}

function HomePage() {
  const applicationsQuery = useQuery({
    queryKey: ["applications", "all"],
    queryFn: getAllApplications,
  });

  if (applicationsQuery.isPending) {
    return (
      <PageShell>
        <p>Chargement de votre journée...</p>
      </PageShell>
    );
  }

  if (applicationsQuery.isError) {
    return (
      <PageShell>
        <p className="text-red-600">
          Impossible de charger les actions à effectuer.
        </p>
      </PageShell>
    );
  }

  const now = new Date();
  const applications = applicationsQuery.data;
  const priorities = buildPriorities(applications, now);
  const draftCount = applications.filter(
    (application) => application.status === "DRAFT",
  ).length;
  const followUpCount = priorities.filter(
    (priority) => priority.kind === "FOLLOW_UP",
  ).length;
  const interviewCount = priorities.filter(
    (priority) => priority.kind === "INTERVIEW",
  ).length;

  return (
    <PageShell>
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-blue-700">
          Aujourd&apos;hui
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          Votre recherche d&apos;emploi
        </h1>
        <p className="mt-2 text-gray-600">
          Les actions qui demandent votre attention en priorité.
        </p>
      </header>

      <section
        aria-label="Résumé de la journée"
        className="mt-6 grid gap-4 sm:grid-cols-3"
      >
        <Link
          to="/calendar"
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300"
        >
          <p className="text-sm text-gray-600">Relances à traiter</p>
          <p className="mt-2 text-3xl font-bold">{followUpCount}</p>
        </Link>

        <Link
          to="/calendar"
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300"
        >
          <p className="text-sm text-gray-600">Entretiens aujourd&apos;hui</p>
          <p className="mt-2 text-3xl font-bold">{interviewCount}</p>
        </Link>

        <Link
          to="/applications?status=DRAFT"
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300"
        >
          <p className="text-sm text-gray-600">Candidatures à préparer</p>
          <p className="mt-2 text-3xl font-bold">{draftCount}</p>
        </Link>
      </section>

      <section className="mt-10" aria-labelledby="home-priorities-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-priorities-title" className="text-2xl font-semibold">
            Priorités
          </h2>

          <Link
            to="/calendar"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Voir le calendrier
          </Link>
        </div>

        {priorities.length === 0 ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-5">
            <p className="font-medium text-green-900">
              Aucune action urgente aujourd&apos;hui.
            </p>
            <p className="mt-1 text-sm text-green-800">
              Vous pouvez avancer sur vos candidatures en préparation.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {priorities.map((priority) => (
              <article
                key={`${priority.kind}-${priority.application.id}`}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-blue-700">
                      {priority.kind === "FOLLOW_UP" ? "Relance" : "Entretien"}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">
                      {priority.application.jobOffer.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {priority.application.jobOffer.company.name}
                    </p>
                  </div>

                  <p className="text-sm font-medium text-gray-700">
                    {formatPriorityDate(priority, now)}
                  </p>
                </div>

                <Link
                  to={`/applications/${priority.application.id}`}
                  className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline"
                >
                  Voir la candidature
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="home-shortcuts-title">
        <h2 id="home-shortcuts-title" className="text-2xl font-semibold">
          Accès rapides
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/applications"
            className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            Candidatures
          </Link>
          <Link
            to="/companies"
            className="rounded-md border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            Entreprises
          </Link>
          <Link
            to="/job-offers"
            className="rounded-md border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            Offres
          </Link>
          <Link
            to="/dashboard"
            className="rounded-md border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            Tableau de bord
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

export default HomePage;
