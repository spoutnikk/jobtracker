import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import StatusMessage from "./StatusMessage";

describe("StatusMessage", () => {
  it("announces a successful operation as a status", () => {
    renderWithProviders(
      <StatusMessage variant="success">Candidature créée.</StatusMessage>,
    );

    const message = screen.getByRole("status");

    expect(message).toHaveTextContent("Candidature créée.");
    expect(message).toHaveAttribute("aria-live", "polite");
    expect(message).toHaveClass("bg-green-50", "text-green-800");
  });

  it("announces an error as an alert", () => {
    renderWithProviders(
      <StatusMessage variant="error">
        Impossible de créer la candidature.
      </StatusMessage>,
    );

    const message = screen.getByRole("alert");

    expect(message).toHaveTextContent("Impossible de créer la candidature.");
    expect(message).toHaveAttribute("aria-live", "polite");
    expect(message).toHaveClass("bg-red-50", "text-red-700");
  });
});
