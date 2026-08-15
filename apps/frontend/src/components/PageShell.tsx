import type { ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
  width?: "default" | "narrow";
}

function PageShell({ children, width = "default" }: PageShellProps) {
  const maxWidthClassName = width === "narrow" ? "max-w-4xl" : "max-w-5xl";

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className={`mx-auto ${maxWidthClassName}`}>{children}</div>
    </main>
  );
}

export default PageShell;
