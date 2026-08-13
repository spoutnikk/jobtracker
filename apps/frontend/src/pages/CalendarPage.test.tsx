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

  it("renders calendar events on their corresponding day", async () => {
    renderCalendar();

    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });

    expect(
      within(august20).getByRole("link", {
        name: "14:00 · Relance · Développeur React",
      }),
    ).toHaveAttribute("href", `/applications/${followUp.id}`);
  });

  it("returns to the current month and highlights today", async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(new Date("2026-08-13T10:00:00.000Z"));

    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    renderCalendar();

    expect(
      await screen.findByRole("heading", {
        name: /^août 2026$/i,
      }),
    ).toBeInTheDocument();

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
        name: "Aujourd'hui",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: /^août 2026$/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("gridcell", {
        name: /13 août 2026.*aujourd'hui/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows event times in the monthly calendar", async () => {
    renderCalendar();

    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });

    expect(within(august20).getByText(/14:00/)).toBeInTheDocument();
  });
  it("collapses busy calendar days after three events and can expand them", async () => {
    const user = userEvent.setup();

    const busyDayFollowUps = Array.from({ length: 5 }, (_, index) =>
      createApplication({
        id: 10 + index,
        followUpAt: `2026-08-20T${String(8 + index).padStart(2, "0")}:00:00.000Z`,
        jobOfferId: 100 + index,
        jobOffer: {
          ...followUp.jobOffer,
          id: 100 + index,
          title: `Offre ${index + 1}`,
        },
      }),
    );

    vi.mocked(getFollowUps).mockResolvedValue(busyDayFollowUps);
    vi.mocked(getInterviews).mockResolvedValue([]);

    renderCalendar();

    const august20 = await screen.findByRole("gridcell", {
      name: /20 août 2026/i,
    });

    expect(within(august20).getAllByRole("link")).toHaveLength(3);

    expect(
      within(august20).getByRole("button", {
        name: "+ 2 autres",
      }),
    ).toBeInTheDocument();

    await user.click(
      within(august20).getByRole("button", {
        name: "+ 2 autres",
      }),
    );

    expect(within(august20).getAllByRole("link")).toHaveLength(5);

    expect(
      within(august20).getByRole("button", {
        name: "Réduire",
      }),
    ).toBeInTheDocument();

    await user.click(
      within(august20).getByRole("button", {
        name: "Réduire",
      }),
    );

    expect(within(august20).getAllByRole("link")).toHaveLength(3);
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

    expect(
      screen.getByRole("heading", {
        name: "Ajouter un événement",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("combobox", {
        name: "Candidature",
      }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Date de l'événement")).toHaveValue(
      "2026-08-20",
    );
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
