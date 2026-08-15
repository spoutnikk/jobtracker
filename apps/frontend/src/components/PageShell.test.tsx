import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import PageShell from "./PageShell";

describe("PageShell", () => {
  it("renders its content in the default page container", () => {
    renderWithProviders(
      <PageShell>
        <h1>Entreprises</h1>
      </PageShell>,
    );

    const heading = screen.getByRole("heading", { name: "Entreprises" });
    const container = heading.parentElement;

    expect(container).toHaveClass("mx-auto", "max-w-5xl");
    expect(container?.parentElement?.tagName).toBe("MAIN");
  });

  it("supports the narrow page width", () => {
    renderWithProviders(
      <PageShell width="narrow">
        <h1>Détail</h1>
      </PageShell>,
    );

    expect(
      screen.getByRole("heading", { name: "Détail" }).parentElement,
    ).toHaveClass("max-w-4xl");
  });
});
