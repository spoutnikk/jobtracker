import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardStats, type DashboardStats } from "../api/dashboard";
import { renderWithProviders } from "../test/renderWithProviders";
import DashboardPage from "./DashboardPage";

vi.mock("../api/dashboard", () => ({
  getDashboardStats: vi.fn(),
}));

const dashboardStats: DashboardStats = {
  totalApplications: 12,
  totalCompanies: 5,
  totalJobOffers: 8,
  upcomingFollowUps: 3,
  upcomingInterviews: 2,
  recentApplications: 99,
  applicationsLast7Days: 2,
  applicationsLast30Days: 6,
  upcomingFollowUps7Days: 1,
  upcomingInterviews7Days: 1,
  interviewRate: 33.33333333333333,
  applicationsByStatus: [
    { status: "APPLIED", count: 7 },
    { status: "INTERVIEW", count: 2 },
  ],
  weeklyApplications: [
    { weekStart: "2026-06-22T00:00:00.000Z", count: 0 },
    { weekStart: "2026-06-29T00:00:00.000Z", count: 1 },
    { weekStart: "2026-07-06T00:00:00.000Z", count: 0 },
    { weekStart: "2026-07-13T00:00:00.000Z", count: 3 },
    { weekStart: "2026-07-20T00:00:00.000Z", count: 2 },
    { weekStart: "2026-07-27T00:00:00.000Z", count: 0 },
    { weekStart: "2026-08-03T00:00:00.000Z", count: 4 },
    { weekStart: "2026-08-10T00:00:00.000Z", count: 1 },
  ],
  nextFollowUps: [
    {
      applicationId: 1,
      companyName: "Acme",
      jobTitle: "Développeur backend",
      followUpAt: "2026-08-12T08:30:00.000Z",
    },
    {
      applicationId: 2,
      companyName: "Beta",
      jobTitle: "Développeur frontend",
      followUpAt: "2026-08-13T13:00:00.000Z",
    },
  ],
  nextInterviews: [
    {
      applicationId: 3,
      companyName: "Gamma",
      jobTitle: "Ingénieur DevOps",
      interviewAt: "2026-08-14T09:00:00.000Z",
    },
    {
      applicationId: 4,
      companyName: "Delta",
      jobTitle: "Tech lead",
      interviewAt: "2026-08-15T14:30:00.000Z",
    },
  ],
};

