import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  getFollowUps,
  getInterviews,
  type Application,
} from "../api/applications";
import { renderWithProviders } from "../test/renderWithProviders";
import CalendarPage from "./CalendarPage";

vi.mock("../api/applications", () => ({
  getFollowUps: vi.fn(),
  getInterviews: vi.fn(),
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

describe("CalendarPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getFollowUps).mockResolvedValue([followUp]);
    vi.mocked(getInterviews).mockResolvedValue([interview]);
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
});
