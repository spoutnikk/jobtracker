import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getApplication,
  updateApplication,
  type Application,
  type ApplicationStatus,
  type ContractType,
  type UpdateApplicationInput,
} from "../api/applications";
import {
  getApplicationEvents,
  type ApplicationEventType,
} from "../api/application-events";
import {
  canPreviewDocument,
  downloadDocument,
  getDocumentPreview,
  getAllDocuments,
  type DocumentType,
} from "../api/documents";
import { hasHttpStatus } from "../api/http-error";
import { applicationStatusLabels } from "../constants/application-status";
import PageShell from "../components/PageShell";
import LoadingMessage from "../components/LoadingMessage";
import PageLoadingState from "../components/PageLoadingState";
import StatusMessage from "../components/StatusMessage";
import Dialog from "../components/Dialog";

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

const documentTypeLabels: Record<DocumentType, string> = {
  CV: "CV",
  COVER_LETTER: "Lettre de motivation",
  JOB_OFFER: "Offre d'emploi",
  OTHER: "Autre",
};

interface EditApplicationForm {
  status: ApplicationStatus;
  appliedAt: string;
  source: string;
  notes: string;
  contactName: string;
  contactEmail: string;
  followUpAt: string;
  interviewAt: string;
}

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

function toDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function toDateTimeLocalInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toEditForm(application: Application): EditApplicationForm {
  return {
    status: application.status,
    appliedAt: toDateInputValue(application.appliedAt),
    source: application.source ?? "",
    notes: application.notes ?? "",
    contactName: application.contactName ?? "",
    contactEmail: application.contactEmail ?? "",
    followUpAt: toDateInputValue(application.followUpAt),
    interviewAt: toDateTimeLocalInputValue(application.interviewAt),
  };
}

