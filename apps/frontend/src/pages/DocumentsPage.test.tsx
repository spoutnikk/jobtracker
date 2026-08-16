import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAllApplications, type Application } from "../api/applications";
import {
  deleteDocument,
  downloadDocument,
  getDocumentPreview,
  getDocuments,
  type Document,
  type PaginatedDocuments,
  uploadDocument,
} from "../api/documents";
import { renderWithProviders } from "../test/renderWithProviders";
import DocumentsPage from "./DocumentsPage";

vi.mock("../api/documents", () => ({
  canPreviewDocument: vi.fn(
    (mimeType: string) =>
      mimeType === "application/pdf" || mimeType === "text/plain",
  ),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
  getDocumentPreview: vi.fn(),
  getDocuments: vi.fn(),
  uploadDocument: vi.fn(),
}));

vi.mock("../api/applications", () => ({
  getAllApplications: vi.fn(),
}));

const application: Application = {
  id: 100,
  status: "APPLIED",
  appliedAt: "2026-08-12T00:00:00.000Z",
  source: "LinkedIn",
  notes: null,
  contactName: null,
  contactEmail: null,
  followUpAt: null,
  interviewAt: null,
  createdAt: "2026-08-12T08:00:00.000Z",
  updatedAt: "2026-08-12T08:00:00.000Z",
  userId: 1,
  jobOfferId: 10,
  jobOffer: {
    id: 10,
    title: "Développeur React",
    url: null,
    description: null,
    location: "Paris",
    contractType: "CDI",
    salary: null,
    publishedAt: null,
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T08:00:00.000Z",
    companyId: 1,
    company: {
      id: 1,
      name: "Acme",
      website: null,
      city: "Paris",
      createdAt: "2026-08-11T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z",
    },
  },
};

const applicationFromNextPage: Application = {
  ...application,
  id: 151,
  jobOfferId: 11,
  jobOffer: {
    ...application.jobOffer,
    id: 11,
    title: "Développeur TypeScript",
  },
};

const document: Document = {
  id: 1,
  name: "CV principal",
  originalName: "cv-bruno.pdf",
  mimeType: "application/pdf",
  size: 2048,
  path: "/uploads/cv-bruno.pdf",
  type: "CV",
  createdAt: "2026-08-12T08:00:00.000Z",
  updatedAt: "2026-08-12T08:00:00.000Z",
  applicationId: application.id,
  application: {
    id: application.id,
    jobOffer: {
      id: application.jobOffer.id,
      title: application.jobOffer.title,
      company: {
        id: application.jobOffer.company.id,
        name: application.jobOffer.company.name,
      },
    },
  },
};

function paginatedDocuments(
  items: Document[],
  overrides: Partial<PaginatedDocuments> = {},
): PaginatedDocuments {
  return {
    items,
    page: 1,
    pageSize: 10,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
    ...overrides,
  };
}

