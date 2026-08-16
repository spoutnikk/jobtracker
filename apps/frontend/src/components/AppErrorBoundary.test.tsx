import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";

let shouldThrow = false;

function ThrowingChild() {
  if (shouldThrow) {
    throw new Error("Unexpected render failure");
  }

  return <p>Contenu disponible</p>;
}

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its children when no error occurs", () => {
    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Contenu disponible")).toBeInTheDocument();
  });

  it("renders an accessible fallback after an unexpected render error", () => {
    shouldThrow = true;

    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Une erreur inattendue est survenue",
    );
    expect(
      screen.getByRole("button", { name: "Réessayer" }),
    ).toBeInTheDocument();
  });

  it("can retry rendering after an error", () => {
    shouldThrow = true;

    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>,
    );

    shouldThrow = false;

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(screen.getByText("Contenu disponible")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
