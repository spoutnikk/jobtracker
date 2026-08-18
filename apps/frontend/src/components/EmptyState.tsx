import type { ReactNode } from "react";

interface EmptyStateProps {
  children: ReactNode;
  className?: string;
}

function EmptyState({ children, className = "" }: EmptyStateProps) {
  return <p className={`text-gray-600 ${className}`.trim()}>{children}</p>;
}

export default EmptyState;
