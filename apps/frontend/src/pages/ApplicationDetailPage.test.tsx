import { screen, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApplication, type Application } from "../api/applications";
import {
  getApplicationEvents,
  type ApplicationEvent,
} from "../api/application-events";
import {
  getDocumentDownloadUrl,
  getAllDocuments,
  type Document,
} from "../api/documents";
import { renderWithProviders } from "../test/renderWithProviders";
import ApplicationDetailPage from "./ApplicationDetailPage";

vi.mock("../api/applications", () => ({
  getApplication: vi.fn(),
}));

vi.mock("../api/application-events", () => ({
  getApplicationEvents: vi.fn(),
}));

vi.mock("../api/documents", () => ({
  getAllDocuments: vi.fn(),
  getDocumentDownloadUrl: vi.fn((id: number) => `/documents/${id}/download`),
}));

const events: ApplicationEvent[] = [
  {
    id: 1,
    type: "CREATED",
    title: "Candidature créée",
    description: null,
    occurredAt: "2026-08-10T08:00:00.000Z",
    createdAt: "2026-08-10T08:00:00.000Z",
    applicationId: 42,
  },
  {
    id: 2,
    type: "STATUS_CHANGED",
    title: "Statut modifié",
    description: "Passage au statut entretien.",
    occurredAt: "2026-08-12T12:30:00.000Z",
    createdAt: "2026-08-12T12:30:00.000Z",
    applicationId: 42,
  },
];

const document: Document = {
  id: 5,
  name: "CV Bruno",
  originalName: "cv-bruno.pdf",
  mimeType: "application/pdf",
  size: 2048,
  path: "/uploads/cv-bruno.pdf",
  type: "CV",
  createdAt: "2026-08-11T10:15:00.000Z",
  updatedAt: "2026-08-11T10:15:00.000Z",
  applicationId: 42,
  application: null,
};

const foreignDocument: Document = {
  ...document,
  id: 6,
  name: "Document d'une autre candidature",
  applicationId: 99,
};

const application: Application = {
  id: 42,
  status: "INTERVIEW",
  appliedAt: "2026-08-01T08:00:00.000Z",
  source: "LinkedIn",
  notes: "Préparer les questions techniques.",
  contactName: "Ada Lovelace",
  contactEmail: "ada@acme.example.com",
  followUpAt: "2026-08-12T08:30:00.000Z",
  interviewAt: "2026-08-14T09:00:00.000Z",
  createdAt: "2026-07-30T10:00:00.000Z",
  updatedAt: "2026-08-10T11:00:00.000Z",
  userId: 7,
  jobOfferId: 10,
  jobOffer: {
    id: 10,
    title: "Développeur React",
    url: "https://jobs.example.com/react",
    description: "Construire une application accessible.",
    location: "Paris",
    contractType: "CDI",
    salary: "50 000 €",
    publishedAt: "2026-07-20T08:00:00.000Z",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-21T08:00:00.000Z",
    companyId: 3,
    company: {
      id: 3,
      name: "Acme",
      website: "https://acme.example.com",
      city: "Paris",
      createdAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z",
    },
  },
};

function renderDetail(path = "/applications/42") {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/applications/:id" element={<ApplicationDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function axiosError(status: number) {
  return new AxiosError(
    "Backend message must not drive the UI",
    "ERR_BAD_RESPONSE",
    undefined,
    undefined,
    {
      data: {},
      status,
      statusText: "Error",
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    },
  );
}