describe("DocumentsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getAllApplications).mockResolvedValue([application]);
    vi.mocked(getDocuments).mockResolvedValue(paginatedDocuments([document]));
    vi.mocked(uploadDocument).mockResolvedValue(document);
    vi.mocked(deleteDocument).mockResolvedValue(document);
    vi.mocked(downloadDocument).mockResolvedValue(undefined);
    vi.mocked(getDocumentPreview).mockResolvedValue(
      new Blob(["preview"], { type: "application/pdf" }),
    );
  });

  it("previews a PDF through the authenticated API", async () => {
    const user = userEvent.setup();
    const createObjectUrlSpy = vi.fn(() => "blob:document-preview");
    const revokeObjectUrlSpy = vi.fn();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrlSpy,
    });

    renderWithProviders(<DocumentsPage />);

    const documentHeading = await screen.findByRole("heading", {
      name: document.name,
    });
    const documentCard = documentHeading.closest("article");

    if (!documentCard) {
      throw new Error("Document card not found");
    }

    await user.click(
      within(documentCard).getByRole("button", { name: "Aperçu" }),
    );

    await waitFor(() => {
      expect(getDocumentPreview).toHaveBeenCalledWith(document.id);
    });

    expect(
      await screen.findByRole("dialog", { name: `Aperçu de ${document.name}` }),
    ).toBeInTheDocument();
    expect(screen.getByTitle(`Aperçu de ${document.name}`)).toHaveAttribute(
      "src",
      "blob:document-preview",
    );
    expect(window.document.body).toHaveStyle({ overflow: "hidden" });
    expect(
      screen.getByRole("button", { name: "Ouvrir dans un nouvel onglet" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:document-preview");
    expect(
      screen.queryByRole("dialog", { name: `Aperçu de ${document.name}` }),
    ).not.toBeInTheDocument();
    expect(window.document.body).not.toHaveStyle({ overflow: "hidden" });
  });

  it("renders a document and downloads it through the API", async () => {
    const user = userEvent.setup();

    renderWithProviders(<DocumentsPage />);

    const documentHeading = await screen.findByRole("heading", {
      name: document.name,
    });
    const documentCard = documentHeading.closest("article");

    expect(documentCard).not.toBeNull();

    if (!documentCard) {
      throw new Error("Document card not found");
    }

    const card = within(documentCard);

    expect(card.getByText(document.originalName)).toBeInTheDocument();
    expect(card.getByText(document.type)).toBeInTheDocument();
    expect(card.getByText("Taille : 2.0 Ko")).toBeInTheDocument();
    expect(
      card.getByText(
        `Candidature : ${application.jobOffer.title} — ${application.jobOffer.company.name}`,
      ),
    ).toBeInTheDocument();

    await user.click(card.getByRole("button", { name: "Télécharger" }));

    await waitFor(() => {
      expect(downloadDocument).toHaveBeenCalledWith(
        document.id,
        document.originalName,
      );
    });
  });

  it("shows an error when a document download fails", async () => {
    const user = userEvent.setup();
    vi.mocked(downloadDocument).mockRejectedValue(new Error("Download failed"));

    renderWithProviders(<DocumentsPage />);

    const documentHeading = await screen.findByRole("heading", {
      name: document.name,
    });
    const documentCard = documentHeading.closest("article");

    if (!documentCard) {
      throw new Error("Document card not found");
    }

    await user.click(
      within(documentCard).getByRole("button", { name: "Télécharger" }),
    );

    expect(
      await within(documentCard).findByText(
        "Impossible de télécharger le document.",
      ),
    ).toBeInTheDocument();
  });

  it("renders an empty state", async () => {
    vi.mocked(getDocuments).mockResolvedValue(paginatedDocuments([]));

    renderWithProviders(<DocumentsPage />);

    expect(
      await screen.findByText("Aucun document enregistré."),
    ).toBeInTheDocument();
  });

  it("offers applications collected from every page", async () => {
    vi.mocked(getAllApplications).mockResolvedValue([
      application,
      applicationFromNextPage,
    ]);
    const user = userEvent.setup();

    renderWithProviders(<DocumentsPage />);

    const uploadSection = (
      await screen.findByRole("heading", { name: "Ajouter un document" })
    ).closest("section");

    if (!uploadSection) {
      throw new Error("Upload section not found");
    }

    await user.click(
      within(uploadSection).getByRole("button", {
        name: "Afficher Ajouter un document",
      }),
    );

    const applicationSelect = screen.getByLabelText("Candidature associée");

    expect(
      within(applicationSelect).getByRole("option", {
        name: `${application.jobOffer.title} — ${application.jobOffer.company.name}`,
      }),
    ).toBeInTheDocument();

    expect(
      within(applicationSelect).getByRole("option", {
        name: `${applicationFromNextPage.jobOffer.title} — ${applicationFromNextPage.jobOffer.company.name}`,
      }),
    ).toBeInTheDocument();

    expect(getAllApplications).toHaveBeenCalledTimes(1);
  });

  it("uploads a document associated with an application", async () => {
    vi.mocked(getDocuments).mockResolvedValue(paginatedDocuments([]));

    const user = userEvent.setup();
    const file = new File(["PDF content"], "cv.pdf", {
      type: "application/pdf",
    });

    const { queryClient } = renderWithProviders(<DocumentsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const formHeading = await screen.findByRole("heading", {
      name: "Ajouter un document",
    });

    const uploadSection = formHeading.closest("section");

    if (!uploadSection) {
      throw new Error("Upload section not found");
    }

    expect(screen.getByLabelText("Nom")).not.toBeVisible();

    await user.click(
      within(uploadSection).getByRole("button", {
        name: "Afficher Ajouter un document",
      }),
    );

    const form = screen
      .getByRole("button", { name: "Ajouter le document" })
      .closest("form");

    const fileInput = screen.getByLabelText<HTMLInputElement>("Fichier");

    expect(form).not.toBeNull();

    if (!form) {
      throw new Error("Upload form not found");
    }

    await user.type(screen.getByLabelText("Nom"), "CV candidature");
    await user.selectOptions(screen.getByLabelText("Type"), "CV");
    await user.upload(fileInput, file);

    expect(fileInput.files).toHaveLength(1);
    expect(fileInput.files?.[0]).toBe(file);

    await user.click(
      within(uploadSection).getByRole("button", {
        name: "Masquer Ajouter un document",
      }),
    );

    await user.click(
      within(uploadSection).getByRole("button", {
        name: "Afficher Ajouter un document",
      }),
    );

    expect(fileInput.files?.[0]).toBe(file);

    await user.selectOptions(
      screen.getByLabelText("Candidature associée"),
      String(application.id),
    );

    fireEvent.submit(form);

    await waitFor(() => {
      expect(uploadDocument).toHaveBeenCalledTimes(1);
    });

    const [uploadInput] = vi.mocked(uploadDocument).mock.calls[0];

    expect(uploadInput).toEqual({
      file,
      name: "CV candidature",
      type: "CV",
      applicationId: application.id,
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Nom")).toHaveValue("");
      expect(screen.getByLabelText("Type")).toHaveValue("OTHER");
      expect(screen.getByLabelText("Candidature associée")).toHaveValue("");

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["documents"],
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["application-events", application.id],
      });
    });
    expect(screen.getByText("Document ajouté avec succès.")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("does not invalidate application events when uploading without an application", async () => {
    vi.mocked(getDocuments).mockResolvedValue(paginatedDocuments([]));

    const documentWithoutApplication: Document = {
      ...document,
      applicationId: null,
      application: null,
    };

    vi.mocked(uploadDocument).mockResolvedValue(documentWithoutApplication);

    const user = userEvent.setup();
    const file = new File(["PDF content"], "document.pdf", {
      type: "application/pdf",
    });

    const { queryClient } = renderWithProviders(<DocumentsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const uploadSection = (
      await screen.findByRole("heading", { name: "Ajouter un document" })
    ).closest("section");

    if (!uploadSection) {
      throw new Error("Upload section not found");
    }

    await user.click(
      within(uploadSection).getByRole("button", {
        name: "Afficher Ajouter un document",
      }),
    );

    const form = screen
      .getByRole("button", { name: "Ajouter le document" })
      .closest("form");

    if (!form) {
      throw new Error("Upload form not found");
    }

    const fileInput = screen.getByLabelText<HTMLInputElement>("Fichier");

    await user.type(screen.getByLabelText("Nom"), "Document libre");
    await user.upload(fileInput, file);

    fireEvent.submit(form);

    await waitFor(() => {
      expect(uploadDocument).toHaveBeenCalledTimes(1);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["documents"],
      });
    });

    const [uploadInput] = vi.mocked(uploadDocument).mock.calls[0];

    expect(uploadInput).toEqual({
      file,
      name: "Document libre",
      type: "OTHER",
      applicationId: undefined,
    });

    const invalidatedQueryKeys = invalidateQueriesSpy.mock.calls
      .map(([filters]) => filters?.queryKey)
      .filter((queryKey) => queryKey !== undefined);

    const applicationEventsInvalidation = invalidatedQueryKeys.find(
      (queryKey) =>
        Array.isArray(queryKey) && queryKey[0] === "application-events",
    );

    expect(applicationEventsInvalidation).toBeUndefined();
  });

  it("shows an error when upload fails", async () => {
    vi.mocked(getDocuments).mockResolvedValue(paginatedDocuments([]));
    vi.mocked(uploadDocument).mockRejectedValue(new Error("Upload failed"));

    const user = userEvent.setup();
    const file = new File(["PDF content"], "cv.pdf", {
      type: "application/pdf",
    });

    renderWithProviders(<DocumentsPage />);

    const uploadSection = (
      await screen.findByRole("heading", { name: "Ajouter un document" })
    ).closest("section");

    if (!uploadSection) {
      throw new Error("Upload section not found");
    }

    await user.click(
      within(uploadSection).getByRole("button", {
        name: "Afficher Ajouter un document",
      }),
    );

    const nameInput = screen.getByLabelText("Nom");
    const form = nameInput.closest("form");
    const fileInput = screen.getByLabelText<HTMLInputElement>("Fichier");

    expect(form).not.toBeNull();

    if (!form) {
      throw new Error("Upload form not found");
    }

    await user.type(nameInput, "CV candidature");
    await user.upload(fileInput, file);

    expect(fileInput.files).toHaveLength(1);
    expect(fileInput.files?.[0]).toBe(file);

    fireEvent.submit(form);

    expect(
      await screen.findByText("Impossible d'ajouter le document."),
    ).toBeInTheDocument();

    expect(uploadDocument).toHaveBeenCalledTimes(1);
  });

  it("deletes a document exactly once after confirmation", async () => {
    vi.mocked(deleteDocument)
      .mockResolvedValueOnce(document)
      .mockRejectedValueOnce(new Error("Unexpected second deletion"));
    const user = userEvent.setup();

    const { queryClient } = renderWithProviders(<DocumentsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(
      await screen.findByRole("button", {
        name: "Supprimer",
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Confirmer" }));

    await waitFor(() => {
      expect(deleteDocument).toHaveBeenCalledTimes(1);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["documents"],
      });
    });

    const [deletedId] = vi.mocked(deleteDocument).mock.calls[0];

    expect(deletedId).toBe(document.id);
    expect(screen.getByText("Document supprimé avec succès.")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("keeps the document when deletion fails", async () => {
    vi.mocked(deleteDocument).mockRejectedValue(new Error("Delete failed"));
    const user = userEvent.setup();

    const { queryClient } = renderWithProviders(<DocumentsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(
      await screen.findByRole("button", {
        name: "Supprimer",
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Confirmer" }));

    await waitFor(() => {
      expect(deleteDocument).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Supprimer" })).toBeEnabled();
    });

    expect(
      screen.getByRole("heading", {
        name: document.name,
      }),
    ).toBeInTheDocument();

    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: ["documents"],
    });
  });
  it("sends default pagination and sorting parameters", async () => {
    renderWithProviders(<DocumentsPage />);

    await screen.findByRole("heading", {
      name: document.name,
    });

    expect(getDocuments).toHaveBeenCalledWith({
      search: undefined,
      type: undefined,
      applicationId: undefined,
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("updates search, type and application filters and resets pagination", async () => {
    vi.mocked(getAllApplications).mockResolvedValue([
      application,
      applicationFromNextPage,
    ]);

    vi.mocked(getDocuments).mockResolvedValue(
      paginatedDocuments([document], {
        page: 2,
        pageSize: 10,
        total: 20,
        totalPages: 2,
      }),
    );

    const user = userEvent.setup();

    renderWithProviders(<DocumentsPage />);

    await screen.findByRole("heading", {
      name: document.name,
    });

    await user.click(
      screen.getByRole("button", {
        name: "Suivant",
      }),
    );

    fireEvent.change(screen.getByLabelText("Recherche"), {
      target: {
        value: "react",
      },
    });

    await user.selectOptions(screen.getByLabelText("Filtrer par type"), "CV");

    await user.selectOptions(
      screen.getByLabelText("Filtrer par candidature"),
      String(application.id),
    );

    await waitFor(() => {
      expect(getDocuments).toHaveBeenCalledWith({
        search: "react",
        type: "CV",
        applicationId: application.id,
        page: 1,
        pageSize: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
    });
  });

  it("updates sorting, page size and pagination boundaries", async () => {
    vi.mocked(getDocuments).mockImplementation(async (filters) => {
      const page = filters?.page ?? 1;
      const pageSize = filters?.pageSize ?? 10;

      return paginatedDocuments([document], {
        page,
        pageSize,
        total: 51,
        totalPages: Math.ceil(51 / pageSize),
      });
    });

    const user = userEvent.setup();

    renderWithProviders(<DocumentsPage />);

    const previousButton = await screen.findByRole("button", {
      name: "Précédent",
    });

    const nextButton = screen.getByRole("button", {
      name: "Suivant",
    });

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    await user.selectOptions(screen.getByLabelText("Trier par"), "name");
    await user.selectOptions(screen.getByLabelText("Ordre"), "asc");
    await user.selectOptions(screen.getByLabelText("Documents par page"), "25");

    await waitFor(() => {
      expect(getDocuments).toHaveBeenLastCalledWith({
        search: undefined,
        type: undefined,
        applicationId: undefined,
        page: 1,
        pageSize: 25,
        sortBy: "name",
        sortOrder: "asc",
      });
    });

    await user.click(
      screen.getByRole("button", {
        name: "Suivant",
      }),
    );

    await waitFor(() => {
      expect(getDocuments).toHaveBeenCalledWith({
        search: undefined,
        type: undefined,
        applicationId: undefined,
        page: 2,
        pageSize: 25,
        sortBy: "name",
        sortOrder: "asc",
      });
    });

    expect(
      screen.getByRole("button", {
        name: "Précédent",
      }),
    ).toBeEnabled();
  });

  it("resets all document filters to their default values", async () => {
    vi.mocked(getAllApplications).mockResolvedValue([application]);

    const user = userEvent.setup();

    renderWithProviders(<DocumentsPage />);

    await screen.findByRole("heading", {
      name: document.name,
    });

    await user.type(screen.getByLabelText("Recherche"), "react");

    await user.selectOptions(screen.getByLabelText("Filtrer par type"), "CV");

    await user.selectOptions(
      screen.getByLabelText("Filtrer par candidature"),
      String(application.id),
    );

    await user.selectOptions(screen.getByLabelText("Trier par"), "name");
    await user.selectOptions(screen.getByLabelText("Ordre"), "asc");

    await user.selectOptions(screen.getByLabelText("Documents par page"), "25");

    await user.click(
      screen.getByRole("button", {
        name: "Réinitialiser les filtres",
      }),
    );

    expect(screen.getByLabelText("Recherche")).toHaveValue("");
    expect(screen.getByLabelText("Filtrer par type")).toHaveValue("");
    expect(screen.getByLabelText("Filtrer par candidature")).toHaveValue("");
    expect(screen.getByLabelText("Trier par")).toHaveValue("createdAt");
    expect(screen.getByLabelText("Ordre")).toHaveValue("desc");
    expect(screen.getByLabelText("Documents par page")).toHaveValue("10");

    await waitFor(() => {
      expect(getDocuments).toHaveBeenCalledWith({
        search: undefined,
        type: undefined,
        applicationId: undefined,
        page: 1,
        pageSize: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
    });
  });
});
