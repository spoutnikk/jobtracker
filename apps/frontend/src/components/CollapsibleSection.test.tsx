import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import CollapsibleSection from "./CollapsibleSection";

describe("CollapsibleSection", () => {
  it("shows content by default and exposes coherent accessibility attributes", () => {
    renderWithProviders(
      <CollapsibleSection title="Filtres" defaultOpen>
        <p>Contenu des filtres</p>
      </CollapsibleSection>,
    );

    const button = screen.getByRole("button", { name: "Masquer Filtres" });
    const content = screen.getByText("Contenu des filtres").parentElement;

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", content?.id);
    expect(content).toBeVisible();
  });

  it("toggles initially hidden content while preserving its child state", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <CollapsibleSection title="Nouvelle candidature" defaultOpen={false}>
        <label>
          Nom
          <input />
        </label>
      </CollapsibleSection>,
    );

    const showButton = screen.getByRole("button", {
      name: "Afficher Nouvelle candidature",
    });

    expect(showButton).toHaveAttribute("aria-expanded", "false");

    await user.click(showButton);
    const input = screen.getByRole("textbox", { name: "Nom" });
    const content = input.parentElement?.parentElement;

    expect(showButton).toHaveAttribute("aria-controls", content?.id);
    expect(content).toBeVisible();
    await user.type(input, "Acme");
    await user.click(
      screen.getByRole("button", { name: "Masquer Nouvelle candidature" }),
    );

    expect(
      screen.getByRole("button", { name: "Afficher Nouvelle candidature" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(content).not.toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Afficher Nouvelle candidature" }),
    );

    expect(content).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveValue("Acme");
  });
});