function optionalText(value: string) {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function optionalDate(value: string) {
  return value === "" ? null : new Date(`${value}T00:00:00`).toISOString();
}

function optionalDateTime(value: string) {
  return value === "" ? null : new Date(value).toISOString();
}

function ApplicationDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<{
    documentId: number;
    name: string;
    originalName: string;
    mimeType: string;
    objectUrl: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview.objectUrl);
      }
    };
  }, [preview]);

  function closePreview() {
    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current.objectUrl);
      }
      return null;
    });
  }

  const applicationId = Number(id);
  const isValidApplicationId =
    Number.isInteger(applicationId) && applicationId > 0;

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditApplicationForm | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const documentsQuery = useQuery({
    queryKey: ["documents", { applicationId }],
    queryFn: () => getAllDocuments({ applicationId }),
    enabled: isValidApplicationId,
  });

  const downloadDocumentMutation = useMutation({
    mutationFn: ({ id, originalName }: { id: number; originalName: string }) =>
      downloadDocument(id, originalName),
  });

  const previewDocumentMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      originalName,
      mimeType,
    }: {
      id: number;
      name: string;
      originalName: string;
      mimeType: string;
    }) => {
      const blob = await getDocumentPreview(id);
      return {
        documentId: id,
        name,
        originalName,
        mimeType,
        objectUrl: URL.createObjectURL(blob),
      };
    },
    onSuccess: (nextPreview) => {
      setPreview((current) => {
        if (current) {
          URL.revokeObjectURL(current.objectUrl);
        }
        return nextPreview;
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateApplicationInput) =>
      updateApplication(applicationId, input),
    onMutate: () => {
      setSuccessMessage(null);
    },
    onSuccess: async (updatedApplication) => {
      queryClient.setQueryData(
        ["applications", "detail", applicationId],
        updatedApplication,
      );

      setIsEditing(false);
      setEditForm(null);
      setSuccessMessage("Candidature modifiée avec succès.");

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["applications"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["application-events", applicationId],
        }),
      ]);
    },
  });

  if (!isValidApplicationId) {
    return (
      <PageShell>
        <p>Cette candidature n'existe pas ou n'est plus disponible.</p>
      </PageShell>
    );
  }

  if (applicationQuery.isPending) {
    return <PageLoadingState>Chargement de la candidature...</PageLoadingState>;
  }

  if (applicationQuery.isError) {
    const isNotFound = hasHttpStatus(applicationQuery.error, 404);

    return (
      <main className="min-h-screen p-8">
        <StatusMessage variant="error">
          {isNotFound
            ? "Cette candidature n'existe pas ou n'est plus disponible."
            : "Impossible de charger la candidature."}
        </StatusMessage>
      </main>
    );
  }

  const application = applicationQuery.data;
  const { jobOffer } = application;
  const { company } = jobOffer;

  function startEditing() {
    setEditForm(toEditForm(application));
    setIsEditing(true);
    updateMutation.reset();
  }

  function cancelEditing() {
    setEditForm(null);
    setIsEditing(false);
    updateMutation.reset();
  }

  function updateEditForm<Key extends keyof EditApplicationForm>(
    key: Key,
    value: EditApplicationForm[Key],
  ) {
    setEditForm((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editForm) {
      return;
    }

    updateMutation.mutate({
      status: editForm.status,
      appliedAt: optionalDate(editForm.appliedAt),
      source: optionalText(editForm.source),
      notes: optionalText(editForm.notes),
      contactName: optionalText(editForm.contactName),
      contactEmail: optionalText(editForm.contactEmail),
      followUpAt: optionalDate(editForm.followUpAt),
      interviewAt: optionalDateTime(editForm.interviewAt),
    });
  }

  return (
    <PageShell width="narrow">
      <Link
        to="/applications"
        className="text-sm font-medium text-blue-700 hover:underline"
      >
        Retour aux candidatures
      </Link>

      {successMessage && (
        <StatusMessage variant="success" className="mt-4">
          {successMessage}
        </StatusMessage>
      )}

      <header className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{jobOffer.title}</h1>
            <p className="mt-2 text-lg text-gray-600">{company.name}</p>
          </div>

          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">
            {applicationStatusLabels[application.status]}
          </span>
        </div>
      </header>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Candidature</h2>

          {!isEditing && (
            <button
              type="button"
              onClick={startEditing}
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Modifier
            </button>
          )}
        </div>

        {isEditing && editForm ? (
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="detail-status" className="block font-medium">
                Statut
              </label>
              <select
                id="detail-status"
                value={editForm.status}
                onChange={(event) =>
                  updateEditForm(
                    "status",
                    event.target.value as ApplicationStatus,
                  )
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              >
                {Object.entries(applicationStatusLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div>
              <label htmlFor="detail-applied-at" className="block font-medium">
                Date de candidature
              </label>
              <input
                id="detail-applied-at"
                type="date"
                value={editForm.appliedAt}
                onChange={(event) =>
                  updateEditForm("appliedAt", event.target.value)
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="detail-source" className="block font-medium">
                Source
              </label>
              <input
                id="detail-source"
                value={editForm.source}
                onChange={(event) =>
                  updateEditForm("source", event.target.value)
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="detail-notes" className="block font-medium">
                Notes
              </label>
              <textarea
                id="detail-notes"
                value={editForm.notes}
                onChange={(event) =>
                  updateEditForm("notes", event.target.value)
                }
                rows={5}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="detail-contact-name"
                className="block font-medium"
              >
                Nom du contact
              </label>
              <input
                id="detail-contact-name"
                value={editForm.contactName}
                onChange={(event) =>
                  updateEditForm("contactName", event.target.value)
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="detail-contact-email"
                className="block font-medium"
              >
                Email du contact
              </label>
              <input
                id="detail-contact-email"
                type="email"
                value={editForm.contactEmail}
                onChange={(event) =>
                  updateEditForm("contactEmail", event.target.value)
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="detail-follow-up-at"
                className="block font-medium"
              >
                Date de relance
              </label>
              <input
                id="detail-follow-up-at"
                type="date"
                value={editForm.followUpAt}
                onChange={(event) =>
                  updateEditForm("followUpAt", event.target.value)
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="detail-interview-at"
                className="block font-medium"
              >
                Date d'entretien
              </label>
              <input
                id="detail-interview-at"
                type="datetime-local"
                value={editForm.interviewAt}
                onChange={(event) =>
                  updateEditForm("interviewAt", event.target.value)
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            {updateMutation.isError && (
              <StatusMessage variant="error">
                Impossible de modifier la candidature.
              </StatusMessage>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
              </button>

              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={cancelEditing}
                className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
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
        )}
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
          <LoadingMessage className="mt-4">
            Chargement de l'historique...
          </LoadingMessage>
        ) : applicationEventsQuery.isError ? (
          <StatusMessage variant="error" className="mt-4">
            {hasHttpStatus(applicationEventsQuery.error, 404)
              ? "Historique indisponible."
              : "Impossible de charger l'historique."}
          </StatusMessage>
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
        <h2 className="text-xl font-semibold">Documents</h2>

        {documentsQuery.isPending ? (
          <LoadingMessage className="mt-4">
            Chargement des documents...
          </LoadingMessage>
        ) : documentsQuery.isError ? (
          <StatusMessage variant="error" className="mt-4">
            Impossible de charger les documents.
          </StatusMessage>
        ) : documentsQuery.data.length === 0 ? (
          <p className="mt-4">Aucun document associé.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {documentsQuery.data.map((document) => (
              <li
                key={document.id}
                className="rounded-md border border-gray-200 p-4"
              >
                <p className="font-semibold">{document.name}</p>

                <p className="mt-1 text-sm text-gray-700">
                  {documentTypeLabels[document.type]}
                </p>

                <time
                  dateTime={document.createdAt}
                  className="mt-1 block text-sm text-gray-600"
                >
                  Ajouté le {formatDateTime(document.createdAt)}
                </time>

                {canPreviewDocument(document.mimeType) && (
                  <button
                    type="button"
                    onClick={() => {
                      previewDocumentMutation.reset();
                      previewDocumentMutation.mutate({
                        id: document.id,
                        name: document.name,
                        originalName: document.originalName,
                        mimeType: document.mimeType,
                      });
                    }}
                    disabled={
                      previewDocumentMutation.isPending &&
                      previewDocumentMutation.variables?.id === document.id
                    }
                    className="mt-3 mr-4 font-medium text-blue-700 hover:underline disabled:opacity-50"
                  >
                    {previewDocumentMutation.isPending &&
                    previewDocumentMutation.variables?.id === document.id
                      ? `Chargement de l'aperçu de ${document.name}...`
                      : `Aperçu ${document.name}`}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    downloadDocumentMutation.reset();
                    downloadDocumentMutation.mutate({
                      id: document.id,
                      originalName: document.originalName,
                    });
                  }}
                  disabled={
                    downloadDocumentMutation.isPending &&
                    downloadDocumentMutation.variables?.id === document.id
                  }
                  className="mt-3 font-medium text-blue-700 hover:underline disabled:opacity-50"
                >
                  {downloadDocumentMutation.isPending &&
                  downloadDocumentMutation.variables?.id === document.id
                    ? `Téléchargement de ${document.name}...`
                    : `Télécharger ${document.name}`}
                </button>

                {previewDocumentMutation.isError &&
                  previewDocumentMutation.variables?.id === document.id && (
                    <StatusMessage variant="error" className="mt-2">
                      Impossible d'afficher l'aperçu du document.
                    </StatusMessage>
                  )}

                {downloadDocumentMutation.isError &&
                  downloadDocumentMutation.variables?.id === document.id && (
                    <StatusMessage variant="error" className="mt-2">
                      Impossible de télécharger le document.
                    </StatusMessage>
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {preview && (
        <Dialog
          onClose={closePreview}
          ariaLabel={`Aperçu de ${preview.name}`}
          className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
            <h2 className="text-xl font-semibold">Aperçu — {preview.name}</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  window.open(
                    preview.objectUrl,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Ouvrir dans un nouvel onglet
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadDocumentMutation.reset();
                  downloadDocumentMutation.mutate({
                    id: preview.documentId,
                    originalName: preview.originalName,
                  });
                }}
                disabled={downloadDocumentMutation.isPending}
                className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                {downloadDocumentMutation.isPending
                  ? "Téléchargement..."
                  : "Télécharger"}
              </button>
              <button
                type="button"
                onClick={closePreview}
                autoFocus
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Fermer l'aperçu
              </button>
            </div>
          </div>
          <iframe
            title={`Aperçu de ${preview.name}`}
            src={preview.objectUrl}
            className="min-h-0 flex-1 w-full border-0"
          />
        </Dialog>
      )}

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
    </PageShell>
  );
}

export default ApplicationDetailPage;
