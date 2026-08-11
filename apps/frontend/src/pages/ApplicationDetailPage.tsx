import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import {
  getApplication,
  type ApplicationStatus,
  type ContractType,
} from "../api/applications";
import {
  getApplicationEvents,
  type ApplicationEventType,
} from "../api/application-events";

const statusLabels: Record<ApplicationStatus, string> = {
  DRAFT: "À préparer",
  APPLIED: "Envoyée",
  FOLLOW_UP: "Relance",
  INTERVIEW: "Entretien",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
};

const contractTypeLabels: Record<ContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  INTERNSHIP: "Stage",
  FREELANCE: "Freelance",
  TEMPORARY: "Intérim",
  OTHER: "Autre",
};

const eventTypeLabels: Record<ApplicationEventType, string> = {
  CREATED: "Création",
  STATUS_CHANGED: "Changement de statut",
  APPLICATION_SENT: "Candidature envoyée",
  FOLLOW_UP: "Relance",
  INTERVIEW: "Entretien",
  DOCUMENT_ADDED: "Document ajouté",
  NOTE: "Note",
  OTHER: "Autre",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

function ApplicationDetailPage() {
  const { id } = useParams();
  const applicationId = Number(id);
  const isValidApplicationId =
    Number.isInteger(applicationId) && applicationId > 0;
  const applicationQuery = useQuery({
    queryKey: ["applications", "detail", applicationId],
    queryFn: () => getApplication(applicationId),
    enabled: isValidApplicationId,
  });
  const applicationEventsQuery = useQuery({
    queryKey: ["application-events", applicationId],
    queryFn: () => getApplicationEvents(applicationId),
    enabled: isValidApplicationId,
  });

  if (!isValidApplicationId) {
    return (
      <main className="min-h-screen p-8">
        <p>Cette candidature n'existe pas ou n'est plus disponible.</p>
      </main>
    );
  }

  if (applicationQuery.isPending) {
    return (
      <main className="min-h-screen p-8">
        <p>Chargement de la candidature...</p>
      </main>
    );
  }

  if (applicationQuery.isError) {
    const isNotFound =
      axios.isAxiosError(applicationQuery.error) &&
      applicationQuery.error.response?.status === 404;

    return (
      <main className="min-h-screen p-8">
        <p className="text-red-600">
          {isNotFound
            ? "Cette candidature n'existe pas ou n'est plus disponible."
            : "Impossible de charger la candidature."}
        </p>
      </main>
    );
  }

  const application = applicationQuery.data;
  const { jobOffer } = application;
  const { company } = jobOffer;

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/applications"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          Retour aux candidatures
        </Link>

        <header className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{jobOffer.title}</h1>
              <p className="mt-2 text-lg text-gray-600">{company.name}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">
              {statusLabels[application.status]}
            </span>
          </div>
        </header>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Candidature</h2>
          <dl className="mt-4 space-y-3">
            {application.appliedAt && (
              <div>
                <dt className="font-medium">Date de candidature</dt>
                <dd>{formatDate(application.appliedAt)}</dd>
              </div>
            )}
            {application.source && (
              <div>
                <dt className="font-medium">Source</dt>
                <dd>{application.source}</dd>
              </div>
            )}
            {application.followUpAt && (
              <div>
                <dt className="font-medium">Prochaine relance</dt>
                <dd>{formatDateTime(application.followUpAt)}</dd>
              </div>
            )}
            {application.interviewAt && (
              <div>
                <dt className="font-medium">Entretien</dt>
                <dd>{formatDateTime(application.interviewAt)}</dd>
              </div>
            )}
            {application.contactName && (
              <div>
                <dt className="font-medium">Contact</dt>
                <dd>{application.contactName}</dd>
              </div>
            )}
            {application.contactEmail && (
              <div>
                <dt className="font-medium">Email du contact</dt>
                <dd>{application.contactEmail}</dd>
              </div>
            )}
            {application.notes && (
              <div>
                <dt className="font-medium">Notes</dt>
                <dd className="whitespace-pre-wrap">{application.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Offre</h2>
          <dl className="mt-4 space-y-3">
            {jobOffer.location && (
              <div>
                <dt className="font-medium">Localisation</dt>
                <dd>{jobOffer.location}</dd>
              </div>
            )}
            {jobOffer.contractType && (
              <div>
                <dt className="font-medium">Type de contrat</dt>
                <dd>{contractTypeLabels[jobOffer.contractType]}</dd>
              </div>
            )}
            {jobOffer.salary && (
              <div>
                <dt className="font-medium">Salaire</dt>
                <dd>{jobOffer.salary}</dd>
              </div>
            )}
            {jobOffer.publishedAt && (
              <div>
                <dt className="font-medium">Date de publication</dt>
                <dd>{formatDate(jobOffer.publishedAt)}</dd>
              </div>
            )}
            {jobOffer.description && (
              <div>
                <dt className="font-medium">Description</dt>
                <dd className="whitespace-pre-wrap">{jobOffer.description}</dd>
              </div>
            )}
          </dl>
          {jobOffer.url && (
            <a
              href={jobOffer.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block font-medium text-blue-700 hover:underline"
            >
              Voir l'offre
            </a>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Entreprise</h2>
          <p className="mt-4 font-medium">{company.name}</p>
          {company.city && <p className="mt-2">{company.city}</p>}
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block font-medium text-blue-700 hover:underline"
            >
              Site de l'entreprise
            </a>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Historique</h2>

          {applicationEventsQuery.isPending ? (
            <p className="mt-4">Chargement de l'historique...</p>
          ) : applicationEventsQuery.isError ? (
            <p className="mt-4 text-red-600">
              {axios.isAxiosError(applicationEventsQuery.error) &&
              applicationEventsQuery.error.response?.status === 404
                ? "Historique indisponible."
                : "Impossible de charger l'historique."}
            </p>
          ) : applicationEventsQuery.data.length === 0 ? (
            <p className="mt-4">Aucun événement enregistré.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {applicationEventsQuery.data.map((applicationEvent) => (
                <li
                  key={applicationEvent.id}
                  className="rounded-md border border-gray-200 p-4"
                >
                  <p className="font-semibold">
                    {eventTypeLabels[applicationEvent.type] ??
                      applicationEvent.type}
                  </p>
                  <p className="mt-1">{applicationEvent.title}</p>
                  {applicationEvent.description && (
                    <p className="mt-1 whitespace-pre-wrap text-gray-700">
                      {applicationEvent.description}
                    </p>
                  )}
                  <time
                    dateTime={applicationEvent.occurredAt}
                    className="mt-2 block text-sm text-gray-600"
                  >
                    {formatDateTime(applicationEvent.occurredAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Métadonnées</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="font-medium">Créée le</dt>
              <dd>{formatDateTime(application.createdAt)}</dd>
            </div>
            <div>
              <dt className="font-medium">Mise à jour le</dt>
              <dd>{formatDateTime(application.updatedAt)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}

export default ApplicationDetailPage;
