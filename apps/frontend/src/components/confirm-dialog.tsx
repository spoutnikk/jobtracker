import { createRoot } from "react-dom/client";
import { ConfirmDialog } from "./ConfirmDialog";

interface ConfirmDialogOptions {
  confirmLabel?: string;
  cancelLabel?: string;
}

export function confirmDialog(
  message: string,
  options: ConfirmDialogOptions = {},
): Promise<boolean> {
  const container = document.createElement("div");
  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  document.body.appendChild(container);
  const root = createRoot(container);

  return new Promise<boolean>((resolve) => {
    let settled = false;

    function finish(result: boolean) {
      if (settled) {
        return;
      }

      settled = true;
      root.unmount();
      container.remove();
      previouslyFocused?.focus();
      resolve(result);
    }

    root.render(
      <ConfirmDialog
        message={message}
        confirmLabel={options.confirmLabel}
        cancelLabel={options.cancelLabel}
        onConfirm={() => finish(true)}
        onCancel={() => finish(false)}
      />,
    );
  });
}
