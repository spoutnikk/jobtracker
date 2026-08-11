import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCompanies } from "../api/companies";
import { createJobOffer, getJobOffers, type JobOffer } from "../api/job-offers";
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

const company = {
  id: 1,
  name: "Acme",
  website: null,
  city: "Paris",
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
  jobOffers: [],
};

const jobOffer: JobOffer = {
  id: 1,
  title: "Développeur React",
  companyId: company.id,
  url: "https://example.com/jobs/react",
  description: "Développer une application React moderne.",
  location: "Paris",
  contractType: "CDI",
  salary: "50 000 €",
  publishedAt: "2026-08-11T08:00:00.000Z",
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
  company,
};

describe("JobOffersPage", () => {
  beforeEach(() => {
    vi.mocked(getJobOffers).mockResolvedValue([]);
    vi.mocked(getCompanies).mockResolvedValue([company]);
    vi.mocked(createJobOffer).mockResolvedValue(jobOffer);
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

  it("renders an existing job offer", async () => {
    vi.mocked(getJobOffers).mockResolvedValue([jobOffer]);

    renderWithProviders(<JobOffersPage />);

    const jobOfferHeading = await screen.findByRole("heading", {
      name: jobOffer.title,
    });
    const jobOfferCard = jobOfferHeading.closest("article");

    expect(jobOfferCard).not.toBeNull();

    if (!jobOfferCard) {
      throw new Error("Job offer card not found");
    }

    expect(within(jobOfferCard).getByText(company.name)).toBeInTheDocument();
    expect(screen.getByText("Localisation : Paris")).toBeInTheDocument();
    expect(screen.getByText("Contrat : CDI")).toBeInTheDocument();
    expect(screen.getByText("Salaire : 50 000 €")).toBeInTheDocument();
    expect(screen.getByText(jobOffer.description!)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: jobOffer.url! })).toHaveAttribute(
      "href",
      jobOffer.url,
    );
  });

  it("creates a job offer and resets the form", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<JobOffersPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByRole("heading", { name: "Nouvelle offre" });

    await user.type(screen.getByLabelText("Titre"), "  Développeur React  ");
    await user.selectOptions(screen.getByLabelText("Société"), "1");
    await user.type(
      screen.getByLabelText("URL"),
      "https://example.com/jobs/react",
    );
    await user.type(screen.getByLabelText("Localisation"), "Paris");
    await user.selectOptions(screen.getByLabelText("Type de contrat"), "CDI");
    await user.type(screen.getByLabelText("Salaire"), "50 000 €");
    await user.click(screen.getByRole("button", { name: "Créer l'offre" }));

    await waitFor(() => {
      expect(createJobOffer).toHaveBeenCalledTimes(1);
    });
    const mockedCreateJobOffer = vi.mocked(createJobOffer);
    const [createInput] = mockedCreateJobOffer.mock.calls[0];

    expect(createInput).toEqual({
      title: "Développeur React",
      companyId: 1,
      url: "https://example.com/jobs/react",
      description: undefined,
      location: "Paris",
      contractType: "CDI",
      salary: "50 000 €",
      publishedAt: undefined,
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Titre")).toHaveValue("");
      expect(screen.getByLabelText("Société")).toHaveValue("");
      expect(screen.getByLabelText("URL")).toHaveValue("");
      expect(screen.getByLabelText("Localisation")).toHaveValue("");
      expect(screen.getByLabelText("Type de contrat")).toHaveValue("");
      expect(screen.getByLabelText("Salaire")).toHaveValue("");
    });
    expect(
      screen.queryByText("Impossible de créer l'offre."),
    ).not.toBeInTheDocument();

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["job-offers"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["companies"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["dashboard-stats"],
    });
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: ["applications"],
    });
  });
});
