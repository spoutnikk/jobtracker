import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApplications, type Application } from "../api/applications";
import {
  deleteDocument,
  getDocumentDownloadUrl,
  getDocuments,
  type Document,
  uploadDocument,
} from "../api/documents";
import { renderWithProviders } from "../test/renderWithProviders";
import DocumentsPage from "./DocumentsPage";

vi.mock("../api/documents", () => ({
  deleteDocument: vi.fn(),
  getDocumentDownloadUrl: vi.fn(),
  getDocuments: vi.fn(),
  uploadDocument: vi.fn(),
}));

vi.mock("../api/applications", () => ({
  getApplications: vi.fn(),
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

describe("DocumentsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getApplications).mockResolvedValue([application]);
    vi.mocked(getDocuments).mockResolvedValue([document]);
    vi.mocked(uploadDocument).mockResolvedValue(document);
    vi.mocked(deleteDocument).mockResolvedValue(document);
    vi.mocked(getDocumentDownloadUrl).mockImplementation(
      (id) => `http://localhost:3000/documents/${id}/download`,
    );
  });

  it("renders a document and its download link", async () => {
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
    expect(card.getByRole("link", { name: "Télécharger" })).toHaveAttribute(
      "href",
      `http://localhost:3000/documents/${document.id}/download`,
    );
    expect(getDocumentDownloadUrl).toHaveBeenCalledWith(document.id);
  });

  it("renders an empty state", async () => {
    vi.mocked(getDocuments).mockResolvedValue([]);

    renderWithProviders(<DocumentsPage />);

    expect(
      await screen.findByText("Aucun document enregistré."),
    ).toBeInTheDocument();
  });

  it("uploads a document associated with an application", async () => {
    vi.mocked(getDocuments).mockResolvedValue([]);
    const user = userEvent.setup();
    const file = new File(["PDF content"], "cv.pdf", {
      type: "application/pdf",
    });
    const { queryClient } = renderWithProviders(<DocumentsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const formHeading = await screen.findByRole("heading", {
      name: "Ajouter un document",
    });
    const form = formHeading.closest("form");
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
    });
  });

  it("shows an error when upload fails", async () => {
    vi.mocked(getDocuments).mockResolvedValue([]);
    vi.mocked(uploadDocument).mockRejectedValue(new Error("Upload failed"));
    const user = userEvent.setup();
    const file = new File(["PDF content"], "cv.pdf", {
      type: "application/pdf",
    });

    renderWithProviders(<DocumentsPage />);

    const nameInput = await screen.findByLabelText("Nom");
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<DocumentsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      `Supprimer le document "${document.name}" ?`,
    );
    await waitFor(() => {
      expect(deleteDocument).toHaveBeenCalledTimes(1);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["documents"],
      });
    });
    const [deletedId] = vi.mocked(deleteDocument).mock.calls[0];

    expect(deletedId).toBe(document.id);
  });

  it("keeps the document when deletion fails", async () => {
    vi.mocked(deleteDocument).mockRejectedValue(new Error("Delete failed"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<DocumentsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    await waitFor(() => {
      expect(deleteDocument).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Supprimer" })).toBeEnabled();
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: document.name }),
    ).toBeInTheDocument();
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: ["documents"],
    });
  });
});
