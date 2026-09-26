import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
  description,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  description?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup dialog"
        className="dialog-backdrop absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`dialog-sheet relative z-10 flex max-h-[90vh] w-full flex-col ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-line px-5 py-4">
          <div className="min-w-0">
            <div className="mb-2 h-px w-10 bg-brass" aria-hidden />
            <h3 className="text-sm font-bold leading-snug text-ink">{title}</h3>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-ink-mute">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-sm p-1 text-ink-mute transition-colors hover:bg-paper hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
