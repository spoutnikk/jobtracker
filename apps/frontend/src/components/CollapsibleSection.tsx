import { useId, useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen: boolean;
  children: ReactNode;
}

function CollapsibleSection({
  title,
  defaultOpen,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          type="button"
          aria-label={`${isOpen ? "Masquer" : "Afficher"} ${title}`}
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((currentValue) => !currentValue)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          {isOpen ? "Masquer" : "Afficher"}
        </button>
      </div>
      <div id={contentId} hidden={!isOpen}>
        {children}
      </div>
    </section>
  );
}

export default CollapsibleSection;
