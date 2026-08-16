import type { Dispatch, SetStateAction } from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalLabel: string;
  onPageChange: Dispatch<SetStateAction<number>>;
}

function Pagination({
  page,
  totalPages,
  totalLabel,
  onPageChange,
}: PaginationProps) {
  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm"
    >
      <p className="text-gray-600">{totalLabel}</p>
      <p className="text-gray-600">
        Page {page} sur {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange((current) => Math.max(1, current - 1))}
          className="rounded-md border border-gray-300 px-4 py-2 disabled:opacity-50"
        >
          Précédent
        </button>
        <button
          type="button"
          disabled={totalPages === 0 || page >= totalPages}
          onClick={() =>
            onPageChange((current) => Math.min(totalPages, current + 1))
          }
          className="rounded-md border border-gray-300 px-4 py-2 disabled:opacity-50"
        >
          Suivant
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
