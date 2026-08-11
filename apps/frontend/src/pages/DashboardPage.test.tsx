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
  interviewRate: 25,
  applicationsByStatus: [
    { status: "APPLIED", count: 7 },
    { status: "INTERVIEW", count: 2 },
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
      ["Taux d'entretien", "25%"],
    ] as const;

    for (const [label, value] of expectedCounters) {
      const card = screen.getByText(label).closest("article");

      expect(card).not.toBeNull();
      expect(within(card!).getByText(value)).toBeInTheDocument();
    }

    expect(screen.getByText("APPLIED")).toBeInTheDocument();
    expect(screen.getByText("INTERVIEW")).toBeInTheDocument();
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
