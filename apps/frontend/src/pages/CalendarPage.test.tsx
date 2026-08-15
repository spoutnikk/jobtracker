import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  getAllApplications,
  getFollowUps,
  getInterviews,
  updateApplication,
  type Application,
} from "../api/applications";
import { renderWithProviders } from "../test/renderWithProviders";
import userEvent from "@testing-library/user-event";
import CalendarPage from "./CalendarPage";

vi.mock("../api/applications", () => ({
  getAllApplications: vi.fn(),
  getFollowUps: vi.fn(),
  getInterviews: vi.fn(),
  updateApplication: vi.fn(),
}));

function createApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 1,
    status: "FOLLOW_UP",
    appliedAt: "2026-08-01T08:00:00.000Z",
    source: null,
    notes: null,
    contactName: null,
    contactEmail: null,
    followUpAt: "2026-08-20T12:00:00.000Z",
    interviewAt: null,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
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
      createdAt: "2026-08-01T08:00:00.000Z",
      updatedAt: "2026-08-01T08:00:00.000Z",
      companyId: 1,
      company: {
        id: 1,
        name: "Acme",
        website: null,
        city: "Paris",
        createdAt: "2026-08-01T08:00:00.000Z",
        updatedAt: "2026-08-01T08:00:00.000Z",
      },
    },
    ...overrides,
  };
}

const followUp = createApplication();
const interview = createApplication({
  id: 2,
  status: "INTERVIEW",
  followUpAt: null,
  interviewAt: "2026-08-22T12:00:00.000Z",
  jobOfferId: 11,
  jobOffer: {
    ...followUp.jobOffer,
    id: 11,
    title: "Développeur TypeScript",
  },
});

