import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApplication,
  deleteApplication,
  getApplications,
  type Application,
  updateApplication,
} from "../api/applications";
import {
  createApplicationEvent,
  getApplicationEvents,
} from "../api/application-events";
import { getJobOffers, type JobOffer } from "../api/job-offers";
import { renderWithProviders } from "../test/renderWithProviders";
import ApplicationsPage from "./ApplicationsPage";

vi.mock("../api/applications", () => ({
  createApplication: vi.fn(),
  deleteApplication: vi.fn(),
  getApplications: vi.fn(),
  updateApplication: vi.fn(),
}));

vi.mock("../api/job-offers", () => ({
  getJobOffers: vi.fn(),
}));

vi.mock("../api/application-events", () => ({
  createApplicationEvent: vi.fn(),
  getApplicationEvents: vi.fn(),
}));

const company = {
  id: 1,
  name: "Acme",
  website: "https://acme.example.com",
  city: "Paris",
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
};

const jobOffer: JobOffer = {
  id: 10,
  title: "Développeur React",
  companyId: company.id,
  url: "https://example.com/jobs/react",
  description: "Développer une application React moderne.",
  location: "Paris",
  contractType: "CDI",
  salary: "50 000 €",
  publishedAt: "2026-08-10T08:00:00.000Z",
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
  company,
};

const application: Application = {
  id: 100,
  status: "APPLIED",
  appliedAt: "2026-08-12T00:00:00.000Z",
  source: "LinkedIn",
  notes: "Candidature prioritaire",
  contactName: "Alice Martin",
  contactEmail: "alice@example.com",
  followUpAt: null,
  interviewAt: null,
  createdAt: "2026-08-12T08:00:00.000Z",
  updatedAt: "2026-08-12T08:00:00.000Z",
  userId: 1,
  jobOfferId: jobOffer.id,
  jobOffer,
};

describe("ApplicationsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getApplications).mockResolvedValue([application]);
    vi.mocked(getJobOffers).mockResolvedValue([jobOffer]);
    vi.mocked(getApplicationEvents).mockResolvedValue([]);
    vi.mocked(createApplication).mockResolvedValue(application);
    vi.mocked(updateApplication).mockResolvedValue(application);
    vi.mocked(deleteApplication).mockResolvedValue(application);
    vi.mocked(createApplicationEvent).mockResolvedValue({
      id: 1,
      type: "NOTE",
      title: "Note",
      description: null,
      occurredAt: "2026-08-12T08:00:00.000Z",
      createdAt: "2026-08-12T08:00:00.000Z",
      applicationId: application.id,
    });
  });

  it("renders an existing application", async () => {
    renderWithProviders(<ApplicationsPage />);

    const offerHeading = await screen.findByRole("heading", {
      name: jobOffer.title,
    });
    const applicationCard = offerHeading.closest("article");

    expect(applicationCard).not.toBeNull();

    if (!applicationCard) {
      throw new Error("Application card not found");
    }

    const card = within(applicationCard);

    expect(card.getByText(company.name)).toBeInTheDocument();
    expect(card.getByText(application.status)).toBeInTheDocument();
    expect(
      card.getByText(`Localisation : ${jobOffer.location}`),
    ).toBeInTheDocument();
    expect(
      card.getByText(`Contrat : ${jobOffer.contractType}`),
    ).toBeInTheDocument();
    expect(
      card.getByText(`Source : ${application.source}`),
    ).toBeInTheDocument();
    expect(
      card.getByText(`Contact : ${application.contactName}`),
    ).toBeInTheDocument();
  });

  it("renders an empty state", async () => {
    vi.mocked(getApplications).mockResolvedValue([]);

    renderWithProviders(<ApplicationsPage />);

    expect(
      await screen.findByText("Aucune candidature enregistrée."),
    ).toBeInTheDocument();
  });

  it("renders a loading error", async () => {
    vi.mocked(getApplications).mockRejectedValue(new Error("Load failed"));

    renderWithProviders(<ApplicationsPage />);

    expect(
      await screen.findByText("Impossible de charger les candidatures."),
    ).toBeInTheDocument();
  });

  it("creates an application with the selected job offer", async () => {
    vi.mocked(getApplications).mockResolvedValue([]);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<ApplicationsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByRole("heading", { name: "Nouvelle candidature" });
    await user.selectOptions(
      screen.getByLabelText("Offre d'emploi"),
      String(jobOffer.id),
    );
    await user.selectOptions(screen.getByLabelText("Statut"), "APPLIED");
    await user.type(screen.getByLabelText("Source"), "LinkedIn");
    await user.type(screen.getByLabelText("Date de candidature"), "2026-08-12");
    await user.click(
      screen.getByRole("button", { name: "Créer la candidature" }),
    );

    await waitFor(() => {
      expect(createApplication).toHaveBeenCalledTimes(1);
    });
    const [createInput] = vi.mocked(createApplication).mock.calls[0];

    expect(createInput).toEqual({
      userId: 1,
      jobOfferId: jobOffer.id,
      status: "APPLIED",
      source: "LinkedIn",
      appliedAt: "2026-08-12T00:00:00.000Z",
      notes: undefined,
      contactName: undefined,
      contactEmail: undefined,
      followUpAt: undefined,
      interviewAt: undefined,
    });
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["applications"],
      });
    });
  });

  it("updates the application status", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<ApplicationsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const editForm = screen
      .getByRole("button", { name: "Annuler" })
      .closest("form");

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);
    await user.selectOptions(edit.getByLabelText("Statut"), "ACCEPTED");
    await user.click(edit.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(updateApplication).toHaveBeenCalledTimes(1);
    });
    const [updatedId, updateInput] = vi.mocked(updateApplication).mock.calls[0];

    expect(updatedId).toBe(application.id);
    expect(updateInput).toEqual({
      status: "ACCEPTED",
      source: application.source,
      contactName: application.contactName,
      followUpAt: undefined,
      interviewAt: undefined,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["applications"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["follow-ups"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["interviews"],
    });
  });

  it("plans a follow-up date", async () => {
    const user = userEvent.setup();

    renderWithProviders(<ApplicationsPage />);

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const editForm = screen
      .getByRole("button", { name: "Annuler" })
      .closest("form");

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);
    await user.type(edit.getByLabelText("Date de relance"), "2026-08-20");
    await user.click(edit.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(updateApplication).toHaveBeenCalledTimes(1);
    });
    const [updatedId, updateInput] = vi.mocked(updateApplication).mock.calls[0];

    expect(updatedId).toBe(application.id);
    expect(updateInput).toEqual({
      status: application.status,
      source: application.source,
      contactName: application.contactName,
      followUpAt: "2026-08-20T00:00:00.000Z",
      interviewAt: undefined,
    });
  });

  it("deletes an application after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<ApplicationsPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      `Supprimer la candidature "${jobOffer.title}" ?`,
    );
    await waitFor(() => {
      expect(deleteApplication).toHaveBeenCalledTimes(1);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["applications"],
      });
    });
    const [deletedId] = vi.mocked(deleteApplication).mock.calls[0];

    expect(deletedId).toBe(application.id);
  });
});
