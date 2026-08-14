import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getAllApplications, type Application } from "../api/applications";
import { renderWithProviders } from "../test/renderWithProviders";
import HomePage from "./HomePage";

vi.mock("../api/applications", () => ({
  getAllApplications: vi.fn(),
}));

const baseApplication: Application = {
  id: 1,
  status: "APPLIED",
  appliedAt: "2026-08-01T08:00:00.000Z",
  source: "LinkedIn",
  notes: null,
  contactName: null,
  contactEmail: null,
  followUpAt: null,
  interviewAt: null,
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z",
  userId: 7,
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
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    companyId: 3,
    company: {
      id: 3,
      name: "Acme",
      website: null,
      city: "Paris",
      createdAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z",
    },
  },
};

function renderHome() {
  return renderWithProviders(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

function isoAtLocalTime(daysFromToday: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, 0, 0, 0);

  return date.toISOString();
}

describe("HomePage", () => {
  it("shows today's priorities and useful counters", async () => {
    vi.mocked(getAllApplications).mockResolvedValue([
      {
        ...baseApplication,
        id: 1,
        followUpAt: isoAtLocalTime(-1, 9),
      },
      {
        ...baseApplication,
        id: 2,
        interviewAt: isoAtLocalTime(0, 14),
        jobOffer: {
          ...baseApplication.jobOffer,
          id: 11,
          title: "Développeur TypeScript",
        },
      },
      {
        ...baseApplication,
        id: 3,
        status: "DRAFT",
        jobOffer: {
          ...baseApplication.jobOffer,
          id: 12,
          title: "Développeur NestJS",
        },
      },
      {
        ...baseApplication,
        id: 4,
        status: "REJECTED",
        followUpAt: isoAtLocalTime(-2, 9),
      },
    ]);

    renderHome();

    expect(
      await screen.findByRole("heading", {
        name: "Votre recherche d'emploi",
      }),
    ).toBeInTheDocument();

    const summary = screen.getByRole("region", {
      name: "Résumé de la journée",
    });

    expect(within(summary).getByText("Relances à traiter")).toBeInTheDocument();
    expect(
      within(summary).getByText("Entretiens aujourd'hui"),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("Candidatures à préparer"),
    ).toBeInTheDocument();
    expect(within(summary).getAllByText("1")).toHaveLength(3);

    expect(
      screen.getByRole("heading", { name: "Développeur React" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Développeur TypeScript" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Développeur NestJS" }),
    ).not.toBeInTheDocument();

    expect(screen.getByText(/En retard depuis le/)).toBeInTheDocument();

    const applicationLinks = screen.getAllByRole("link", {
      name: "Voir la candidature",
    });
    expect(applicationLinks[0]).toHaveAttribute("href", "/applications/1");
    expect(applicationLinks[1]).toHaveAttribute("href", "/applications/2");

    expect(
      within(summary).getByRole("link", { name: /Candidatures à préparer/ }),
    ).toHaveAttribute("href", "/applications?status=DRAFT");
  });

  it("shows a calm empty state when there is nothing urgent", async () => {
    vi.mocked(getAllApplications).mockResolvedValue([
      {
        ...baseApplication,
        followUpAt: isoAtLocalTime(6, 9),
      },
    ]);

    renderHome();

    expect(
      await screen.findByText("Aucune action urgente aujourd'hui."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Vous pouvez avancer sur vos candidatures en préparation.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a loading state", () => {
    vi.mocked(getAllApplications).mockImplementation(
      () => new Promise<Application[]>(() => undefined),
    );

    renderHome();

    expect(
      screen.getByText("Chargement de votre journée..."),
    ).toBeInTheDocument();
  });

  it("renders an error state", async () => {
    vi.mocked(getAllApplications).mockRejectedValue(
      new Error("Network failed"),
    );

    renderHome();

    expect(
      await screen.findByText("Impossible de charger les actions à effectuer."),
    ).toBeInTheDocument();
  });
});
