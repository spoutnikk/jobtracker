import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import {
  deleteDocument,
  canPreviewDocument,
  downloadDocument,
  getDocumentPreview,
  getDocuments,
  uploadDocument,
  type DocumentType,
} from "../api/documents";
import { getAllApplications } from "../api/applications";
import PageShell from "../components/PageShell";
import StatusMessage from "../components/StatusMessage";

function DocumentsPage() {
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

  useEffect(() => {
    if (!preview) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePreview();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [preview]);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentType>("OTHER");

  const [applicationId, setApplicationId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  const [filterApplicationId, setFilterApplicationId] = useState<number | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<
    "createdAt" | "updatedAt" | "name" | "type"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: getAllApplications,
  });

  const documentFilters = {
    search: search.trim() || undefined,
    type: documentType || undefined,
    applicationId: filterApplicationId ?? undefined,
    page,
    pageSize,
    sortBy,
    sortOrder,
  };

  const documentsQuery = useQuery({
    queryKey: ["documents", documentFilters],
    queryFn: () => getDocuments(documentFilters),
    placeholderData: (previousData) => previousData,
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: uploadDocument,
    onMutate: () => {
      setSuccessMessage(null);
    },
    onSuccess: async (_, variables) => {
      setFile(null);
      setName("");
      setType("OTHER");
      setApplicationId(null);
      setSuccessMessage("Document ajouté avec succès.");

      await queryClient.invalidateQueries({
        queryKey: ["documents"],
      });

      if (variables.applicationId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: ["application-events", variables.applicationId],
        });
      }
    },
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

  const deleteDocumentMutation = useMutation({
    mutationFn: deleteDocument,
    onMutate: () => {
      setSuccessMessage(null);
    },
    onSuccess: async () => {
      setSuccessMessage("Document supprimé avec succès.");
      await queryClient.invalidateQueries({
        queryKey: ["documents"],
      });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      return;
    }

    uploadDocumentMutation.mutate({
      file,
      name,
      type,
      applicationId: applicationId ?? undefined,
    });
  }

  if (documentsQuery.isPending && !documentsQuery.data) {
    return (
      <PageShell>
        <p>Chargement des documents...</p>
      </PageShell>
    );
  }

  if (documentsQuery.isError) {
    return (
      <PageShell>
        <p className="text-red-600">Impossible de charger les documents.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1 className="text-3xl font-bold">Documents</h1>
      {successMessage && (
        <StatusMessage variant="success" className="mt-4">
          {successMessage}
        </StatusMessage>
      )}

      <CollapsibleSection title="Ajouter un document" defaultOpen={false}>
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Nom</span>

              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Type</span>

              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as DocumentType)
                }
                className="rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="CV">CV</option>
                <option value="COVER_LETTER">Lettre de motivation</option>
                <option value="JOB_OFFER">Offre d'emploi</option>
                <option value="OTHER">Autre</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Fichier</span>

              <input
                type="file"
                accept=".pdf,.doc,.docx,.odt,.txt"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Candidature associée
              </span>

              <select
                value={applicationId ?? ""}
                onChange={(event) =>
                  setApplicationId(
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                className="rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="">Aucune candidature</option>

                {applicationsQuery.data?.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.jobOffer.title} —{" "}
                    {application.jobOffer.company.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="submit"
            disabled={uploadDocumentMutation.isPending}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {uploadDocumentMutation.isPending
              ? "Téléversement..."
              : "Ajouter le document"}
          </button>

          {uploadDocumentMutation.isError && (
            <p className="mt-3 text-sm text-red-600">
              Impossible d'ajouter le document.
            </p>
          )}
        </form>
      </CollapsibleSection>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Recherche</span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Filtrer par type
            </span>
            <select
              value={documentType}
              onChange={(event) => {
                setDocumentType(event.target.value as DocumentType | "");
                setPage(1);
              }}
              className="rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Tous les types</option>
              <option value="CV">CV</option>
              <option value="COVER_LETTER">Lettre de motivation</option>
              <option value="JOB_OFFER">Offre d'emploi</option>
              <option value="OTHER">Autre</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Filtrer par candidature
            </span>
            <select
              value={filterApplicationId ?? ""}
              onChange={(event) => {
                setFilterApplicationId(
                  event.target.value ? Number(event.target.value) : null,
                );
                setPage(1);
              }}
              className="rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Toutes les candidatures</option>

              {applicationsQuery.data?.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.jobOffer.title} —{" "}
                  {application.jobOffer.company.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Trier par</span>
            <select
              value={sortBy}
              onChange={(event) => {
                setSortBy(
                  event.target.value as
                    "createdAt" | "updatedAt" | "name" | "type",
                );
                setPage(1);
              }}
              className="rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="createdAt">Date de création</option>
              <option value="updatedAt">Date de modification</option>
              <option value="name">Nom</option>
              <option value="type">Type</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Ordre</span>
            <select
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value as "asc" | "desc");
                setPage(1);
              }}
              className="rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="desc">Décroissant</option>
              <option value="asc">Croissant</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Documents par page
            </span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="rounded-md border border-gray-300 px-3 py-2"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            setSearch("");
            setDocumentType("");
            setFilterApplicationId(null);
            setPage(1);
            setPageSize(10);
            setSortBy("createdAt");
            setSortOrder("desc");
          }}
          className="mt-4 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Réinitialiser les filtres
        </button>
      </div>
      {documentsQuery.isFetching && (
        <p className="mt-4 text-sm text-gray-600">
          Mise à jour des documents...
        </p>
      )}
      {documentsQuery.data.items.length === 0 ? (
        <p className="mt-6 text-gray-600">Aucun document enregistré.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {documentsQuery.data.items.map((document) => (
            <article
              key={document.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{document.name}</h2>

                  <p className="mt-1 text-sm text-gray-600">
                    {document.originalName}
                  </p>
                </div>

                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">
                  {document.type}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-gray-600">
                <p>Taille : {(document.size / 1024).toFixed(1)} Ko</p>

                {document.application && (
                  <p>
                    Candidature : {document.application.jobOffer.title} —{" "}
                    {document.application.jobOffer.company.name}
                  </p>
                )}
              </div>

              <div className="mt-4 flex gap-2">
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
                    className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {previewDocumentMutation.isPending &&
                    previewDocumentMutation.variables?.id === document.id
                      ? "Chargement de l'aperçu..."
                      : "Aperçu"}
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
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {downloadDocumentMutation.isPending &&
                  downloadDocumentMutation.variables?.id === document.id
                    ? "Téléchargement..."
                    : "Télécharger"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Supprimer le document "${document.name}" ?`,
                    );

                    if (confirmed) {
                      deleteDocumentMutation.mutate(document.id);
                    }
                  }}
                  disabled={deleteDocumentMutation.isPending}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>

              {previewDocumentMutation.isError &&
                previewDocumentMutation.variables?.id === document.id && (
                  <p className="mt-3 text-sm text-red-600">
                    Impossible d'afficher l'aperçu du document.
                  </p>
                )}

              {downloadDocumentMutation.isError &&
                downloadDocumentMutation.variables?.id === document.id && (
                  <p className="mt-3 text-sm text-red-600">
                    Impossible de télécharger le document.
                  </p>
                )}
            </article>
          ))}
        </div>
      )}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePreview();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Aperçu de ${preview.name}`}
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
          </section>
        </div>
      )}

      {documentsQuery.data.total > 0 && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() =>
              setPage((currentPage) => Math.max(1, currentPage - 1))
            }
            disabled={page <= 1}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Précédent
          </button>

          <p className="text-sm text-gray-600">
            Page {documentsQuery.data.page} sur {documentsQuery.data.totalPages}{" "}
            — {documentsQuery.data.total} document
            {documentsQuery.data.total > 1 ? "s" : ""}
          </p>

          <button
            type="button"
            onClick={() =>
              setPage((currentPage) =>
                Math.min(documentsQuery.data.totalPages, currentPage + 1),
              )
            }
            disabled={page >= documentsQuery.data.totalPages}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Suivant
          </button>
        </div>
      )}
    </PageShell>
  );
}

export default DocumentsPage;
