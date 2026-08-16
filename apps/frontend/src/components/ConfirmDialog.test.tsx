import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { confirmDialog } from "./confirm-dialog";

describe("confirmDialog", () => {
  it("resolves true after confirmation", async () => {
    const user = userEvent.setup();
    let resultPromise!: Promise<boolean>;

    act(() => {
      resultPromise = confirmDialog("Supprimer cet élément ?");
    });

    expect(
      await screen.findByRole("dialog", { name: "Confirmer l’action" }),
    ).toBeInTheDocument();
    expect(document.body).toHaveStyle({ overflow: "hidden" });

    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await expect(resultPromise).resolves.toBe(true);
    expect(
      screen.queryByRole("dialog", { name: "Confirmer l’action" }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
  });

  it("resolves false when cancelled", async () => {
    const user = userEvent.setup();
    let resultPromise!: Promise<boolean>;

    act(() => {
      resultPromise = confirmDialog("Supprimer cet élément ?");
    });

    await user.click(await screen.findByRole("button", { name: "Annuler" }));

    await expect(resultPromise).resolves.toBe(false);
  });

  it("cancels with Escape and restores focus", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "Déclencheur";
    document.body.appendChild(trigger);
    trigger.focus();

    let resultPromise!: Promise<boolean>;
    act(() => {
      resultPromise = confirmDialog("Action sensible ?");
    });

    expect(
      await screen.findByRole("button", { name: "Annuler" }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");

    await expect(resultPromise).resolves.toBe(false);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("cancels when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    let resultPromise!: Promise<boolean>;

    act(() => {
      resultPromise = confirmDialog("Action sensible ?");
    });

    const dialog = await screen.findByRole("dialog", {
      name: "Confirmer l’action",
    });
    const backdrop = dialog.parentElement;

    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);

    await expect(resultPromise).resolves.toBe(false);
  });
});
