import type { ReactNode } from "react";

interface LoadingMessageProps {
  children: ReactNode;
  className?: string;
}

function LoadingMessage({ children, className = "" }: LoadingMessageProps) {
  return (
    <p role="status" aria-live="polite" className={className}>
      {children}
    </p>
  );
}

export default LoadingMessage;
