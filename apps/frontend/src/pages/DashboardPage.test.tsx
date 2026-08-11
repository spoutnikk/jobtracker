import { screen, within } from "@testing-library/react";
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
  recentApplications: 6,
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
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getDashboardStats).mockResolvedValue(dashboardStats);
  });

  it("renders the dashboard statistics", async () => {
    renderWithProviders(<DashboardPage />);

    expect(
      await screen.findByRole("heading", { name: "Tableau de bord" }),
    ).toBeInTheDocument();

    const expectedCounters = [
      ["Candidatures", "12"],
      ["Entreprises", "5"],
      ["Offres", "8"],
      ["Relances à venir", "3"],
      ["Entretiens à venir", "2"],
      ["Candidatures sur 30 jours", "6"],
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

    expect(screen.getByText("APPLIED")).toBeInTheDocument();
    expect(screen.getByText("INTERVIEW")).toBeInTheDocument();

    const weeklyChart = screen.getByRole("heading", {
      name: "Candidatures des 8 dernières semaines",
    }).parentElement;

    expect(weeklyChart).not.toBeNull();
    expect(within(weeklyChart!).getAllByRole("img")).toHaveLength(8);
    expect(
      within(weeklyChart!).getByRole("img", {
        name: "Semaine du 22 juin : 0 candidature",
      }),
    ).toBeInTheDocument();
    expect(
      within(weeklyChart!).getByRole("img", {
        name: "Semaine du 13 juil. : 3 candidatures",
      }),
    ).toBeInTheDocument();
    expect(
      within(weeklyChart!)
        .getAllByRole("img")
        .map((item) => item.ariaLabel),
    ).toEqual([
      "Semaine du 22 juin : 0 candidature",
      "Semaine du 29 juin : 1 candidature",
      "Semaine du 6 juil. : 0 candidature",
      "Semaine du 13 juil. : 3 candidatures",
      "Semaine du 20 juil. : 2 candidatures",
      "Semaine du 27 juil. : 0 candidature",
      "Semaine du 3 août : 4 candidatures",
      "Semaine du 10 août : 1 candidature",
    ]);
  });

  it("formats a zero interview rate", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      ...dashboardStats,
      totalApplications: 0,
      interviewRate: 0,
    });

    renderWithProviders(<DashboardPage />);

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

    renderWithProviders(<DashboardPage />);

    expect(
      screen.getByText("Chargement du tableau de bord..."),
    ).toBeInTheDocument();
  });

  it("renders the error state", async () => {
    vi.mocked(getDashboardStats).mockRejectedValue(new Error("Request failed"));

    renderWithProviders(<DashboardPage />);

    expect(
      await screen.findByText("Impossible de charger le tableau de bord."),
    ).toBeInTheDocument();
  });
});
