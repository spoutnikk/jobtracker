import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import Dialog from "./Dialog";

function Harness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>

      {open && (
        <Dialog
          onClose={() => setOpen(false)}
          ariaLabel="Dialogue de test"
          className="rounded-lg bg-white p-6"
        >
          <button type="button" autoFocus onClick={() => setOpen(false)}>
            Fermer
          </button>
        </Dialog>
      )}
    </>
  );
}

describe("Dialog", () => {
  it("renders an accessible modal and locks page scroll", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Ouvrir" }));

    expect(
      screen.getByRole("dialog", { name: "Dialogue de test" }),
    ).toHaveAttribute("aria-modal", "true");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus();
  });

  it("closes with Escape and restores focus", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    const trigger = screen.getByRole("button", { name: "Ouvrir" });
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Dialogue de test" }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
    expect(trigger).toHaveFocus();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Ouvrir" }));

    const dialog = screen.getByRole("dialog", { name: "Dialogue de test" });
    const backdrop = dialog.parentElement;

    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);

    expect(
      screen.queryByRole("dialog", { name: "Dialogue de test" }),
    ).not.toBeInTheDocument();
  });
});
