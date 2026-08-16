import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import LoadingMessage from "./LoadingMessage";

describe("LoadingMessage", () => {
  it("renders an accessible loading status", () => {
    renderWithProviders(
      <LoadingMessage className="mt-4">
        Chargement de l'historique...
      </LoadingMessage>,
    );

    const status = screen.getByRole("status");

    expect(status).toHaveTextContent("Chargement de l'historique...");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("mt-4");
  });
});