describe("ApplicationDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getApplication).mockResolvedValue(application);
    vi.mocked(getApplicationEvents).mockResolvedValue([]);
    vi.mocked(getAllDocuments).mockResolvedValue([]);
    vi.mocked(getDocumentDownloadUrl).mockImplementation(
      (documentId) => `http://localhost:3000/documents/${documentId}/download`,
    );
  });

  it("renders the loading state", () => {
    vi.mocked(getApplication).mockImplementation(
      () => new Promise<Application>(() => undefined),
    );

    renderDetail();

    expect(
      screen.getByText("Chargement de la candidature..."),
    ).toBeInTheDocument();
  });

  it("renders the complete application detail", async () => {
    renderDetail();

    expect(
      await screen.findByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Acme")).toHaveLength(2);

    const pageHeader = screen
      .getByRole("heading", { name: "Développeur React" })
      .closest("header");

    const applicationSection = screen
      .getByRole("heading", { name: "Candidature" })
      .closest("section");
    const offerSection = screen
      .getByRole("heading", { name: "Offre" })
      .closest("section");
    const companySection = screen
      .getByRole("heading", { name: "Entreprise" })
      .closest("section");

    expect(applicationSection).not.toBeNull();
    expect(offerSection).not.toBeNull();
    expect(companySection).not.toBeNull();
    expect(pageHeader).not.toBeNull();
    expect(within(pageHeader!).getByText("Entretien")).toBeInTheDocument();
    expect(
      within(applicationSection!).getByText("LinkedIn"),
    ).toBeInTheDocument();
    expect(
      within(applicationSection!).getByText("Ada Lovelace"),
    ).toBeInTheDocument();
    expect(
      within(applicationSection!).getByText("ada@acme.example.com"),
    ).toBeInTheDocument();
    expect(
      within(applicationSection!).getByText(
        "Préparer les questions techniques.",
      ),
    ).toBeInTheDocument();
    expect(
      within(applicationSection!).getByText(/1 août 2026/),
    ).toBeInTheDocument();
    expect(
      within(applicationSection!).getByText(/12 août 2026/),
    ).toBeInTheDocument();
    expect(
      within(applicationSection!).getByText(/14 août 2026/),
    ).toBeInTheDocument();
    expect(within(offerSection!).getByText("Paris")).toBeInTheDocument();
    expect(within(offerSection!).getByText("CDI")).toBeInTheDocument();
    expect(within(offerSection!).getByText("50 000 €")).toBeInTheDocument();
    expect(
      within(offerSection!).getByText("Construire une application accessible."),
    ).toBeInTheDocument();
    expect(within(companySection!).getByText("Paris")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Voir l'offre" })).toHaveAttribute(
      "href",
      application.jobOffer.url,
    );
    expect(screen.getByRole("link", { name: "Voir l'offre" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "Voir l'offre" })).toHaveAttribute(
      "rel",
      "noreferrer",
    );
    expect(
      screen.getByRole("link", { name: "Site de l'entreprise" }),
    ).toHaveAttribute("href", application.jobOffer.company.website);
    expect(
      screen.getByRole("link", { name: "Site de l'entreprise" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "Site de l'entreprise" }),
    ).toHaveAttribute("rel", "noreferrer");
    expect(
      screen.getByRole("link", { name: "Retour aux candidatures" }),
    ).toHaveAttribute("href", "/applications");
    expect(getApplication).toHaveBeenCalledWith(42);
  });

  it("hides absent optional fields", async () => {
    vi.mocked(getApplication).mockResolvedValue({
      ...application,
      appliedAt: null,
      source: null,
      notes: null,
      contactName: null,
      contactEmail: null,
      followUpAt: null,
      interviewAt: null,
      jobOffer: {
        ...application.jobOffer,
        url: null,
        description: null,
        location: null,
        contractType: null,
        salary: null,
        publishedAt: null,
        company: {
          ...application.jobOffer.company,
          website: null,
          city: null,
        },
      },
    });

    renderDetail();
    await screen.findByRole("heading", { name: "Développeur React" });

    expect(screen.queryByText("Source")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Localisation")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Voir l'offre" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Site de l'entreprise" }),
    ).not.toBeInTheDocument();
  });

  it("renders the stable unavailable state for a 404", async () => {
    vi.mocked(getApplication).mockRejectedValue(axiosError(404));

    renderDetail();

    expect(
      await screen.findByText(
        "Cette candidature n'existe pas ou n'est plus disponible.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a generic message for another error", async () => {
    vi.mocked(getApplication).mockRejectedValue(new Error("Network failed"));

    renderDetail();

    expect(
      await screen.findByText("Impossible de charger la candidature."),
    ).toBeInTheDocument();
  });

  it("does not request an invalid application id", () => {
    renderDetail("/applications/not-a-number");

    expect(
      screen.getByText(
        "Cette candidature n'existe pas ou n'est plus disponible.",
      ),
    ).toBeInTheDocument();
    expect(getApplication).not.toHaveBeenCalled();
    expect(getApplicationEvents).not.toHaveBeenCalled();
    expect(getAllDocuments).not.toHaveBeenCalled();
  });

  it("renders the detail while the history is loading", async () => {
    vi.mocked(getApplicationEvents).mockImplementation(
      () => new Promise<ApplicationEvent[]>(() => undefined),
    );

    renderDetail();

    expect(
      await screen.findByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();
    const historySection = screen
      .getByRole("heading", { name: "Historique" })
      .closest("section");

    expect(historySection).not.toBeNull();
    expect(
      within(historySection!).getByText("Chargement de l'historique..."),
    ).toBeInTheDocument();
  });

  it("renders application events in the backend order", async () => {
    vi.mocked(getApplicationEvents).mockResolvedValue(events);

    renderDetail();

    const historyHeading = await screen.findByRole("heading", {
      name: "Historique",
    });
    const historySection = historyHeading.closest("section");

    expect(historySection).not.toBeNull();
    const historyItems = within(historySection!).getAllByRole("listitem");
    expect(historyItems).toHaveLength(2);
    expect(within(historyItems[0]).getByText("Création")).toBeInTheDocument();
    expect(
      within(historyItems[0]).getByText("Candidature créée"),
    ).toBeInTheDocument();
    expect(
      within(historyItems[1]).getByText("Changement de statut"),
    ).toBeInTheDocument();
    expect(
      within(historyItems[1]).getByText("Passage au statut entretien."),
    ).toBeInTheDocument();
    expect(
      within(historyItems[0]).getByText(/10 août 2026/),
    ).toBeInTheDocument();
    expect(
      within(historyItems[1]).getByText(/12 août 2026/),
    ).toBeInTheDocument();
    expect(getApplicationEvents).toHaveBeenCalledWith(42);
  });

  it("renders the empty history state", async () => {
    renderDetail();

    expect(
      await screen.findByText("Aucun événement enregistré."),
    ).toBeInTheDocument();
  });

  it("keeps the detail visible when history loading fails", async () => {
    vi.mocked(getApplicationEvents).mockRejectedValue(
      new Error("History request failed"),
    );

    renderDetail();

    expect(
      await screen.findByText("Impossible de charger l'historique."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();
  });

  it("renders the unavailable history state for a 404", async () => {
    vi.mocked(getApplicationEvents).mockRejectedValue(axiosError(404));

    renderDetail();

    expect(
      await screen.findByText("Historique indisponible."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();
  });

  it("renders the detail and history while documents are loading", async () => {
    vi.mocked(getApplicationEvents).mockResolvedValue(events);
    vi.mocked(getAllDocuments).mockImplementation(
      () => new Promise<Document[]>(() => undefined),
    );

    renderDetail();

    expect(
      await screen.findByText("Chargement des documents..."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Candidature créée")).toBeInTheDocument();
  });

  it("renders associated documents and their download links", async () => {
    vi.mocked(getAllDocuments).mockResolvedValue([document]);

    renderDetail();

    const documentsHeading = await screen.findByRole("heading", {
      name: "Documents",
    });
    const documentsSection = documentsHeading.closest("section");

    expect(documentsSection).not.toBeNull();
    expect(within(documentsSection!).getByText("CV Bruno")).toBeInTheDocument();
    expect(within(documentsSection!).getByText("CV")).toBeInTheDocument();
    expect(
      within(documentsSection!).getByText(/11 août 2026/),
    ).toBeInTheDocument();
    expect(
      within(documentsSection!).getByRole("link", {
        name: "Télécharger CV Bruno",
      }),
    ).toHaveAttribute(
      "href",
      `http://localhost:3000/documents/${document.id}/download`,
    );
    expect(getAllDocuments).toHaveBeenCalledWith({ applicationId: 42 });
    expect(getDocumentDownloadUrl).toHaveBeenCalledWith(document.id);
    expect(screen.queryByText(foreignDocument.name)).not.toBeInTheDocument();
  });

  it("renders the empty documents state", async () => {
    renderDetail();

    expect(
      await screen.findByText("Aucun document associé."),
    ).toBeInTheDocument();
  });

  it("keeps the detail and history visible when documents loading fails", async () => {
    vi.mocked(getApplicationEvents).mockResolvedValue(events);
    vi.mocked(getAllDocuments).mockRejectedValue(
      new Error("Documents request failed"),
    );

    renderDetail();

    expect(
      await screen.findByText("Impossible de charger les documents."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Candidature créée")).toBeInTheDocument();
  });
});
