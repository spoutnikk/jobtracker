import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import Pagination from "./Pagination";

function Harness({
  initialPage = 1,
  totalPages = 3,
}: {
  initialPage?: number;
  totalPages?: number;
}) {
  const [page, setPage] = useState(initialPage);
  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      totalLabel="42 éléments"
      onPageChange={setPage}
    />
  );
}

describe("Pagination", () => {
  it("renders the total and current page", () => {
    render(<Harness initialPage={2} totalPages={3} />);
    expect(screen.getByText("42 éléments")).toBeInTheDocument();
    expect(screen.getByText("Page 2 sur 3")).toBeInTheDocument();
  });
  it("navigates between pages and respects boundaries", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const previous = screen.getByRole("button", { name: "Précédent" });
    const next = screen.getByRole("button", { name: "Suivant" });
    expect(previous).toBeDisabled();
    await user.click(next);
    expect(screen.getByText("Page 2 sur 3")).toBeInTheDocument();
    await user.click(next);
    expect(screen.getByText("Page 3 sur 3")).toBeInTheDocument();
    expect(next).toBeDisabled();
  });
  it("disables navigation when there are no pages", () => {
    render(<Harness totalPages={0} />);
    expect(screen.getByRole("button", { name: "Précédent" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Suivant" })).toBeDisabled();
  });
});
