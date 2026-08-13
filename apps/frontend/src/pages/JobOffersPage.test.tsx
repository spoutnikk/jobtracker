import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { getAllCompanies } from "../api/companies";
import {
  createJobOffer,
  deleteJobOffer,
  getJobOffers,
  type JobOffer,
  type PaginatedJobOffers,
  updateJobOffer,
} from "../api/job-offers";
import { renderWithProviders } from "../test/renderWithProviders";
import JobOffersPage from "./JobOffersPage";

vi.mock("../api/job-offers", () => ({
  createJobOffer: vi.fn(),
  deleteJobOffer: vi.fn(),
  getJobOffers: vi.fn(),
  updateJobOffer: vi.fn(),
}));

vi.mock("../api/companies", () => ({
  getAllCompanies: vi.fn(),
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

const secondCompany = {
  id: 2,
  name: "Globex",
  website: null,
  city: "Lyon",
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

const updatedJobOffer: JobOffer = {
  ...jobOffer,
  title: "Développeur React Senior",
  companyId: secondCompany.id,
  company: secondCompany,
  location: "Lyon",
  contractType: "CDD",
  salary: "60 000 €",
};

const secondJobOffer: JobOffer = {
  ...jobOffer,
  id: 2,
  title: "Développeur TypeScript",
};

const defaultJobOfferParams = {
  search: undefined,
  companyId: undefined,
  contractType: undefined,
  page: 1,
  pageSize: 10,
  sortBy: "createdAt",
  sortOrder: "desc",
};

function paginatedJobOffers(
  items: JobOffer[],
  overrides: Partial<PaginatedJobOffers> = {},
): PaginatedJobOffers {
  return {
    items,
    page: 1,
    pageSize: 10,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
    ...overrides,
  };
}

function expectedDatetimeLocal(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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

function renderJobOffersPage() {
  return renderWithProviders(
    <MemoryRouter>
      <JobOffersPage />
    </MemoryRouter>,
  );
}

describe("JobOffersPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/job-offers");
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([]));
    vi.mocked(getAllCompanies).mockResolvedValue([company, secondCompany]);
    vi.mocked(createJobOffer).mockResolvedValue(jobOffer);
    vi.mocked(updateJobOffer).mockResolvedValue(updatedJobOffer);
    vi.mocked(deleteJobOffer).mockResolvedValue(jobOffer);
  });

  it("renders the empty job offers page", async () => {
    renderJobOffersPage();

    expect(
      await screen.findByRole("heading", { name: "Offres d’emploi" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nouvelle offre" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aucune offre enregistrée.")).toBeInTheDocument();
  });

  it("initializes filters from the URL", async () => {
    window.history.pushState(
      {},
      "",
      "/job-offers?search=React&companyId=1&contractType=CDI",
    );

    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));

    renderJobOffersPage();

    await waitFor(() => {
      expect(getJobOffers).toHaveBeenLastCalledWith({
        ...defaultJobOfferParams,
        search: "React",
        companyId: company.id,
        contractType: "CDI",
      });
    });
    await screen.findByRole("heading", { name: "Offres d’emploi" });
    expect(screen.getByLabelText("Recherche")).toHaveValue("React");
    expect(screen.getByLabelText("Filtrer par société")).toHaveValue("1");
    expect(screen.getByLabelText("Filtrer par contrat")).toHaveValue("CDI");
  });

  it("navigates through pages and sends all filters", async () => {
    vi.mocked(getJobOffers).mockImplementation(async (filters) =>
      paginatedJobOffers([jobOffer], {
        page: filters?.page ?? 1,
        total: 21,
        totalPages: 3,
      }),
    );
    const user = userEvent.setup();
    renderJobOffersPage();

    expect(await screen.findByText("21 offres")).toBeInTheDocument();
    expect(screen.getByText("Page 1 sur 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Précédent" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Suivant" }));
    await waitFor(() => {
      expect(getJobOffers).toHaveBeenLastCalledWith({
        ...defaultJobOfferParams,
        page: 2,
      });
    });

    await user.type(screen.getByLabelText("Recherche"), "  React  ");
    await user.click(screen.getByRole("button", { name: "Rechercher" }));
    await user.selectOptions(
      screen.getByLabelText("Filtrer par société"),
      String(company.id),
    );
    await user.selectOptions(
      screen.getByLabelText("Filtrer par contrat"),
      "CDI",
    );
    await user.selectOptions(screen.getByLabelText("Trier par"), "title");
    await user.selectOptions(screen.getByLabelText("Ordre"), "asc");

    await waitFor(() => {
      expect(getJobOffers).toHaveBeenLastCalledWith({
        ...defaultJobOfferParams,
        search: "React",
        companyId: company.id,
        contractType: "CDI",
        sortBy: "title",
        sortOrder: "asc",
      });
    });
    const [filters] = vi.mocked(getJobOffers).mock.calls.at(-1) ?? [];
    expect(filters).not.toHaveProperty("userId");
    expect(window.location.search).toContain("search=React");
    expect(window.location.search).toContain(`companyId=${company.id}`);
    expect(window.location.search).toContain("contractType=CDI");

    const filtersSection = screen
      .getByRole("heading", { name: "Filtrer les offres" })
      .closest("section");
    if (!filtersSection) {
      throw new Error("Filters section not found");
    }
    const callsBeforeCollapse = vi.mocked(getJobOffers).mock.calls.length;
    await user.click(
      within(filtersSection).getByRole("button", {
        name: "Masquer Filtrer les offres",
      }),
    );
    expect(screen.getByLabelText("Filtrer par contrat")).not.toBeVisible();
    expect(getJobOffers).toHaveBeenCalledTimes(callsBeforeCollapse);
    await user.click(
      within(filtersSection).getByRole("button", {
        name: "Afficher Filtrer les offres",
      }),
    );
    expect(screen.getByLabelText("Filtrer par contrat")).toHaveValue("CDI");
    expect(screen.getByLabelText("Recherche")).toHaveValue("React");
  });

  it("resets all list controls to their defaults", async () => {
    vi.mocked(getJobOffers).mockImplementation(async (filters) =>
      paginatedJobOffers([jobOffer], {
        page: filters?.page ?? 1,
        total: 21,
        totalPages: 3,
      }),
    );
    const user = userEvent.setup();
    renderJobOffersPage();

    await screen.findByRole("heading", { name: jobOffer.title });
    await user.type(screen.getByLabelText("Recherche"), "React");
    await user.click(screen.getByRole("button", { name: "Rechercher" }));
    await user.selectOptions(
      screen.getByLabelText("Filtrer par société"),
      String(company.id),
    );
    await user.selectOptions(
      screen.getByLabelText("Filtrer par contrat"),
      "CDI",
    );
    await user.selectOptions(screen.getByLabelText("Trier par"), "title");
    await user.selectOptions(screen.getByLabelText("Ordre"), "asc");
    await user.selectOptions(screen.getByLabelText("Par page"), "20");
    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));

    await waitFor(() => {
      expect(getJobOffers).toHaveBeenLastCalledWith(defaultJobOfferParams);
      expect(screen.getByLabelText("Recherche")).toHaveValue("");
      expect(screen.getByLabelText("Filtrer par société")).toHaveValue("");
      expect(screen.getByLabelText("Filtrer par contrat")).toHaveValue("");
      expect(screen.getByLabelText("Trier par")).toHaveValue("createdAt");
      expect(screen.getByLabelText("Ordre")).toHaveValue("desc");
      expect(screen.getByLabelText("Par page")).toHaveValue("10");
      expect(window.location.search).toBe("");
    });
  });

  it("renders an existing job offer", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));

    renderJobOffersPage();

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
    expect(
      within(jobOfferCard).getByRole("link", {
        name: "Voir les candidatures",
      }),
    ).toHaveAttribute("href", `/applications?jobOfferId=${jobOffer.id}`);
  });

  it("creates a job offer and resets the form", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderJobOffersPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const creationSection = (
      await screen.findByRole("heading", { name: "Nouvelle offre" })
    ).closest("section");
    if (!creationSection) {
      throw new Error("Creation section not found");
    }
    expect(screen.getByLabelText("Titre")).not.toBeVisible();
    await user.click(
      within(creationSection).getByRole("button", {
        name: "Afficher Nouvelle offre",
      }),
    );

    await user.type(screen.getByLabelText("Titre"), "  Développeur React  ");
    await user.selectOptions(screen.getByLabelText("Société"), "1");
    await user.type(
      screen.getByLabelText("URL"),
      "https://example.com/jobs/react",
    );
    await user.type(screen.getByLabelText("Localisation"), "Paris");
    await user.selectOptions(screen.getByLabelText("Type de contrat"), "CDI");
    await user.type(screen.getByLabelText("Salaire"), "50 000 €");
    await user.click(
      within(creationSection).getByRole("button", {
        name: "Masquer Nouvelle offre",
      }),
    );
    await user.click(
      within(creationSection).getByRole("button", {
        name: "Afficher Nouvelle offre",
      }),
    );
    expect(screen.getByLabelText("Titre")).toHaveValue("  Développeur React  ");
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

  it("prefills the edit form with the existing job offer", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));
    const user = userEvent.setup();

    renderJobOffersPage();

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const cancelButton = screen.getByRole("button", { name: "Annuler" });
    const editForm = cancelButton.closest("form");

    expect(editForm).not.toBeNull();

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);

    expect(edit.getByLabelText("Titre")).toHaveValue(jobOffer.title);
    expect(edit.getByLabelText("Société")).toHaveValue(
      String(jobOffer.companyId),
    );
    expect(edit.getByLabelText("URL")).toHaveValue(jobOffer.url);
    expect(edit.getByLabelText("Description")).toHaveValue(
      jobOffer.description,
    );
    expect(edit.getByLabelText("Localisation")).toHaveValue(jobOffer.location);
    expect(edit.getByLabelText("Type de contrat")).toHaveValue(
      jobOffer.contractType,
    );
    expect(edit.getByLabelText("Salaire")).toHaveValue(jobOffer.salary);
    expect(edit.getByLabelText("Date de publication")).toHaveValue(
      expectedDatetimeLocal(jobOffer.publishedAt!),
    );
  });

  it("cancels editing without updating the job offer", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));
    const user = userEvent.setup();

    renderJobOffersPage();

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const cancelButton = screen.getByRole("button", { name: "Annuler" });
    const editForm = cancelButton.closest("form");

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);
    await user.clear(edit.getByLabelText("Titre"));
    await user.type(edit.getByLabelText("Titre"), "Titre temporaire");
    await user.clear(edit.getByLabelText("Localisation"));
    await user.type(edit.getByLabelText("Localisation"), "Marseille");
    await user.click(cancelButton);

    expect(
      screen.queryByRole("button", { name: "Annuler" }),
    ).not.toBeInTheDocument();
    expect(updateJobOffer).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: jobOffer.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Localisation : ${jobOffer.location}`),
    ).toBeInTheDocument();
  });

  it("updates a job offer and closes the edit form", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));
    const user = userEvent.setup();
    const { queryClient } = renderJobOffersPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const editForm = screen
      .getByRole("button", { name: "Annuler" })
      .closest("form");

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);
    await user.clear(edit.getByLabelText("Titre"));
    await user.type(
      edit.getByLabelText("Titre"),
      "  Développeur React Senior  ",
    );
    await user.selectOptions(edit.getByLabelText("Société"), "2");
    await user.clear(edit.getByLabelText("Localisation"));
    await user.type(edit.getByLabelText("Localisation"), "Lyon");
    await user.selectOptions(edit.getByLabelText("Type de contrat"), "CDD");
    await user.clear(edit.getByLabelText("Salaire"));
    await user.type(edit.getByLabelText("Salaire"), "60 000 €");
    await user.click(edit.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(updateJobOffer).toHaveBeenCalledTimes(1);
    });
    const [updatedId, updateInput] = vi.mocked(updateJobOffer).mock.calls[0];

    expect(updatedId).toBe(jobOffer.id);
    expect(updateInput).toEqual({
      title: "Développeur React Senior",
      companyId: secondCompany.id,
      url: jobOffer.url,
      description: jobOffer.description,
      location: "Lyon",
      contractType: "CDD",
      salary: "60 000 €",
      publishedAt: jobOffer.publishedAt,
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Annuler" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByText("Impossible de modifier l'offre."),
    ).not.toBeInTheDocument();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["job-offers"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["companies"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["applications"],
    });
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: ["dashboard-stats"],
    });
  });

  it("keeps editing open and refreshes data after a 404", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));
    vi.mocked(updateJobOffer).mockRejectedValue(createAxiosError(404));
    const user = userEvent.setup();
    const { queryClient } = renderJobOffersPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const editForm = screen
      .getByRole("button", { name: "Annuler" })
      .closest("form");

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    await user.click(
      within(editForm).getByRole("button", { name: "Enregistrer" }),
    );

    expect(
      await screen.findByText(
        "Impossible de modifier cette offre car elle ou la société sélectionnée n'existe plus.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["job-offers"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["companies"],
    });
  });

  it("deletes a job offer after confirmation", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderJobOffersPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      `Supprimer l'offre "${jobOffer.title}" ?`,
    );
    await waitFor(() => {
      expect(deleteJobOffer).toHaveBeenCalledTimes(1);
    });
    const [deletedId] = vi.mocked(deleteJobOffer).mock.calls[0];

    expect(deletedId).toBe(jobOffer.id);
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
    expect(
      screen.queryByText("Impossible de supprimer l'offre."),
    ).not.toBeInTheDocument();
  });

  it("does not delete a job offer when confirmation is cancelled", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    const { queryClient } = renderJobOffersPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(deleteJobOffer).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Impossible de supprimer l'offre."),
    ).not.toBeInTheDocument();
  });

  it("shows a conflict when a job offer has applications", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));
    vi.mocked(deleteJobOffer).mockRejectedValue(createAxiosError(409));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderJobOffersPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(
      await screen.findByText(
        "Cette offre ne peut pas être supprimée car elle est liée à une ou plusieurs candidatures.",
      ),
    ).toBeInTheDocument();
    expect(deleteJobOffer).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: jobOffer.title }),
    ).toBeInTheDocument();
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: ["job-offers"],
    });
  });

  it("refreshes job offers after a delete returns 404", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));
    vi.mocked(deleteJobOffer).mockRejectedValue(createAxiosError(404));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderJobOffersPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(
      await screen.findByText("Cette offre n'existe plus."),
    ).toBeInTheDocument();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["job-offers"],
    });
    expect(
      screen.queryByText(
        "Cette offre ne peut pas être supprimée car elle est liée à une ou plusieurs candidatures.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows a generic message when deleting fails unexpectedly", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(paginatedJobOffers([jobOffer]));
    vi.mocked(deleteJobOffer).mockRejectedValue(new Error("Unexpected error"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    renderJobOffersPage();

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(
      await screen.findByText("Impossible de supprimer l'offre."),
    ).toBeInTheDocument();
  });

  it("disables all job offer actions while deletion is pending", async () => {
    vi.mocked(getJobOffers).mockResolvedValue(
      paginatedJobOffers([jobOffer, secondJobOffer]),
    );
    let resolveDelete: ((value: JobOffer) => void) | undefined;
    const pendingDelete = new Promise<JobOffer>((resolve) => {
      resolveDelete = resolve;
    });
    vi.mocked(deleteJobOffer).mockReturnValue(pendingDelete);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    renderJobOffersPage();

    const deleteButtons = await screen.findAllByRole("button", {
      name: "Supprimer",
    });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(deleteJobOffer).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: "Suppression..." }),
      ).toBeDisabled();
    });

    for (const button of screen.getAllByRole("button", {
      name: /Supprimer|Suppression\.\.\./,
    })) {
      expect(button).toBeDisabled();
    }

    for (const button of screen.getAllByRole("button", { name: "Modifier" })) {
      expect(button).toBeDisabled();
    }

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(deleteJobOffer).toHaveBeenCalledTimes(1);

    if (!resolveDelete) {
      throw new Error("Delete resolver not initialized");
    }

    const resolvePendingDelete = resolveDelete;

    await act(async () => {
      resolvePendingDelete(jobOffer);
      await pendingDelete;
    });
  });
});
