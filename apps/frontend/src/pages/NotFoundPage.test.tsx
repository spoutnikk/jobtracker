import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import NotFoundPage from "./NotFoundPage";

function renderNotFoundPage(initialEntry = "/missing") {
  const routes: RouteObject[] = [
    {
      path: "/",
      element: <p>Accueil JobTracker</p>,
    },
    {
      path: "*",
      element: <NotFoundPage />,
    },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: [initialEntry],
  });

  renderWithProviders(<RouterProvider router={router} />);

  return router;
}

describe("NotFoundPage", () => {
  it("renders a clear 404 message", () => {
    renderNotFoundPage();

    expect(
      screen.getByRole("heading", { name: "Page introuvable" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Erreur 404")).toBeInTheDocument();
    expect(
      screen.getByText(
        "La page demandée n’existe pas ou n’est plus disponible.",
      ),
    ).toBeInTheDocument();
  });

  it("returns to the home page", async () => {
    const router = renderNotFoundPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("link", { name: "Retour à l’accueil" }));

    expect(await screen.findByText("Accueil JobTracker")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
