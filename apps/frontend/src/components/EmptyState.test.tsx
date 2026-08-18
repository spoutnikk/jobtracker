import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  it("renders neutral empty-state content and accepts layout classes", () => {
    renderWithProviders(
      <EmptyState className="mt-6">Aucune candidature enregistrée.</EmptyState>,
    );

    const message = screen.getByText("Aucune candidature enregistrée.");

    expect(message).toHaveClass("text-gray-600", "mt-6");
  });
});
