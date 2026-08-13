import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApplication,
  deleteApplication,
  getApplications,
  type Application,
  type PaginatedApplications,
  updateApplication,
} from "../api/applications";
import {
  createApplicationEvent,
  getApplicationEvents,
} from "../api/application-events";
import { getAllJobOffers, type JobOffer } from "../api/job-offers";
import { renderWithProviders } from "../test/renderWithProviders";
import ApplicationsPage from "./ApplicationsPage";

vi.mock("../api/applications", () => ({
  createApplication: vi.fn(),
  deleteApplication: vi.fn(),
  getApplications: vi.fn(),
  updateApplication: vi.fn(),
}));

vi.mock("../api/job-offers", () => ({
  getAllJobOffers: vi.fn(),
}));

vi.mock("../api/application-events", () => ({
  createApplicationEvent: vi.fn(),
  getApplicationEvents: vi.fn(),
}));

function renderApplicationsPage(initialEntry = "/applications") {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ApplicationsPage />
    </MemoryRouter>,
  );
}

function QueryNavigationHarness() {
  const navigate = useNavigate();

  return (
    <>
      <button
        type="button"
        onClick={() =>
          navigate(
            `/applications?status=INTERVIEW&companyId=${company.id}&jobOfferId=${jobOffer.id}&search=React&createdFrom=2026-08-03T00%3A00%3A00.000Z&createdTo=2026-08-10T00%3A00%3A00.000Z`,
          )
        }
      >
        Appliquer les filtres URL
      </button>

      <button
        type="button"
        onClick={() => navigate("/applications?status=APPLIED&view=compact")}
      >
        Changer les filtres URL
      </button>

      <Routes>
        <Route path="/applications" element={<ApplicationsPage />} />
      </Routes>
    </>
  );
}

const company = {
  id: 1,
  name: "Acme",
  website: "https://acme.example.com",
  city: "Paris",
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
};

const jobOffer: JobOffer = {
  id: 10,
  title: "Développeur React",
  companyId: company.id,
  url: "https://example.com/jobs/react",
  description: "Développer une application React moderne.",
  location: "Paris",
  contractType: "CDI",
  salary: "50 000 €",
  publishedAt: "2026-08-10T08:00:00.000Z",
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
  company,
};

const application: Application = {
  id: 100,
  status: "APPLIED",
  appliedAt: "2026-08-12T00:00:00.000Z",
  source: "LinkedIn",
  notes: "Candidature prioritaire",
  contactName: "Alice Martin",
  contactEmail: "alice@example.com",
  followUpAt: null,
  interviewAt: null,
  createdAt: "2026-08-12T08:00:00.000Z",
  updatedAt: "2026-08-12T08:00:00.000Z",
  userId: 1,
  jobOfferId: jobOffer.id,
  jobOffer,
};

function paginatedApplications(
  items: Application[],
  overrides: Partial<PaginatedApplications> = {},
): PaginatedApplications {
  return {
    items,
    page: 1,
    pageSize: 10,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
    ...overrides,
  };
}

const defaultApplicationParams = {
  status: undefined,
  companyId: undefined,
  jobOfferId: undefined,
  search: undefined,
  createdFrom: undefined,
  createdTo: undefined,
  page: 1,
  pageSize: 10,
  sortBy: "createdAt",
  sortOrder: "desc",
};

