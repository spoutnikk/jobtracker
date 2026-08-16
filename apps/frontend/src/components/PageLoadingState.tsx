import type { ReactNode } from "react";
import PageShell from "./PageShell";

interface PageLoadingStateProps {
  children: ReactNode;
}

function PageLoadingState({ children }: PageLoadingStateProps) {
  return (
    <PageShell>
      <p>{children}</p>
    </PageShell>
  );
}

export default PageLoadingState;
