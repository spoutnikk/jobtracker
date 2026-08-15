import type { ReactNode } from "react";

interface StatusMessageProps {
  variant: "success" | "error";
  children: ReactNode;
  className?: string;
}

function StatusMessage({
  variant,
  children,
  className = "",
}: StatusMessageProps) {
  const variantClassName =
    variant === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <p
      role={variant === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`rounded-md border px-3 py-2 text-sm ${variantClassName} ${className}`.trim()}
    >
      {children}
    </p>
  );
}

export default StatusMessage;