describe("ApplicationsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getApplications).mockResolvedValue(
      paginatedApplications([application]),
    );
    vi.mocked(getAllJobOffers).mockResolvedValue([jobOffer]);
    vi.mocked(getApplicationEvents).mockResolvedValue([]);
    vi.mocked(createApplication).mockResolvedValue(application);
    vi.mocked(updateApplication).mockResolvedValue(application);
    vi.mocked(deleteApplication).mockResolvedValue(application);
    vi.mocked(createApplicationEvent).mockResolvedValue({
      id: 1,
      type: "NOTE",
      title: "Note",
      description: null,
      occurredAt: "2026-08-12T08:00:00.000Z",
      createdAt: "2026-08-12T08:00:00.000Z",
      applicationId: application.id,
    });
  });

  it("renders an existing application", async () => {
    renderApplicationsPage();

    const offerHeading = await screen.findByRole("heading", {
      name: jobOffer.title,
    });
    const applicationCard = offerHeading.closest("article");

    expect(applicationCard).not.toBeNull();

    if (!applicationCard) {
      throw new Error("Application card not found");
    }

    const card = within(applicationCard);

    expect(card.getByText(company.name)).toBeInTheDocument();
    expect(card.getByText("Envoyée")).toBeInTheDocument();
    expect(
      card.getByRole("link", { name: "Voir les détails" }),
    ).toHaveAttribute("href", `/applications/${application.id}`);
    expect(
      card.getByText(`Localisation : ${jobOffer.location}`),
    ).toBeInTheDocument();
    expect(
      card.getByText(`Contrat : ${jobOffer.contractType}`),
    ).toBeInTheDocument();
    expect(
      card.getByText(`Source : ${application.source}`),
    ).toBeInTheDocument();
    expect(
      card.getByText(`Contact : ${application.contactName}`),
    ).toBeInTheDocument();
    expect(card.getByText("Candidature envoyée")).toBeInTheDocument();
    expect(card.getByText("12 août 2026")).toBeInTheDocument();
    expect(card.queryByText("Relance prévue")).not.toBeInTheDocument();
    expect(card.queryByText("Entretien prévu")).not.toBeInTheDocument();
    expect(screen.getByText("1 candidatures")).toBeInTheDocument();
    expect(screen.getByText("Page 1 sur 1")).toBeInTheDocument();
  });

  it("renders scheduled follow-up and interview dates", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-13T10:00:00.000Z"));

    vi.mocked(getApplications).mockResolvedValue(
      paginatedApplications([
        {
          ...application,
          followUpAt: "2026-08-20T00:00:00.000Z",
          interviewAt: "2026-08-25T14:30:00.000Z",
        },
      ]),
    );

    renderApplicationsPage();

    const offerHeading = await screen.findByRole("heading", {
      name: jobOffer.title,
    });
    const applicationCard = offerHeading.closest("article");

    expect(applicationCard).not.toBeNull();

    if (!applicationCard) {
      throw new Error("Application card not found");
    }

    const card = within(applicationCard);

    expect(card.getByText("Relance prévue")).toBeInTheDocument();
    expect(card.getByText("20 août 2026")).toBeInTheDocument();
    expect(card.getByText("Entretien prévu")).toBeInTheDocument();
    expect(card.getByText(/25 août 2026.*16:30/)).toBeInTheDocument();
    expect(card.getAllByText("À venir")).toHaveLength(2);
  });

  it("renders past follow-ups and interviews as completed deadlines", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-26T10:00:00.000Z"));

    vi.mocked(getApplications).mockResolvedValue(
      paginatedApplications([
        {
          ...application,
          followUpAt: "2026-08-20T00:00:00.000Z",
          interviewAt: "2026-08-25T14:30:00.000Z",
        },
      ]),
    );

    renderApplicationsPage();

    const offerHeading = await screen.findByRole("heading", {
      name: jobOffer.title,
    });
    const applicationCard = offerHeading.closest("article");

    expect(applicationCard).not.toBeNull();

    if (!applicationCard) {
      throw new Error("Application card not found");
    }

    expect(within(applicationCard).getAllByText("Passée")).toHaveLength(2);
  });

  it("renders an empty state", async () => {
    vi.mocked(getApplications).mockResolvedValue(paginatedApplications([]));

    renderApplicationsPage();

    expect(
      await screen.findByText("Aucune candidature enregistrée."),
    ).toBeInTheDocument();
  });

  it("renders a loading error", async () => {
    vi.mocked(getApplications).mockRejectedValue(new Error("Load failed"));

    renderApplicationsPage();

    expect(
      await screen.findByText("Impossible de charger les candidatures."),
    ).toBeInTheDocument();
  });

  it("initializes filters from the URL", async () => {
    renderApplicationsPage(
      `/applications?status=INTERVIEW&companyId=${company.id}&jobOfferId=${jobOffer.id}&search=React&createdFrom=2026-08-03T00%3A00%3A00.000Z&createdTo=2026-08-10T00%3A00%3A00.000Z`,
    );

    await screen.findByRole("heading", { name: jobOffer.title });

    expect(screen.getByLabelText("Filtrer par statut")).toHaveValue(
      "INTERVIEW",
    );
    expect(screen.getByLabelText("Filtrer par société")).toHaveValue(
      String(company.id),
    );
    expect(screen.getByLabelText("Filtrer par offre")).toHaveValue(
      String(jobOffer.id),
    );
    expect(screen.getByLabelText("Recherche")).toHaveValue("React");

    await waitFor(() => {
      expect(getApplications).toHaveBeenLastCalledWith({
        ...defaultApplicationParams,
        status: "INTERVIEW",
        companyId: company.id,
        jobOfferId: jobOffer.id,
        search: "React",
        createdFrom: "2026-08-03T00:00:00.000Z",
        createdTo: "2026-08-10T00:00:00.000Z",
      });
    });
  });

  it("resets filters initialized from the URL", async () => {
    const user = userEvent.setup();

    renderApplicationsPage(
      `/applications?status=INTERVIEW&companyId=${company.id}&jobOfferId=${jobOffer.id}&search=React&view=compact`,
    );

    await screen.findByRole("heading", { name: jobOffer.title });
    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Filtrer par statut")).toHaveValue("");
      expect(screen.getByLabelText("Filtrer par société")).toHaveValue("");
      expect(screen.getByLabelText("Filtrer par offre")).toHaveValue("");
      expect(screen.getByLabelText("Recherche")).toHaveValue("");
      expect(getApplications).toHaveBeenLastCalledWith(
        defaultApplicationParams,
      );
    });
  });

  it("resynchronizes filters when the URL changes without remounting", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MemoryRouter initialEntries={["/applications"]}>
        <QueryNavigationHarness />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: jobOffer.title });

    await user.click(
      screen.getByRole("button", {
        name: "Appliquer les filtres URL",
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Filtrer par statut")).toHaveValue(
        "INTERVIEW",
      );
      expect(screen.getByLabelText("Filtrer par société")).toHaveValue(
        String(company.id),
      );
      expect(screen.getByLabelText("Filtrer par offre")).toHaveValue(
        String(jobOffer.id),
      );
      expect(screen.getByLabelText("Recherche")).toHaveValue("React");
      expect(getApplications).toHaveBeenLastCalledWith({
        ...defaultApplicationParams,
        status: "INTERVIEW",
        companyId: company.id,
        jobOfferId: jobOffer.id,
        search: "React",
        createdFrom: "2026-08-03T00:00:00.000Z",
        createdTo: "2026-08-10T00:00:00.000Z",
      });
    });

    await user.click(
      screen.getByRole("button", {
        name: "Changer les filtres URL",
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Filtrer par statut")).toHaveValue(
        "APPLIED",
      );
      expect(screen.getByLabelText("Filtrer par société")).toHaveValue("");
      expect(screen.getByLabelText("Filtrer par offre")).toHaveValue("");
      expect(screen.getByLabelText("Recherche")).toHaveValue("");
      expect(getApplications).toHaveBeenLastCalledWith({
        ...defaultApplicationParams,
        status: "APPLIED",
      });
    });
  });

  it("ignores invalid non-positive filter ids from the URL", async () => {
    renderApplicationsPage(
      "/applications?companyId=0&jobOfferId=-1&status=UNKNOWN",
    );

    await screen.findByRole("heading", { name: jobOffer.title });

    expect(screen.getByLabelText("Filtrer par statut")).toHaveValue("");
    expect(screen.getByLabelText("Filtrer par société")).toHaveValue("");
    expect(screen.getByLabelText("Filtrer par offre")).toHaveValue("");

    expect(getApplications).toHaveBeenLastCalledWith(defaultApplicationParams);
  });

  it.each([
    ["Filtrer par statut", "APPLIED", { status: "APPLIED" }],
    ["Filtrer par société", String(company.id), { companyId: company.id }],
    ["Filtrer par offre", String(jobOffer.id), { jobOfferId: jobOffer.id }],
  ] as const)(
    "requests applications with the %s filter",
    async (label, value, expectedFilter) => {
      const user = userEvent.setup();
      renderApplicationsPage();

      await screen.findByRole("heading", { name: jobOffer.title });
      await user.selectOptions(screen.getByLabelText(label), value);

      await waitFor(() => {
        expect(getApplications).toHaveBeenLastCalledWith(
          expect.objectContaining(expectedFilter),
        );
      });
    },
  );

  it("requests and navigates through paginated applications", async () => {
    vi.mocked(getApplications).mockImplementation(async (filters) =>
      paginatedApplications([application], {
        page: filters?.page ?? 1,
        total: 21,
        totalPages: 3,
      }),
    );
    const user = userEvent.setup();
    renderApplicationsPage();

    expect(await screen.findByText("21 candidatures")).toBeInTheDocument();
    expect(screen.getByText("Page 1 sur 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Précédent" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Suivant" })).toBeEnabled();
    expect(getApplications).toHaveBeenLastCalledWith(defaultApplicationParams);

    await user.click(screen.getByRole("button", { name: "Suivant" }));

    await waitFor(() => {
      expect(getApplications).toHaveBeenLastCalledWith({
        ...defaultApplicationParams,
        page: 2,
      });
      expect(screen.getByText("Page 2 sur 3")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Précédent" }));

    await waitFor(() => {
      expect(getApplications).toHaveBeenLastCalledWith(
        defaultApplicationParams,
      );
    });
  });

  it("disables next on the last page", async () => {
    vi.mocked(getApplications).mockResolvedValue(
      paginatedApplications([application], {
        page: 1,
        total: 1,
        totalPages: 1,
      }),
    );

    renderApplicationsPage();

    await screen.findByRole("heading", { name: jobOffer.title });
    expect(screen.getByRole("button", { name: "Suivant" })).toBeDisabled();
  });

  it("resets pagination when sorting or filtering changes", async () => {
    vi.mocked(getApplications).mockImplementation(async (filters) =>
      paginatedApplications([application], {
        page: filters?.page ?? 1,
        total: 21,
        totalPages: 3,
      }),
    );
    const user = userEvent.setup();
    renderApplicationsPage();

    await screen.findByRole("heading", { name: jobOffer.title });
    await user.click(screen.getByRole("button", { name: "Suivant" }));
    await waitFor(() => {
      expect(getApplications).toHaveBeenLastCalledWith({
        ...defaultApplicationParams,
        page: 2,
      });
    });

    await user.selectOptions(screen.getByLabelText("Trier par"), "status");
    await user.selectOptions(screen.getByLabelText("Ordre"), "asc");

    await waitFor(() => {
      expect(getApplications).toHaveBeenLastCalledWith({
        ...defaultApplicationParams,
        sortBy: "status",
        sortOrder: "asc",
      });
    });

    await user.click(screen.getByRole("button", { name: "Suivant" }));
    await user.selectOptions(
      screen.getByLabelText("Filtrer par statut"),
      "APPLIED",
    );

    await waitFor(() => {
      expect(getApplications).toHaveBeenLastCalledWith({
        ...defaultApplicationParams,
        status: "APPLIED",
        sortBy: "status",
        sortOrder: "asc",
      });
    });
  });

  it("resets sorting, page size, and page to their defaults", async () => {
    vi.mocked(getApplications).mockImplementation(async (filters) =>
      paginatedApplications([application], {
        page: filters?.page ?? 1,
        pageSize: filters?.pageSize ?? 10,
        total: 21,
        totalPages: 3,
      }),
    );
    const user = userEvent.setup();
    renderApplicationsPage();

    await screen.findByRole("heading", { name: jobOffer.title });
    await user.selectOptions(screen.getByLabelText("Trier par"), "status");
    await user.selectOptions(screen.getByLabelText("Ordre"), "asc");
    await user.selectOptions(screen.getByLabelText("Par page"), "20");
    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Trier par")).toHaveValue("createdAt");
      expect(screen.getByLabelText("Ordre")).toHaveValue("desc");
      expect(screen.getByLabelText("Par page")).toHaveValue("10");
      expect(getApplications).toHaveBeenLastCalledWith(
        defaultApplicationParams,
      );
    });
  });

  it("submits trimmed search text without querying on every character", async () => {
    const user = userEvent.setup();
    renderApplicationsPage();

    await screen.findByRole("heading", { name: jobOffer.title });
    const callsBeforeTyping = vi.mocked(getApplications).mock.calls.length;
    await user.type(screen.getByLabelText("Recherche"), "  React  ");
    expect(getApplications).toHaveBeenCalledTimes(callsBeforeTyping);
    await user.click(screen.getByRole("button", { name: "Rechercher" }));

    await waitFor(() => {
      expect(getApplications).toHaveBeenLastCalledWith({
        ...defaultApplicationParams,
        search: "React",
      });
    });
  });

  it("combines filters and resets them without ever sending userId", async () => {
    const user = userEvent.setup();
    renderApplicationsPage();

    await screen.findByRole("heading", { name: jobOffer.title });
    await user.selectOptions(
      screen.getByLabelText("Filtrer par statut"),
      "APPLIED",
    );
    await user.selectOptions(
      screen.getByLabelText("Filtrer par société"),
      String(company.id),
    );
    await user.selectOptions(
      screen.getByLabelText("Filtrer par offre"),
      String(jobOffer.id),
    );
    await user.type(screen.getByLabelText("Recherche"), "React");
    await user.click(screen.getByRole("button", { name: "Rechercher" }));

    await waitFor(() => {
      expect(getApplications).toHaveBeenLastCalledWith({
        ...defaultApplicationParams,
        status: "APPLIED",
        companyId: company.id,
        jobOfferId: jobOffer.id,
        search: "React",
      });
    });
    const [filters] = vi.mocked(getApplications).mock.calls.at(-1) ?? [];
    expect(filters).not.toHaveProperty("userId");

    const filtersSection = screen
      .getByRole("heading", { name: "Filtrer les candidatures" })
      .closest("section");
    if (!filtersSection) {
      throw new Error("Filters section not found");
    }
    const callsBeforeCollapse = vi.mocked(getApplications).mock.calls.length;
    await user.click(
      within(filtersSection).getByRole("button", {
        name: "Masquer Filtrer les candidatures",
      }),
    );
    expect(screen.getByLabelText("Filtrer par statut")).not.toBeVisible();
    expect(getApplications).toHaveBeenCalledTimes(callsBeforeCollapse);
    await user.click(
      within(filtersSection).getByRole("button", {
        name: "Afficher Filtrer les candidatures",
      }),
    );
    expect(screen.getByLabelText("Filtrer par statut")).toHaveValue("APPLIED");
    expect(screen.getByLabelText("Recherche")).toHaveValue("React");

    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));

    await waitFor(() => {
      expect(getApplications).toHaveBeenLastCalledWith(
        defaultApplicationParams,
      );
    });
  });

  it("distinguishes an empty filtered result", async () => {
    vi.mocked(getApplications).mockResolvedValue(paginatedApplications([]));
    const user = userEvent.setup();
    renderApplicationsPage();

    await screen.findByText("Aucune candidature enregistrée.");
    await user.selectOptions(
      screen.getByLabelText("Filtrer par statut"),
      "REJECTED",
    );

    expect(
      await screen.findByText("Aucun résultat pour ces filtres."),
    ).toBeInTheDocument();
  });

  it("creates an application with the selected job offer", async () => {
    vi.mocked(getApplications).mockResolvedValue(paginatedApplications([]));
    const user = userEvent.setup();
    const { queryClient } = renderApplicationsPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const creationSection = (
      await screen.findByRole("heading", { name: "Nouvelle candidature" })
    ).closest("section");
    if (!creationSection) {
      throw new Error("Creation section not found");
    }
    expect(screen.getByLabelText("Offre d'emploi")).not.toBeVisible();
    await user.click(
      within(creationSection).getByRole("button", {
        name: "Afficher Nouvelle candidature",
      }),
    );
    await user.selectOptions(
      screen.getByLabelText("Offre d'emploi"),
      String(jobOffer.id),
    );
    await user.selectOptions(screen.getByLabelText("Statut"), "APPLIED");
    await user.type(screen.getByLabelText("Source"), "LinkedIn");
    await user.click(
      within(creationSection).getByRole("button", {
        name: "Masquer Nouvelle candidature",
      }),
    );
    expect(screen.getByLabelText("Source")).not.toBeVisible();
    await user.click(
      within(creationSection).getByRole("button", {
        name: "Afficher Nouvelle candidature",
      }),
    );
    expect(screen.getByLabelText("Source")).toHaveValue("LinkedIn");
    await user.type(screen.getByLabelText("Date de candidature"), "2026-08-12");
    await user.click(
      screen.getByRole("button", { name: "Créer la candidature" }),
    );

    await waitFor(() => {
      expect(createApplication).toHaveBeenCalledTimes(1);
    });
    const [createInput] = vi.mocked(createApplication).mock.calls[0];

    expect(createInput).toEqual({
      jobOfferId: jobOffer.id,
      status: "APPLIED",
      source: "LinkedIn",
      appliedAt: "2026-08-12T00:00:00.000Z",
      notes: undefined,
      contactName: undefined,
      contactEmail: undefined,
      followUpAt: undefined,
      interviewAt: undefined,
    });
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["applications"],
      });
    });
  });

  it("updates the application status", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderApplicationsPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const editForm = screen
      .getByRole("button", { name: "Annuler" })
      .closest("form");

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);
    await user.selectOptions(edit.getByLabelText("Statut"), "ACCEPTED");
    await user.click(edit.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(updateApplication).toHaveBeenCalledTimes(1);
    });
    const [updatedId, updateInput] = vi.mocked(updateApplication).mock.calls[0];

    expect(updatedId).toBe(application.id);
    expect(updateInput).toEqual({
      status: "ACCEPTED",
      source: application.source,
      contactName: application.contactName,
      followUpAt: undefined,
      interviewAt: undefined,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["applications"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["follow-ups"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["interviews"],
    });
  });

  it("plans a follow-up date", async () => {
    const user = userEvent.setup();

    renderApplicationsPage();

    await user.click(await screen.findByRole("button", { name: "Modifier" }));
    const editForm = screen
      .getByRole("button", { name: "Annuler" })
      .closest("form");

    if (!editForm) {
      throw new Error("Edit form not found");
    }

    const edit = within(editForm);
    await user.type(edit.getByLabelText("Date de relance"), "2026-08-20");
    await user.click(edit.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(updateApplication).toHaveBeenCalledTimes(1);
    });
    const [updatedId, updateInput] = vi.mocked(updateApplication).mock.calls[0];

    expect(updatedId).toBe(application.id);
    expect(updateInput).toEqual({
      status: application.status,
      source: application.source,
      contactName: application.contactName,
      followUpAt: "2026-08-20T00:00:00.000Z",
      interviewAt: undefined,
    });
  });

  it("deletes an application after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderApplicationsPage();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      `Supprimer la candidature "${jobOffer.title}" ?`,
    );
    await waitFor(() => {
      expect(deleteApplication).toHaveBeenCalledTimes(1);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["applications"],
      });
    });
    const [deletedId] = vi.mocked(deleteApplication).mock.calls[0];

    expect(deletedId).toBe(application.id);
  });
});
