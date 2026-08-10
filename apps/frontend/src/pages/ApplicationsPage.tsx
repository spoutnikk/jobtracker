import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createApplication,
  getApplications,
  updateApplication,
  deleteApplication,
  type ApplicationStatus,
} from "../api/applications";
import { getJobOffers } from "../api/job-offers";
import {
  createApplicationEvent,
  getApplicationEvents,
  type ApplicationEventType,
} from "../api/application-events";
import { useState } from "react";

function ApplicationsPage() {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<ApplicationStatus>("DRAFT");
  const [source, setSource] = useState("");
  const [appliedAt, setAppliedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [interviewAt, setInterviewAt] = useState("");
  const [jobOfferId, setJobOfferId] = useState<number | null>(null);
  const [editingApplicationId, setEditingApplicationId] = useState<
    number | null
  >(null);
  const [editStatus, setEditStatus] = useState<ApplicationStatus>("DRAFT");
  const [editSource, setEditSource] = useState("");
  const [editContactName, setEditContactName] = useState("");

  const [editFollowUpAt, setEditFollowUpAt] = useState("");
  const [editInterviewAt, setEditInterviewAt] = useState("");

  const [journalApplicationId, setJournalApplicationId] = useState<
    number | null
  >(null);

  const [eventType, setEventType] = useState<ApplicationEventType>("NOTE");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");

  const jobOffersQuery = useQuery({
    queryKey: ["job-offers"],
    queryFn: getJobOffers,
  });

  const applicationEventsQuery = useQuery({
    queryKey: ["application-events", journalApplicationId],
    queryFn: () => getApplicationEvents(journalApplicationId!),
    enabled: journalApplicationId !== null,
  });

  const createApplicationMutation = useMutation({
    mutationFn: createApplication,
    onSuccess: async () => {
      setStatus("DRAFT");
      setSource("");
      setAppliedAt("");
      setNotes("");
      setContactName("");
      setContactEmail("");
      setFollowUpAt("");
      setInterviewAt("");

      await queryClient.invalidateQueries({
        queryKey: ["applications"],
      });
    },
  });

  const updateApplicationMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: {
        status?: ApplicationStatus;
        source?: string;
        contactName?: string;
        followUpAt?: string;
        interviewAt?: string;
      };
    }) => updateApplication(id, input),
    onSuccess: async () => {
      setEditingApplicationId(null);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["applications"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["follow-ups"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["interviews"],
        }),
      ]);
    },
  });

  const deleteApplicationMutation = useMutation({
    mutationFn: deleteApplication,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["applications"],
      });
    },
  });

  const createApplicationEventMutation = useMutation({
    mutationFn: createApplicationEvent,
    onSuccess: async () => {
      setEventType("NOTE");
      setEventTitle("");
      setEventDescription("");

      await queryClient.invalidateQueries({
        queryKey: ["application-events", journalApplicationId],
      });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (jobOfferId === null) {
      return;
    }

    createApplicationMutation.mutate({
      userId: 1,
      jobOfferId,
      status,
      source: source || undefined,
      appliedAt: appliedAt ? new Date(appliedAt).toISOString() : undefined,
      notes: notes || undefined,
      contactName: contactName || undefined,
      contactEmail: contactEmail || undefined,
      followUpAt: followUpAt ? new Date(followUpAt).toISOString() : undefined,
      interviewAt: interviewAt
        ? new Date(interviewAt).toISOString()
        : undefined,
    });
  }

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
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Nouvelle candidature</h2>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Offre d'emploi
            </span>

            <select
              value={jobOfferId ?? ""}
              onChange={(event) =>
                setJobOfferId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              className="rounded-md border border-gray-300 px-3 py-2"
              required
            >
              <option value="">Sélectionner une offre</option>

              {jobOffersQuery.data?.map((jobOffer) => (
                <option key={jobOffer.id} value={jobOffer.id}>
                  {jobOffer.title} — {jobOffer.company.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Statut</span>

              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ApplicationStatus)
                }
                className="rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="DRAFT">À préparer</option>
                <option value="APPLIED">Envoyée</option>
                <option value="FOLLOW_UP">Relance</option>
                <option value="INTERVIEW">Entretien</option>
                <option value="ACCEPTED">Acceptée</option>
                <option value="REJECTED">Refusée</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Source</span>

              <input
                type="text"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="France Travail, LinkedIn..."
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Date de candidature
              </span>
              <input
                type="date"
                value={appliedAt}
                onChange={(event) => setAppliedAt(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Nom du contact
              </span>
              <input
                type="text"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Email du contact
              </span>
              <input
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Date de relance
              </span>
              <input
                type="date"
                value={followUpAt}
                onChange={(event) => setFollowUpAt(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Date d'entretien
              </span>
              <input
                type="datetime-local"
                value={interviewAt}
                onChange={(event) => setInterviewAt(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={createApplicationMutation.isPending}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {createApplicationMutation.isPending
              ? "Création..."
              : "Créer la candidature"}
          </button>

          {createApplicationMutation.isError && (
            <p className="mt-3 text-sm text-red-600">
              Impossible de créer la candidature.
            </p>
          )}
        </form>
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
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingApplicationId(application.id);
                      setEditStatus(application.status);
                      setEditSource(application.source ?? "");
                      setEditContactName(application.contactName ?? "");
                      setEditFollowUpAt(
                        application.followUpAt
                          ? new Date(application.followUpAt)
                              .toISOString()
                              .slice(0, 10)
                          : "",
                      );
                      setEditInterviewAt(
                        application.interviewAt
                          ? new Date(application.interviewAt)
                              .toISOString()
                              .slice(0, 16)
                          : "",
                      );
                    }}
                    className="mt-4 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm(
                        `Supprimer la candidature "${application.jobOffer.title}" ?`,
                      );

                      if (confirmed) {
                        deleteApplicationMutation.mutate(application.id);
                      }
                    }}
                    disabled={deleteApplicationMutation.isPending}
                    className="mt-4 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setJournalApplicationId((current) =>
                        current === application.id ? null : application.id,
                      )
                    }
                    className="mt-4 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Journal
                  </button>
                </div>
                {journalApplicationId === application.id && (
                  <section className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
                    <h3 className="text-lg font-semibold">Journal</h3>

                    {applicationEventsQuery.isPending && (
                      <p className="mt-3 text-sm text-gray-600">
                        Chargement du journal...
                      </p>
                    )}

                    {applicationEventsQuery.isError && (
                      <p className="mt-3 text-sm text-red-600">
                        Impossible de charger le journal.
                      </p>
                    )}

                    {applicationEventsQuery.isSuccess && (
                      <>
                        {applicationEventsQuery.data.length === 0 ? (
                          <p className="mt-3 text-sm text-gray-600">
                            Aucun événement enregistré.
                          </p>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {applicationEventsQuery.data.map((event) => (
                              <article
                                key={event.id}
                                className="rounded-md border border-gray-200 bg-white p-3"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <p className="font-medium">{event.title}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      {event.type}
                                    </p>
                                  </div>

                                  <time className="text-xs text-gray-500">
                                    {new Date(event.occurredAt).toLocaleString(
                                      "fr-FR",
                                    )}
                                  </time>
                                </div>

                                {event.description && (
                                  <p className="mt-2 text-sm text-gray-700">
                                    {event.description}
                                  </p>
                                )}
                              </article>
                            ))}
                          </div>
                        )}

                        <form
                          className="mt-5 space-y-3"
                          onSubmit={(event) => {
                            event.preventDefault();

                            createApplicationEventMutation.mutate({
                              applicationId: application.id,
                              type: eventType,
                              title: eventTitle,
                              description: eventDescription || undefined,
                            });
                          }}
                        >
                          <h4 className="font-medium">Ajouter un événement</h4>

                          <select
                            value={eventType}
                            onChange={(event) =>
                              setEventType(
                                event.target.value as ApplicationEventType,
                              )
                            }
                            className="w-full rounded-md border border-gray-300 px-3 py-2"
                          >
                            <option value="NOTE">Note</option>
                            <option value="STATUS_CHANGED">
                              Changement de statut
                            </option>
                            <option value="APPLICATION_SENT">
                              Candidature envoyée
                            </option>
                            <option value="FOLLOW_UP">Relance</option>
                            <option value="INTERVIEW">Entretien</option>
                            <option value="DOCUMENT_ADDED">
                              Document ajouté
                            </option>
                            <option value="OTHER">Autre</option>
                          </select>

                          <input
                            type="text"
                            value={eventTitle}
                            onChange={(event) =>
                              setEventTitle(event.target.value)
                            }
                            placeholder="Titre de l'événement"
                            required
                            className="w-full rounded-md border border-gray-300 px-3 py-2"
                          />

                          <textarea
                            value={eventDescription}
                            onChange={(event) =>
                              setEventDescription(event.target.value)
                            }
                            placeholder="Description facultative"
                            rows={3}
                            className="w-full rounded-md border border-gray-300 px-3 py-2"
                          />

                          <button
                            type="submit"
                            disabled={createApplicationEventMutation.isPending}
                            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            Ajouter au journal
                          </button>
                        </form>
                      </>
                    )}
                  </section>
                )}
                {editingApplicationId === application.id && (
                  <form
                    className="mt-4 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4"
                    onSubmit={(event) => {
                      event.preventDefault();

                      updateApplicationMutation.mutate({
                        id: application.id,
                        input: {
                          status: editStatus,
                          source: editSource || undefined,
                          contactName: editContactName || undefined,

                          followUpAt: editFollowUpAt
                            ? new Date(editFollowUpAt).toISOString()
                            : undefined,

                          interviewAt: editInterviewAt
                            ? new Date(editInterviewAt).toISOString()
                            : undefined,
                        },
                      });
                    }}
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-700">
                        Statut
                      </span>
                      <select
                        value={editStatus}
                        onChange={(event) =>
                          setEditStatus(event.target.value as ApplicationStatus)
                        }
                        className="rounded-md border border-gray-300 px-3 py-2"
                      >
                        <option value="DRAFT">À préparer</option>
                        <option value="APPLIED">Envoyée</option>
                        <option value="FOLLOW_UP">Relance</option>
                        <option value="INTERVIEW">Entretien</option>
                        <option value="ACCEPTED">Acceptée</option>
                        <option value="REJECTED">Refusée</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-700">
                        Source
                      </span>
                      <input
                        type="text"
                        value={editSource}
                        onChange={(event) => setEditSource(event.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-700">
                        Nom du contact
                      </span>
                      <input
                        type="text"
                        value={editContactName}
                        onChange={(event) =>
                          setEditContactName(event.target.value)
                        }
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-700">
                        Date de relance
                      </span>

                      <input
                        type="date"
                        value={editFollowUpAt}
                        onChange={(event) =>
                          setEditFollowUpAt(event.target.value)
                        }
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-700">
                        Date d'entretien
                      </span>

                      <input
                        type="datetime-local"
                        value={editInterviewAt}
                        onChange={(event) =>
                          setEditInterviewAt(event.target.value)
                        }
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={updateApplicationMutation.isPending}
                        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Enregistrer
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingApplicationId(null)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default ApplicationsPage;
