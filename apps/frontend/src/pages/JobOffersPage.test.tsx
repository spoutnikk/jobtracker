import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCompanies } from "../api/companies";
import { getJobOffers } from "../api/job-offers";
import { renderWithProviders } from "../test/renderWithProviders";
import JobOffersPage from "./JobOffersPage";

vi.mock("../api/job-offers", () => ({
  createJobOffer: vi.fn(),
  deleteJobOffer: vi.fn(),
  getJobOffers: vi.fn(),
  updateJobOffer: vi.fn(),
}));

vi.mock("../api/companies", () => ({
  getCompanies: vi.fn(),
}));

describe("JobOffersPage", () => {
  beforeEach(() => {
    vi.mocked(getJobOffers).mockResolvedValue([]);
    vi.mocked(getCompanies).mockResolvedValue([
      {
        id: 1,
        name: "Acme",
        website: null,
        city: null,
        createdAt: "2026-08-11T08:00:00.000Z",
        updatedAt: "2026-08-11T08:00:00.000Z",
        jobOffers: [],
      },
    ]);
  });

  it("renders the empty job offers page", async () => {
    renderWithProviders(<JobOffersPage />);

    expect(
      await screen.findByRole("heading", { name: "Offres d’emploi" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nouvelle offre" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aucune offre enregistrée.")).toBeInTheDocument();
  });
});
