import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import PageLoadingState from "./PageLoadingState";

describe("PageLoadingState", () => {
  it("renders the loading message inside the page shell", () => {
    renderWithProviders(
      <PageLoadingState>Chargement des candidatures...</PageLoadingState>,
    );

    expect(
      screen.getByText("Chargement des candidatures..."),
    ).toBeInTheDocument();
  });
});
