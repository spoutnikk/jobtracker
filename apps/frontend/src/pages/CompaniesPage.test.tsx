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

  it("creates a company and resets the form", async () => {
    vi.mocked(getCompanies).mockResolvedValue([]);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<CompaniesPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByRole("heading", { name: "Nouvelle entreprise" });
    await user.type(screen.getByLabelText("Nom"), "Acme");
    await user.type(screen.getByLabelText("Ville"), "Paris");
    await user.type(
      screen.getByLabelText("Site web"),
      "https://acme.example.com",
    );
    await user.click(
      screen.getByRole("button", { name: "Créer l'entreprise" }),
    );

    await waitFor(() => {
      expect(createCompany).toHaveBeenCalledTimes(1);
    });
    const [createInput] = vi.mocked(createCompany).mock.calls[0];

    expect(createInput).toEqual({
      name: "Acme",
      website: "https://acme.example.com",
      city: "Paris",
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Nom")).toHaveValue("");
      expect(screen.getByLabelText("Ville")).toHaveValue("");
      expect(screen.getByLabelText("Site web")).toHaveValue("");
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["companies"],
      });
    });
    expect(
      screen.queryByText("Impossible de créer l'entreprise."),
    ).not.toBeInTheDocument();
  });

  it("shows a generic message when company creation fails", async () => {
    vi.mocked(getCompanies).mockResolvedValue([]);
    vi.mocked(createCompany).mockRejectedValue(new Error("Unexpected error"));
    const user = userEvent.setup();

    renderWithProviders(<CompaniesPage />);

    await user.type(await screen.findByLabelText("Nom"), "Acme");
    await user.click(
      screen.getByRole("button", { name: "Créer l'entreprise" }),
    );

    expect(
      await screen.findByText("Impossible de créer l'entreprise."),
    ).toBeInTheDocument();
    expect(createCompany).toHaveBeenCalledTimes(1);
  });

  it("prefills the edit form with the company", async () => {
    const user = userEvent.setup();

    renderWithProviders(<CompaniesPage />);

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const cancelButton = screen.getByRole("button", { name: "Annuler" });
    const editForm = cancelButton.closest("form");

    expect(editForm).not.toBeNull();

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);

    expect(edit.getByLabelText("Nom")).toHaveValue(company.name);
    expect(edit.getByLabelText("Ville")).toHaveValue(company.city);
    expect(edit.getByLabelText("Site web")).toHaveValue(company.website);
    expect(screen.getAllByRole("button", { name: "Annuler" })).toHaveLength(1);
  });

  it("cancels editing without updating the company", async () => {
    const user = userEvent.setup();

    renderWithProviders(<CompaniesPage />);

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const cancelButton = screen.getByRole("button", { name: "Annuler" });
    const editForm = cancelButton.closest("form");

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);
    await user.clear(edit.getByLabelText("Nom"));
    await user.type(edit.getByLabelText("Nom"), "Nom temporaire");
    await user.click(cancelButton);

    expect(updateCompany).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Annuler" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: company.name }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Ville : ${company.city}`)).toBeInTheDocument();
  });

  it("updates a company and closes the edit form", async () => {
    const updatedCompany: Company = {
      ...company,
      name: "Acme France",
      city: "Lyon",
      website: "https://fr.acme.example.com",
    };
    vi.mocked(updateCompany).mockResolvedValue(updatedCompany);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<CompaniesPage />);
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const editForm = screen
      .getByRole("button", { name: "Annuler" })
      .closest("form");

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);
    await user.clear(edit.getByLabelText("Nom"));
    await user.type(edit.getByLabelText("Nom"), updatedCompany.name);
    await user.clear(edit.getByLabelText("Ville"));
    await user.type(edit.getByLabelText("Ville"), updatedCompany.city!);
    await user.clear(edit.getByLabelText("Site web"));
    await user.type(edit.getByLabelText("Site web"), updatedCompany.website!);
    await user.click(edit.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(updateCompany).toHaveBeenCalledTimes(1);
    });
    const [updatedId, updateInput] = vi.mocked(updateCompany).mock.calls[0];

    expect(updatedId).toBe(company.id);
    expect(updateInput).toEqual({
      name: "Acme France",
      website: "https://fr.acme.example.com",
      city: "Lyon",
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Annuler" }),
      ).not.toBeInTheDocument();
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["companies"],
      });
    });
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
