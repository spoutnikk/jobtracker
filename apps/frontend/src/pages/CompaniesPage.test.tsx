import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCompany,
  deleteCompany,
  getCompanies,
  type Company,
  updateCompany,
} from "../api/companies";
import { renderWithProviders } from "../test/renderWithProviders";
import CompaniesPage from "./CompaniesPage";

vi.mock("../api/companies", () => ({
  createCompany: vi.fn(),
  deleteCompany: vi.fn(),
  getCompanies: vi.fn(),
  updateCompany: vi.fn(),
}));

const company: Company = {
  id: 1,
  name: "Acme",
  website: "https://acme.example.com",
  city: "Paris",
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
  jobOffers: [],
};

function createAxiosError(status: number) {
  return new AxiosError(
    "Request failed",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      data: {},
      status,
      statusText: "Request Error",
      headers: {},
      config: {
        headers: new AxiosHeaders(),
      },
    },
  );
}

describe("CompaniesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getCompanies).mockResolvedValue([company]);
    vi.mocked(createCompany).mockResolvedValue(company);
    vi.mocked(updateCompany).mockResolvedValue(company);
    vi.mocked(deleteCompany).mockResolvedValue(company);
  });

  it("renders an existing company", async () => {
    renderWithProviders(<CompaniesPage />);

    expect(
      await screen.findByRole("heading", { name: "Entreprises" }),
    ).toBeInTheDocument();
    const companyHeading = screen.getByRole("heading", {
      name: company.name,
    });
    const companyCard = companyHeading.closest("article");

    expect(companyCard).not.toBeNull();

    if (!companyCard) {
      throw new Error("Company card not found");
    }

    const card = within(companyCard);

    expect(card.getByText(`Ville : ${company.city}`)).toBeInTheDocument();
    expect(card.getByRole("link", { name: company.website! })).toHaveAttribute(
      "href",
      company.website,
    );
    expect(card.getByText("0 offre d'emploi")).toBeInTheDocument();
  });

  it("does not delete a company when confirmation is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<CompaniesPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      `Supprimer l'entreprise "${company.name}" ?`,
    );
    expect(deleteCompany).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        "Impossible de supprimer cette entreprise. Vérifiez qu'aucune offre d'emploi ne lui est encore associée.",
      ),
    ).not.toBeInTheDocument();
  });

  it("deletes a company exactly once after confirmation", async () => {
    vi.mocked(deleteCompany)
      .mockResolvedValueOnce(company)
      .mockRejectedValueOnce(createAxiosError(404));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<CompaniesPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(deleteCompany).toHaveBeenCalledTimes(1);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["companies"],
      });
    });
    const [deletedId] = vi.mocked(deleteCompany).mock.calls[0];

    expect(deletedId).toBe(company.id);
    expect(
      screen.queryByText(
        "Impossible de supprimer cette entreprise. Vérifiez qu'aucune offre d'emploi ne lui est encore associée.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows the current deletion error after a 409 conflict", async () => {
    vi.mocked(deleteCompany).mockRejectedValue(createAxiosError(409));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<CompaniesPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(
      await screen.findByText(
        "Impossible de supprimer cette entreprise. Vérifiez qu'aucune offre d'emploi ne lui est encore associée.",
      ),
    ).toBeInTheDocument();
    expect(deleteCompany).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: company.name }),
    ).toBeInTheDocument();
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: ["companies"],
    });
  });
});
