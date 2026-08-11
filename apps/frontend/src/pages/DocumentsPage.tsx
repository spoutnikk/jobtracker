import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  deleteDocument,
  getDocumentDownloadUrl,
  getDocuments,
  uploadDocument,
  type DocumentType,
} from "../api/documents";
import { getApplications } from "../api/applications";

function DocumentsPage() {
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentType>("OTHER");

  const [applicationId, setApplicationId] = useState<number | null>(null);

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: () => getApplications(),
  });

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: getDocuments,
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: async () => {
      setFile(null);
      setName("");
      setType("OTHER");
      setApplicationId(null);

      await queryClient.invalidateQueries({
        queryKey: ["documents"],
      });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: async () => {
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

  if (documentsQuery.isPending) {
    return (
      <main className="min-h-screen p-8">
        <p>Chargement des documents...</p>
      </main>
    );
  }

  if (documentsQuery.isError) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-red-600">Impossible de charger les documents.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Documents</h1>

        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Ajouter un document</h2>

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

        {documentsQuery.data.length === 0 ? (
          <p className="mt-6 text-gray-600">Aucun document enregistré.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {documentsQuery.data.map((document) => (
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
                  <a
                    href={getDocumentDownloadUrl(document.id)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Télécharger
                  </a>

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
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default DocumentsPage;