function renderDashboard() {
  return renderWithProviders(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getDashboardStats).mockResolvedValue(dashboardStats);
  });

  it("renders the dashboard statistics", async () => {
    renderDashboard();

    expect(
      await screen.findByRole("heading", { name: "Tableau de bord" }),
    ).toBeInTheDocument();

    const expectedCounters = [
      ["Candidatures", "12"],
      ["Entreprises", "5"],
      ["Offres", "8"],
      ["Relances à venir", "3"],
      ["Entretiens à venir", "2"],
      ["Taux d'entretien", "33,3 %"],
      ["Candidatures — 7 jours", "2"],
      ["Candidatures — 30 jours", "6"],
      ["Entretiens à venir — 7 jours", "1"],
      ["Relances à venir — 7 jours", "1"],
    ] as const;

    for (const [label, value] of expectedCounters) {
      const card = screen.getByText(label).closest("article");

      expect(card).not.toBeNull();
      expect(within(card!).getByText(value)).toBeInTheDocument();
    }

    expect(screen.getAllByText("Candidatures — 30 jours")).toHaveLength(1);
    expect(
      screen.queryByText("Candidatures sur 30 jours"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();

    expect(screen.getByText("Envoyée")).toBeInTheDocument();
    expect(screen.getByText("Entretien")).toBeInTheDocument();

    const weeklyChart = screen.getByRole("heading", {
      name: "Candidatures des 8 dernières semaines",
    }).parentElement;

    expect(weeklyChart).not.toBeNull();
    expect(within(weeklyChart!).getAllByRole("img")).toHaveLength(8);
    expect(
      within(weeklyChart!).getByRole("img", {
        name: "Semaine du 22 juin : 0 candidature, 0 %",
      }),
    ).toBeInTheDocument();
    expect(
      within(weeklyChart!).getByRole("img", {
        name: "Semaine du 13 juil. : 3 candidatures, 27,3 %",
      }),
    ).toBeInTheDocument();
    expect(
      within(weeklyChart!)
        .getAllByRole("img")
        .map((item) => item.ariaLabel),
    ).toEqual([
      "Semaine du 22 juin : 0 candidature, 0 %",
      "Semaine du 29 juin : 1 candidature, 9,1 %",
      "Semaine du 6 juil. : 0 candidature, 0 %",
      "Semaine du 13 juil. : 3 candidatures, 27,3 %",
      "Semaine du 20 juil. : 2 candidatures, 18,2 %",
      "Semaine du 27 juil. : 0 candidature, 0 %",
      "Semaine du 3 août : 4 candidatures, 36,4 %",
      "Semaine du 10 août : 1 candidature, 9,1 %",
    ]);

    const followUpsSection = screen
      .getByRole("heading", { name: "Prochaines relances" })
      .closest("section");
    const interviewsSection = screen
      .getByRole("heading", { name: "Prochains entretiens" })
      .closest("section");

    expect(followUpsSection).not.toBeNull();
    expect(interviewsSection).not.toBeNull();
    expect(
      within(followUpsSection!)
        .getAllByRole("heading", { level: 3 })
        .map(({ textContent }) => textContent),
    ).toEqual(["Développeur backend", "Développeur frontend"]);
    expect(within(followUpsSection!).getByText("Acme")).toBeInTheDocument();
    expect(
      within(followUpsSection!).getByText("mercredi 12 août 2026 à 10:30"),
    ).toBeInTheDocument();
    expect(
      within(followUpsSection!).getByRole("link", {
        name: "Voir la candidature « Développeur backend »",
      }),
    ).toHaveAttribute("href", "/applications/1");
    expect(
      within(interviewsSection!)
        .getAllByRole("heading", { level: 3 })
        .map(({ textContent }) => textContent),
    ).toEqual(["Ingénieur DevOps", "Tech lead"]);
    expect(within(interviewsSection!).getByText("Gamma")).toBeInTheDocument();
    expect(
      within(interviewsSection!).getByText("vendredi 14 août 2026 à 11:00"),
    ).toBeInTheDocument();
    expect(
      within(interviewsSection!).getByRole("link", {
        name: "Voir la candidature « Ingénieur DevOps »",
      }),
    ).toHaveAttribute("href", "/applications/3");
  });

  it("renders empty states for the next seven days", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      ...dashboardStats,
      nextFollowUps: [],
      nextInterviews: [],
    });

    renderDashboard();

    expect(
      await screen.findByText(
        "Pas de relance prévue dans les 7 prochains jours.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pas d'entretien prévu dans les 7 prochains jours."),
    ).toBeInTheDocument();
  });

  it("formats a zero interview rate", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      ...dashboardStats,
      totalApplications: 0,
      interviewRate: 0,
    });

    renderDashboard();

    const rateCard = (await screen.findByText("Taux d'entretien")).closest(
      "article",
    );

    expect(rateCard).not.toBeNull();
    expect(within(rateCard!).getByText("0 %")).toBeInTheDocument();
  });

  it("renders the loading state", () => {
    vi.mocked(getDashboardStats).mockImplementation(
      () => new Promise<DashboardStats>(() => undefined),
    );

    renderDashboard();

    expect(
      screen.getByText("Chargement du tableau de bord..."),
    ).toBeInTheDocument();
  });

  it("renders the error state", async () => {
    vi.mocked(getDashboardStats).mockRejectedValue(new Error("Request failed"));

    renderDashboard();

    expect(
      await screen.findByText("Impossible de charger le tableau de bord."),
    ).toBeInTheDocument();
  });

  it("renders the application status distribution as percentages", async () => {
    renderDashboard();

    const statusSection = (
      await screen.findByRole("heading", {
        name: "Candidatures par statut",
      })
    ).closest("section");

    expect(statusSection).not.toBeNull();

    expect(
      within(statusSection!).getByRole("link", {
        name: "Envoyée : 7 candidatures, 77,8 %",
      }),
    ).toHaveAttribute("href", "/applications?status=APPLIED");

    expect(
      within(statusSection!).getByRole("link", {
        name: "Entretien : 2 candidatures, 22,2 %",
      }),
    ).toHaveAttribute("href", "/applications?status=INTERVIEW");
  });
  it("provides navigation links from the main dashboard counters", async () => {
    renderDashboard();

    await screen.findByRole("heading", {
      name: "Tableau de bord",
    });

    expect(
      screen.getByRole("link", {
        name: /Candidatures\s+12/,
      }),
    ).toHaveAttribute("href", "/applications");

    expect(
      screen.getByRole("link", {
        name: /Entreprises\s+5/,
      }),
    ).toHaveAttribute("href", "/companies");

    expect(
      screen.getByRole("link", {
        name: /Offres\s+8/,
      }),
    ).toHaveAttribute("href", "/job-offers");

    expect(
      screen.getByRole("link", {
        name: /Relances à venir\s+3/,
      }),
    ).toHaveAttribute("href", "/calendar");

    expect(
      screen.getByRole("link", {
        name: /Entretiens à venir\s+2/,
      }),
    ).toHaveAttribute("href", "/calendar");

    expect(
      screen.getByRole("link", {
        name: /Entretiens à venir — 7 jours\s+1/,
      }),
    ).toHaveAttribute("href", "/calendar");

    expect(
      screen.getByRole("link", {
        name: /Relances à venir — 7 jours\s+1/,
      }),
    ).toHaveAttribute("href", "/calendar");
  });
  it("shows the weekly application distribution as percentages", async () => {
    renderDashboard();

    const weeklySection = (
      await screen.findByRole("heading", {
        name: "Candidatures des 8 dernières semaines",
      })
    ).closest("section");

    expect(weeklySection).not.toBeNull();

    expect(
      within(weeklySection!).getByRole("img", {
        name: "Semaine du 3 août : 4 candidatures, 36,4 %",
      }),
    ).toBeInTheDocument();

    expect(
      within(weeklySection!).getByRole("img", {
        name: "Semaine du 10 août : 1 candidature, 9,1 %",
      }),
    ).toBeInTheDocument();

    expect(
      within(weeklySection!).getByRole("link", {
        name: "Voir les candidatures — Semaine du 3 août : 4 candidatures, 36,4 %",
      }),
    ).toHaveAttribute(
      "href",
      "/applications?createdFrom=2026-08-03T00%3A00%3A00.000Z&createdTo=2026-08-10T00%3A00%3A00.000Z",
    );

    expect(
      within(weeklySection!).getByRole("link", {
        name: "Voir les candidatures — Semaine du 10 août : 1 candidature, 9,1 %",
      }),
    ).toHaveAttribute(
      "href",
      "/applications?createdFrom=2026-08-10T00%3A00%3A00.000Z&createdTo=2026-08-17T00%3A00%3A00.000Z",
    );
  });
});