function renderCalendar() {
  return renderWithProviders(
    <MemoryRouter>
      <CalendarPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getFollowUps).mockResolvedValue([followUp]);
    vi.mocked(getInterviews).mockResolvedValue([interview]);
    vi.mocked(getAllApplications).mockResolvedValue([followUp, interview]);
    vi.mocked(updateApplication).mockResolvedValue(followUp);
  });

  it("renders upcoming follow-ups and interviews", async () => {
    renderCalendar();

    expect(
      await screen.findByRole("heading", { name: "Calendrier" }),
    ).toBeInTheDocument();

    const followUpCard = screen
      .getByRole("heading", { name: followUp.jobOffer.title })
      .closest("article");
    const interviewCard = screen
      .getByRole("heading", { name: interview.jobOffer.title })
      .closest("article");

    expect(followUpCard).not.toBeNull();
    expect(interviewCard).not.toBeNull();
    expect(
      within(followUpCard!).getByText(/^Relance prévue à /),
    ).toBeInTheDocument();
    expect(within(followUpCard!).getByText("Acme")).toBeInTheDocument();
    expect(
      within(followUpCard!).getByRole("link", {
        name: "Voir la candidature",
      }),
    ).toHaveAttribute("href", `/applications/${followUp.id}`);
    expect(
      within(interviewCard!).getByText(/^Entretien prévu à /),
    ).toBeInTheDocument();
    expect(within(interviewCard!).getByText("Acme")).toBeInTheDocument();
    expect(
      within(interviewCard!).getByRole("link", {
        name: "Voir la candidature",
      }),
    ).toHaveAttribute("href", `/applications/${interview.id}`);
  });

  it("renders the empty calendar state", async () => {
    vi.mocked(getFollowUps).mockResolvedValue([]);
    vi.mocked(getInterviews).mockResolvedValue([]);

    renderCalendar();

    expect(
      await screen.findByText("Aucun événement à venir."),
    ).toBeInTheDocument();
  });

  it("renders the loading state", () => {
    vi.mocked(getFollowUps).mockImplementation(
      () => new Promise<Application[]>(() => undefined),
    );

    renderCalendar();

    expect(screen.getByText("Chargement du calendrier...")).toBeInTheDocument();
  });

  it("renders the error state", async () => {
    vi.mocked(getInterviews).mockRejectedValue(new Error("Request failed"));

    renderCalendar();

    expect(
      await screen.findByText(
        "Impossible de charger les relances ou les entretiens.",
      ),
    ).toBeInTheDocument();
  });

  it("renders all calendar events in chronological order", async () => {
    const laterFollowUp = createApplication({
      id: 3,
      followUpAt: "2026-08-25T09:00:00.000Z",
      jobOfferId: 12,
      jobOffer: {
        ...followUp.jobOffer,
        id: 12,
        title: "Développeur Node.js",
      },
    });

    vi.mocked(getFollowUps).mockResolvedValue([laterFollowUp, followUp]);
    vi.mocked(getInterviews).mockResolvedValue([interview]);

    renderCalendar();

    const eventHeadings = await screen.findAllByRole("heading", {
      level: 3,
    });

    expect(eventHeadings.map((heading) => heading.textContent)).toEqual([
      "Développeur React",
      "Développeur TypeScript",
      "Développeur Node.js",
    ]);
  });

  it("groups events occurring on the same day", async () => {
    const sameDayInterview = createApplication({
      id: 4,
      status: "INTERVIEW",
      followUpAt: null,
      interviewAt: "2026-08-20T15:00:00.000Z",
      jobOfferId: 13,
      jobOffer: {
        ...followUp.jobOffer,
        id: 13,
        title: "Développeur NestJS",
      },
    });

    vi.mocked(getInterviews).mockResolvedValue([sameDayInterview]);

    renderCalendar();

    expect(
      await screen.findByRole("heading", {
        name: /20 août 2026/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Développeur NestJS" }),
    ).toBeInTheDocument();
  });

  it("renders a monthly calendar grid and navigates between months", async () => {
    const user = userEvent.setup();

    renderCalendar();

    expect(
      await screen.findByRole("heading", {
        name: /^août 2026$/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getAllByRole("gridcell")).toHaveLength(42);

    await user.click(
      screen.getByRole("button", {
        name: "Mois suivant",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: /^septembre 2026$/i,
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Mois précédent",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: /^août 2026$/i,
      }),
    ).toBeInTheDocument();
  });

  it("summarizes calendar events by type for each day", async () => {
    const secondFollowUp = createApplication({
      id: 3,
      followUpAt: "2026-08-20T16:00:00.000Z",
      jobOfferId: 12,
      jobOffer: { ...followUp.jobOffer, id: 12, title: "Développeur Node.js" },
    });
    vi.mocked(getFollowUps).mockResolvedValue([followUp, secondFollowUp]);
    renderCalendar();
    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });
    expect(within(august20).getByText("Relance 2")).toBeInTheDocument();
  });

  it("does not display a count for a single event", async () => {
    renderCalendar();
    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });
    expect(within(august20).getByText("Relance")).toBeInTheDocument();
    expect(within(august20).queryByText("Relance 1")).not.toBeInTheDocument();
  });

  it("can hide and show the monthly calendar", async () => {
    const user = userEvent.setup();
    renderCalendar();
    expect(
      await screen.findByRole("grid", { name: /Calendrier août 2026/i }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Masquer le calendrier" }),
    );
    expect(
      screen.queryByRole("grid", { name: /Calendrier août 2026/i }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Afficher le calendrier" }),
    );
    expect(
      screen.getByRole("grid", { name: /Calendrier août 2026/i }),
    ).toBeInTheDocument();
  });

  it("returns to the current month and highlights today", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-13T10:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCalendar();
    expect(
      await screen.findByRole("heading", { name: /^août 2026$/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mois suivant" }));
    expect(
      screen.getByRole("heading", { name: /^septembre 2026$/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aujourd'hui" }));
    expect(
      screen.getByRole("heading", { name: /^août 2026$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: /13 août 2026.*aujourd'hui/i }),
    ).toBeInTheDocument();
  });

  it("shows only future events from the active month plus the next seven days", async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(new Date("2026-08-28T10:00:00.000Z"));

    const pastAugust = createApplication({
      id: 20,
      followUpAt: "2026-08-27T12:00:00.000Z",
      jobOfferId: 120,
      jobOffer: {
        ...followUp.jobOffer,
        id: 120,
        title: "Offre passée août",
      },
    });
    const futureAugust = createApplication({
      id: 21,
      followUpAt: "2026-08-30T12:00:00.000Z",
      jobOfferId: 121,
      jobOffer: {
        ...followUp.jobOffer,
        id: 121,
        title: "Offre août à venir",
      },
    });
    const nearSeptember = createApplication({
      id: 22,
      followUpAt: "2026-09-02T12:00:00.000Z",
      jobOfferId: 122,
      jobOffer: {
        ...followUp.jobOffer,
        id: 122,
        title: "Offre septembre proche",
      },
    });
    const farSeptember = createApplication({
      id: 23,
      followUpAt: "2026-09-10T12:00:00.000Z",
      jobOfferId: 123,
      jobOffer: {
        ...followUp.jobOffer,
        id: 123,
        title: "Offre septembre lointaine",
      },
    });

    vi.mocked(getFollowUps).mockResolvedValue([
      pastAugust,
      futureAugust,
      nearSeptember,
      farSeptember,
    ]);
    vi.mocked(getInterviews).mockResolvedValue([]);

    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    renderCalendar();

    expect(
      await screen.findByRole("heading", {
        name: "Offre août à venir",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Offre septembre proche",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Offre passée août",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Offre septembre lointaine",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Mois suivant",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Offre septembre proche",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Offre septembre lointaine",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Offre août à venir",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Offre passée août",
      }),
    ).not.toBeInTheDocument();
  });

  it("can collapse and reopen the upcoming events section", async () => {
    const user = userEvent.setup();

    renderCalendar();

    expect(
      await screen.findByRole("heading", {
        name: "Événements à venir",
      }),
    ).toBeInTheDocument();

    const toggleButton = screen.getByRole("button", {
      name: "Masquer les événements à venir",
    });

    expect(
      screen.getByRole("heading", {
        name: followUp.jobOffer.title,
      }),
    ).toBeInTheDocument();

    await user.click(toggleButton);

    expect(
      screen.queryByRole("heading", {
        name: followUp.jobOffer.title,
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Afficher les événements à venir",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Afficher les événements à venir",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: followUp.jobOffer.title,
      }),
    ).toBeInTheDocument();
  });
  it("opens a follow-up form for a selected calendar day", async () => {
    const user = userEvent.setup();

    renderCalendar();

    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });

    await user.click(
      within(august20).getByRole("button", {
        name: "Ajouter un événement le 20 août 2026",
      }),
    );

    const formHeading = screen.getByRole("heading", {
      name: "Ajouter un événement",
    });

    expect(formHeading).toBeInTheDocument();

    await waitFor(() => {
      expect(formHeading).toHaveFocus();
    });

    expect(
      screen.getByRole("combobox", {
        name: "Candidature",
      }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Date de l'événement")).toHaveValue(
      "2026-08-20",
    );
  });
  it("cancels the event form and resets its values", async () => {
    const user = userEvent.setup();
    renderCalendar();
    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });
    await user.click(
      within(august20).getByRole("button", {
        name: "Ajouter un événement le 20 août 2026",
      }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Type d'événement" }),
      "INTERVIEW",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Candidature" }),
      String(followUp.id),
    );
    await user.clear(screen.getByLabelText("Heure"));
    await user.type(screen.getByLabelText("Heure"), "14:30");
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(
      screen.queryByRole("heading", { name: "Ajouter un événement" }),
    ).not.toBeInTheDocument();
    expect(updateApplication).not.toHaveBeenCalled();
    await user.click(
      within(august20).getByRole("button", {
        name: "Ajouter un événement le 20 août 2026",
      }),
    );
    expect(
      screen.getByRole("combobox", { name: "Type d'événement" }),
    ).toHaveValue("FOLLOW_UP");
    expect(screen.getByRole("combobox", { name: "Candidature" })).toHaveValue(
      "",
    );
    expect(screen.getByLabelText("Heure")).toHaveValue("08:00");
  });

  it("schedules a follow-up for the selected application", async () => {
    const user = userEvent.setup();

    renderCalendar();

    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });

    await user.click(
      within(august20).getByRole("button", {
        name: "Ajouter un événement le 20 août 2026",
      }),
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Candidature",
      }),
      String(interview.id),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Enregistrer la relance",
      }),
    );

    expect(updateApplication).toHaveBeenCalledTimes(1);

    expect(updateApplication).toHaveBeenCalledWith(interview.id, {
      followUpAt: new Date("2026-08-20T08:00:00").toISOString(),
    });
    expect(screen.getByText("Relance programmée avec succès.")).toHaveAttribute(
      "role",
      "status",
    );
  });
  it("schedules an interview with the selected date and time", async () => {
    const user = userEvent.setup();

    renderCalendar();

    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });

    await user.click(
      within(august20).getByRole("button", {
        name: "Ajouter un événement le 20 août 2026",
      }),
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Type d'événement",
      }),
      "INTERVIEW",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Candidature",
      }),
      String(followUp.id),
    );

    await user.clear(screen.getByLabelText("Heure"));
    await user.type(screen.getByLabelText("Heure"), "14:30");

    await user.click(
      screen.getByRole("button", {
        name: "Enregistrer l'entretien",
      }),
    );

    expect(updateApplication).toHaveBeenCalledTimes(1);

    expect(updateApplication).toHaveBeenCalledWith(followUp.id, {
      interviewAt: new Date("2026-08-20T14:30:00").toISOString(),
    });
    expect(
      screen.getByText("Entretien programmé avec succès."),
    ).toHaveAttribute("role", "status");
  });
  it("closes the follow-up form after a successful update", async () => {
    const user = userEvent.setup();

    renderCalendar();

    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });

    await user.click(
      within(august20).getByRole("button", {
        name: "Ajouter un événement le 20 août 2026",
      }),
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Candidature",
      }),
      String(interview.id),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Enregistrer la relance",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", {
          name: "Ajouter un événement",
        }),
      ).not.toBeInTheDocument();
    });
  });
});
