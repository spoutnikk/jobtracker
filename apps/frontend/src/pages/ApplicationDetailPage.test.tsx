import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getApplication,
  updateApplication,
  type Application,
} from "../api/applications";
import {
  getApplicationEvents,
  type ApplicationEvent,
} from "../api/application-events";
import {
  downloadDocument,
  getAllDocuments,
  getDocumentPreview,
  type Document,
} from "../api/documents";
import { renderWithProviders } from "../test/renderWithProviders";
import ApplicationDetailPage from "./ApplicationDetailPage";

vi.mock("../api/applications", () => ({
  getApplication: vi.fn(),
  updateApplication: vi.fn(),
}));

vi.mock("../api/application-events", () => ({
  getApplicationEvents: vi.fn(),
}));

vi.mock("../api/documents", () => ({
  canPreviewDocument: vi.fn(
    (mimeType: string) =>
      mimeType === "application/pdf" || mimeType === "text/plain",
  ),
  downloadDocument: vi.fn(),
  getAllDocuments: vi.fn(),
  getDocumentPreview: vi.fn(),
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
    vi.mocked(updateApplication).mockResolvedValue(application);
    vi.mocked(getApplicationEvents).mockResolvedValue([]);
    vi.mocked(getAllDocuments).mockResolvedValue([]);
    vi.mocked(downloadDocument).mockResolvedValue(undefined);
    vi.mocked(getDocumentPreview).mockResolvedValue(
      new Blob(["preview"], { type: "application/pdf" }),
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
    expect(within(historySection!).getByRole("status")).toHaveTextContent(
      "Chargement de l'historique...",
    );
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de charger l'historique.",
    );
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

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Chargement des documents...",
    );
    expect(
      screen.getByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Candidature créée")).toBeInTheDocument();
  });

  it("previews an associated PDF through the authenticated API", async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:detail-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.mocked(getAllDocuments).mockResolvedValue([document]);

    renderDetail();
    await screen.findByRole("heading", { name: "Développeur React" });

    await user.click(
      screen.getByRole("button", { name: `Aperçu ${document.name}` }),
    );

    await waitFor(() => {
      expect(getDocumentPreview).toHaveBeenCalledWith(document.id);
    });

    expect(
      screen.getByRole("dialog", { name: `Aperçu de ${document.name}` }),
    ).toBeInTheDocument();
    expect(screen.getByTitle(`Aperçu de ${document.name}`)).toHaveAttribute(
      "src",
      "blob:detail-preview",
    );
    expect(window.document.body).toHaveStyle({ overflow: "hidden" });

    await user.keyboard("{Escape}");

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:detail-preview");
    expect(
      screen.queryByRole("dialog", { name: `Aperçu de ${document.name}` }),
    ).not.toBeInTheDocument();
    expect(window.document.body).not.toHaveStyle({ overflow: "hidden" });
  });

  it("renders associated documents and downloads them through the API", async () => {
    const user = userEvent.setup();
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

    await user.click(
      within(documentsSection!).getByRole("button", {
        name: "Télécharger CV Bruno",
      }),
    );

    await waitFor(() => {
      expect(downloadDocument).toHaveBeenCalledWith(
        document.id,
        document.originalName,
      );
    });
    expect(getAllDocuments).toHaveBeenCalledWith({ applicationId: 42 });
    expect(screen.queryByText(foreignDocument.name)).not.toBeInTheDocument();
  });

  it("shows an error when a document download fails", async () => {
    const user = userEvent.setup();
    vi.mocked(getAllDocuments).mockResolvedValue([document]);
    vi.mocked(downloadDocument).mockRejectedValue(new Error("Download failed"));

    renderDetail();

    const documentsSection = (
      await screen.findByRole("heading", { name: "Documents" })
    ).closest("section");

    expect(documentsSection).not.toBeNull();

    await user.click(
      within(documentsSection!).getByRole("button", {
        name: "Télécharger CV Bruno",
      }),
    );

    expect(
      await within(documentsSection!).findByRole("alert"),
    ).toHaveTextContent("Impossible de télécharger le document.");
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de charger les documents.",
    );
    expect(
      screen.getByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Candidature créée")).toBeInTheDocument();
  });

  it("updates the application from the detail page", async () => {
    const user = userEvent.setup();

    vi.mocked(updateApplication).mockResolvedValue({
      ...application,
      status: "ACCEPTED",
      appliedAt: "2026-08-02T00:00:00.000Z",
      source: "France Travail",
      notes: "Candidature mise à jour.",
      contactName: "Grace Hopper",
      contactEmail: "grace@example.com",
      followUpAt: "2026-08-20T00:00:00.000Z",
      interviewAt: "2026-08-21T14:30:00.000Z",
    });

    renderDetail();

    await screen.findByRole("heading", { name: "Développeur React" });

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    await user.selectOptions(screen.getByLabelText("Statut"), "ACCEPTED");

    const appliedAtInput = screen.getByLabelText("Date de candidature");
    await user.clear(appliedAtInput);
    await user.type(appliedAtInput, "2026-08-02");

    const sourceInput = screen.getByLabelText("Source");
    await user.clear(sourceInput);
    await user.type(sourceInput, "France Travail");

    const notesInput = screen.getByLabelText("Notes");
    await user.clear(notesInput);
    await user.type(notesInput, "Candidature mise à jour.");

    const contactNameInput = screen.getByLabelText("Nom du contact");
    await user.clear(contactNameInput);
    await user.type(contactNameInput, "Grace Hopper");

    const contactEmailInput = screen.getByLabelText("Email du contact");
    await user.clear(contactEmailInput);
    await user.type(contactEmailInput, "grace@example.com");

    const followUpInput = screen.getByLabelText("Date de relance");
    await user.clear(followUpInput);
    await user.type(followUpInput, "2026-08-20");

    const interviewInput = screen.getByLabelText("Date d'entretien");
    await user.clear(interviewInput);
    await user.type(interviewInput, "2026-08-21T14:30");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(updateApplication).toHaveBeenCalledTimes(1);
    });

    expect(updateApplication).toHaveBeenCalledWith(42, {
      status: "ACCEPTED",
      appliedAt: expect.any(String),
      source: "France Travail",
      notes: "Candidature mise à jour.",
      contactName: "Grace Hopper",
      contactEmail: "grace@example.com",
      followUpAt: expect.any(String),
      interviewAt: expect.any(String),
    });
    expect(
      screen.getByText("Candidature modifiée avec succès."),
    ).toHaveAttribute("role", "status");
  });
  it("cancels application editing without saving", async () => {
    const user = userEvent.setup();

    renderDetail();

    await screen.findByRole("heading", { name: "Développeur React" });

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    const sourceInput = screen.getByLabelText("Source");
    await user.clear(sourceInput);
    await user.type(sourceInput, "France Travail");

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(updateApplication).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Enregistrer" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
  });

  it("keeps the edit form open when updating fails", async () => {
    const user = userEvent.setup();

    vi.mocked(updateApplication).mockRejectedValue(new Error("Update failed"));

    renderDetail();

    await screen.findByRole("heading", { name: "Développeur React" });

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de modifier la candidature.",
    );

    expect(
      screen.getByRole("button", { name: "Enregistrer" }),
    ).toBeInTheDocument();
  });

  it("refreshes application data and history after a successful update", async () => {
    const user = userEvent.setup();

    renderDetail();

    await screen.findByRole("heading", { name: "Développeur React" });

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(updateApplication).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(getApplicationEvents).toHaveBeenCalledTimes(2);
    });
  });

  it("clears optional application fields explicitly", async () => {
    const user = userEvent.setup();

    vi.mocked(updateApplication).mockResolvedValue({
      ...application,
      appliedAt: null,
      source: null,
      notes: null,
      contactName: null,
      contactEmail: null,
      followUpAt: null,
      interviewAt: null,
    });

    renderDetail();

    await screen.findByRole("heading", { name: "Développeur React" });

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    await user.clear(screen.getByLabelText("Date de candidature"));
    await user.clear(screen.getByLabelText("Source"));
    await user.clear(screen.getByLabelText("Notes"));
    await user.clear(screen.getByLabelText("Nom du contact"));
    await user.clear(screen.getByLabelText("Email du contact"));
    await user.clear(screen.getByLabelText("Date de relance"));
    await user.clear(screen.getByLabelText("Date d'entretien"));

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(updateApplication).toHaveBeenCalledWith(42, {
        status: "INTERVIEW",
        appliedAt: null,
        source: null,
        notes: null,
        contactName: null,
        contactEmail: null,
        followUpAt: null,
        interviewAt: null,
      });
    });
  });
});
